/**
 * Snapshot tests for ReviewScreen, StartGameScreen, and BotGameScreen.
 *
 * Rules:
 * - react-test-renderer only (no @testing-library/react-native)
 * - All jest.mock() calls are hoisted before imports by babel-jest
 * - Mocks mirror the patterns established in screens.snapshot.test.tsx
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// react-native-view-shot — captureRef is called in ReviewScreen's export handler.
// The __mocks__ auto-mock already covers it, but an explicit override keeps
// the intent clear and satisfies TypeScript's module resolution.
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn().mockResolvedValue('file:///mock-recap.png'),
  captureScreen: jest.fn().mockResolvedValue('file:///mock-screen.png'),
}));

// @react-native-clipboard/clipboard — ReviewScreen.handleCopyPGN calls Clipboard.setString.
jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {
    setString: jest.fn(),
    getString: jest.fn().mockResolvedValue(''),
  },
}));

// useTheme — return the DARK palette for every screen in this file.
jest.mock('../../src/ui/theme', () => {
  const DARK = {
    bg: '#16213e',
    bgCard: '#0f3460',
    bgAccent: '#1a1a2e',
    text: '#e2e8f0',
    textMuted: '#a0aec0',
    textFaint: '#718096',
    accent: '#4299e1',
    accentCta: '#6daf48',
    accentGreen: '#48bb78',
    accentRed: '#fc8181',
    accentGold: '#fbd38d',
    border: '#2d3748',
  };
  return {
    DARK,
    LIGHT: DARK,
    useTheme: jest.fn(() => DARK),
    loadThemePreference: jest.fn().mockResolvedValue('dark'),
    saveThemePreference: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../../src/domain/gameService', () => ({
  useGameService: jest.fn(() => ({
    core: {
      getLegalMovesFrom: jest.fn(() => []),
      applyMove: jest.fn(() => null),
      undoMove: jest.fn(),
      startClock: jest.fn(),
      pauseClock: jest.fn(),
      resumeClock: jest.fn(),
      updateClock: jest.fn(),
      getState: jest.fn(() => ({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        result: '*',
        moves: [],
        clock: { whiteMs: 180_000, blackMs: 180_000, activeColor: null, isRunning: false },
        pgn: '',
      })),
      isGameOver: jest.fn(() => ({ over: false, result: '*' })),
      exportPGN: jest.fn(() => ''),
    },
    gameState: {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      result: '*',
      moves: [],
      clock: { whiteMs: 180_000, blackMs: 180_000, activeColor: null, isRunning: false },
      pgn: '',
    },
    gameId: 'test-game-id',
    isLoading: false,
    error: null,
    startNewGame: jest.fn().mockResolvedValue('new-game-id'),
    applyMove: jest.fn(() => true),
    undoMove: jest.fn(),
    startClock: jest.fn(),
    endGame: jest.fn(),
    reset: jest.fn(),
    loadGame: jest.fn().mockResolvedValue(undefined),
    checkForActiveGame: jest.fn().mockResolvedValue(null),
    pauseGame: jest.fn(),
    resumeGame: jest.fn(),
    exportPGN: jest.fn(() => ''),
    syncToFen: jest.fn(),
  })),
}));

// BotEngine — BotGameScreen constructs instances in useEffect and handleHint.
// Mock the class so no real Chess logic runs in tests.
jest.mock('../../src/domain/botEngine', () => {
  const MockBotEngine = jest.fn().mockImplementation(() => ({
    getBestMove: jest.fn().mockResolvedValue('e2e4'),
    destroy: jest.fn(),
  }));
  return { BotEngine: MockBotEngine };
});

// getSettings — BotGameScreen loads assistLevel on mount.
jest.mock('../../src/domain/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({
    cloudEndpointUrl: '',
    apiKey: '',
    analysisModeDefault: 'auto',
    enableLLMExplanations: false,
    assistLevel: 'off',
    defaultBotDifficulty: 'intermediate',
    enableRefereeMode: true,
    colorScheme: 'system',
    darkMode: true,
  }),
  saveSettings: jest.fn().mockResolvedValue(undefined),
  DEFAULT_SETTINGS: {
    cloudEndpointUrl: '',
    apiKey: '',
    analysisModeDefault: 'auto',
    enableLLMExplanations: false,
    assistLevel: 'off',
    defaultBotDifficulty: 'intermediate',
    enableRefereeMode: true,
    colorScheme: 'system',
    darkMode: true,
  },
}));

// getComment — BotGameScreen calls this after each player move.
jest.mock('../../src/domain/commentator', () => ({
  getComment: jest.fn().mockResolvedValue(null),
}));

// BoardDiagram, Clock, MoveList — heavy components; stub to prevent snapshot
// serializer overflow and circular-reference errors from their internal state.
jest.mock('../../src/ui/components/BoardDiagram', () => ({
  BoardDiagram: () => null,
}));
jest.mock('../../src/ui/components/Clock', () => ({
  Clock: () => null,
}));
jest.mock('../../src/ui/components/MoveList', () => ({
  MoveList: () => null,
}));

// repositories — ReviewScreen calls getGame, getMovesForGame, getAnalysis on mount.
// Return a minimal completed game row so the full render path (not the error/loading path)
// executes, giving us a richer snapshot.
const MOCK_GAME_ROW = {
  id: 'game-snap-001',
  mode: 'otb',
  pgn: '1. e4 e5 2. Nf3 Nc6',
  result: '1-0',
  player_white: 'Alice',
  player_black: 'Bob',
  white_ms: 0,
  black_ms: 0,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_001_000,
};

const MOCK_MOVE_ROWS = [
  {
    id: 'm1',
    game_id: 'game-snap-001',
    san: 'e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    from_sq: 'e2',
    to_sq: 'e4',
    promotion: null,
    move_number: 1,
    white_ms_after: 0,
    black_ms_after: 0,
    created_at: 1_700_000_000_100,
  },
  {
    id: 'm2',
    game_id: 'game-snap-001',
    san: 'e5',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    from_sq: 'e7',
    to_sq: 'e5',
    promotion: null,
    move_number: 1,
    white_ms_after: 0,
    black_ms_after: 0,
    created_at: 1_700_000_000_200,
  },
];

jest.mock('../../src/data/repositories', () => ({
  createGame: jest.fn((data: any) => ({
    ...data,
    id: 'game-snap-001',
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_001_000,
  })),
  getGame: jest.fn(() => MOCK_GAME_ROW),
  updateGame: jest.fn(),
  listGames: jest.fn(() => [MOCK_GAME_ROW]),
  getActiveGame: jest.fn(() => null),
  deleteGame: jest.fn(),
  getGameStats: jest.fn(() => ({ wins: 1, draws: 0, losses: 0, total: 1 })),
  saveMove: jest.fn((m: any) => ({ ...m, id: 'mv-mock', created_at: Date.now() })),
  getMovesForGame: jest.fn(() => MOCK_MOVE_ROWS),
  deleteLastMove: jest.fn(),
  saveAnalysis: jest.fn(),
  getAnalysis: jest.fn(() => null),
  updateAnalysis: jest.fn(),
  saveSession: jest.fn(),
  getSessionForGame: jest.fn(() => null),
}));

// db — ReviewScreen awaits initDb() before reading rows.
jest.mock('../../src/data/db', () => ({
  initDb: jest.fn().mockResolvedValue(undefined),
  getDb: jest.fn(),
  closeDb: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import React from 'react';
import renderer from 'react-test-renderer';

import { ReviewScreen } from '../../src/ui/screens/ReviewScreen';
import { StartGameScreen } from '../../src/ui/screens/StartGameScreen';
import { BotGameScreen } from '../../src/ui/screens/BotGameScreen';

// ── Shared navigation stub ────────────────────────────────────────────────────

function makeNav() {
  return {
    replace: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
    push: jest.fn(),
    pop: jest.fn(),
    popToTop: jest.fn(),
    dispatch: jest.fn(),
    setOptions: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    removeListener: jest.fn(),
    isFocused: jest.fn(() => true),
    canGoBack: jest.fn(() => false),
    getParent: jest.fn(() => undefined),
    getState: jest.fn(() => ({ routes: [], index: 0, key: 'stack', type: 'stack' })),
    reset: jest.fn(),
  } as unknown as any;
}

// ── ReviewScreen ──────────────────────────────────────────────────────────────

describe('ReviewScreen — snapshots', () => {
  test(
    'renders game summary with DARK theme (snapshot)',
    async () => {
      const navigation = makeNav();
      const route = {
        key: 'Review',
        name: 'Review',
        params: { gameId: 'game-snap-001' },
      } as any;

      let tree!: renderer.ReactTestRenderer;
      await renderer.act(async () => {
        tree = renderer.create(<ReviewScreen navigation={navigation} route={route} />);
      });

      expect(tree.toJSON()).toMatchSnapshot();
    },
    15_000,
  );

  test('renders player names and Share PGN button after data loads', async () => {
    const navigation = makeNav();
    const route = {
      key: 'Review',
      name: 'Review',
      params: { gameId: 'game-snap-001' },
    } as any;

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<ReviewScreen navigation={navigation} route={route} />);
    });

    const json = JSON.stringify(tree.toJSON());
    // Player names from MOCK_GAME_ROW
    expect(json).toContain('Alice');
    expect(json).toContain('Bob');
    // Export buttons always rendered after data loads
    expect(json).toContain('Share PGN');
  });
});

// ── StartGameScreen ───────────────────────────────────────────────────────────

describe('StartGameScreen — snapshots', () => {
  test(
    'renders game-mode menu with DARK theme (snapshot)',
    async () => {
      const navigation = makeNav();
      const route = {
        key: 'StartGame',
        name: 'StartGame',
        params: undefined,
      } as any;

      let tree!: renderer.ReactTestRenderer;
      await renderer.act(async () => {
        tree = renderer.create(<StartGameScreen navigation={navigation} route={route} />);
      });

      expect(tree.toJSON()).toMatchSnapshot();
    },
    15_000,
  );

  test('renders all five game-mode cards', async () => {
    const navigation = makeNav();
    const route = {
      key: 'StartGame',
      name: 'StartGame',
      params: undefined,
    } as any;

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<StartGameScreen navigation={navigation} route={route} />);
    });

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Choose Mode');
    expect(json).toContain('Over the Board');
    expect(json).toContain('Play vs Bot');
    expect(json).toContain('Multiplayer');
    expect(json).toContain('Drills');
    expect(json).toContain('Tactics');
  });
});

// ── BotGameScreen ─────────────────────────────────────────────────────────────

describe('BotGameScreen — snapshots', () => {
  test('renders board and controls with DARK theme (snapshot)', async () => {
    const navigation = makeNav();
    const route = {
      key: 'BotGame',
      name: 'BotGame',
      params: { gameId: 'test-game-id', difficulty: 'intermediate' as const },
    } as any;

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<BotGameScreen navigation={navigation} route={route} />);
    });

    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('renders bot label and resign button', async () => {
    const navigation = makeNav();
    const route = {
      key: 'BotGame',
      name: 'BotGame',
      params: { gameId: 'test-game-id', difficulty: 'intermediate' as const },
    } as any;

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<BotGameScreen navigation={navigation} route={route} />);
    });

    const texts: string[] = [];
    const collect = (
      node: renderer.ReactTestRendererJSON | renderer.ReactTestRendererJSON[] | null,
    ) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (typeof node === 'string') {
        texts.push(node as unknown as string);
        return;
      }
      (node.children ?? []).forEach(c => collect(c as renderer.ReactTestRendererJSON));
    };
    collect(tree.toJSON());
    const flat = texts.join('');
    // Bot side label includes the difficulty
    expect(flat).toContain('Bot (intermediate)');
    // Undo and Resign controls are always visible
    expect(flat).toContain('Undo');
    expect(flat).toContain('Resign');
  });
});
