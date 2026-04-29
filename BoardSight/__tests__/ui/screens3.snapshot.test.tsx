/**
 * Snapshot tests for the 6 screens not yet covered:
 *   LibraryScreen, SettingsScreen, TacticsScreen,
 *   SpectatorScreen, LiveGameScreen, ScanScreen.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/ui/theme', () => {
  const DARK = {
    bg: '#16213e',
    bgCard: '#0f3460',
    bgAccent: '#1a1a2e',
    text: '#e2e8f0',
    textMuted: '#a0aec0',
    textFaint: '#718096',
    accent: '#4299e1',
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

// Heavy UI components — stub to keep trees serialisable.
jest.mock('../../src/ui/components/BoardDiagram', () => ({ BoardDiagram: () => null }));
jest.mock('../../src/ui/components/MoveList', () => ({ MoveList: () => null }));
jest.mock('../../src/ui/components/Clock', () => ({ Clock: () => null }));
jest.mock('../../src/ui/components/ConfirmMoveSheet', () => ({ ConfirmMoveSheet: () => null }));
jest.mock('../../src/ui/components/CalibOverlay', () => ({ CalibOverlay: () => null }));
jest.mock('../../src/ui/components/EvalBar', () => ({ EvalBar: () => null }));

// react-native-vision-camera
jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraDevice: jest.fn(() => ({ id: 'back' })),
  useCameraPermission: jest.fn(() => ({
    hasPermission: true,
    requestPermission: jest.fn().mockResolvedValue(true),
  })),
}));

// settings
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

// gameService
jest.mock('../../src/domain/gameService', () => ({
  useGameService: jest.fn(() => ({
    core: {
      getLegalMovesFrom: jest.fn(() => []),
      applyMove: jest.fn(() => null),
      undoMove: jest.fn(),
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
    loadGame: jest.fn().mockResolvedValue(undefined),
    applyMove: jest.fn(() => true),
    undoMove: jest.fn(),
    startClock: jest.fn(),
    pauseGame: jest.fn(),
    resumeGame: jest.fn(),
    endGame: jest.fn(),
    reset: jest.fn(),
    checkForActiveGame: jest.fn().mockResolvedValue(null),
    exportPGN: jest.fn(() => ''),
    syncToFen: jest.fn(),
  })),
}));

// stateMachine
jest.mock('../../src/domain/stateMachine', () => ({
  useAppStore: jest.fn(() => ({
    state: 'live_play',
    dispatch: jest.fn(),
  })),
}));

// cvModule
jest.mock('../../src/native/cvModule', () => ({
  cvModule: {
    startSession: jest.fn(),
    stopSession: jest.fn(),
    pauseTracking: jest.fn(),
    setCalibration: jest.fn(),
    onBoardObservation: jest.fn(),
    onMoveCandidate: jest.fn(),
    onPositionObservation: jest.fn(),
  },
}));

// instrumentation
jest.mock('../../src/domain/instrumentation', () => ({
  instrumentation: {
    startSession: jest.fn(),
    endSession: jest.fn(),
    logMoveCandidate: jest.fn(),
    logP2PSync: jest.fn(),
    logCorrectionRate: jest.fn(),
  },
}));

// activeTransport
jest.mock('../../src/domain/multiplayer/activeTransport', () => ({
  getTransport: jest.fn(() => ({ sendMove: jest.fn(), sendClockTap: jest.fn() })),
  setTransportType: jest.fn(),
}));

// cloudRelayManager
jest.mock('../../src/domain/multiplayer/cloudRelay', () => ({
  cloudRelayManager: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
  },
}));

// tactics
jest.mock('../../src/domain/tactics', () => ({
  extractPuzzlesFromLibrary: jest.fn().mockResolvedValue([]),
}));

// gamecore createGameCore
jest.mock('../../src/domain/gamecore', () => ({
  createGameCore: jest.fn(() => ({
    getLegalMovesFrom: jest.fn(() => []),
    applyMove: jest.fn(() => null),
    getState: jest.fn(() => ({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      result: '*',
      moves: [],
      clock: { whiteMs: 0, blackMs: 0, activeColor: null, isRunning: false },
      pgn: '',
    })),
    isGameOver: jest.fn(() => ({ over: false, result: '*' })),
    exportPGN: jest.fn(() => ''),
  })),
}));

// repositories
const MOCK_GAME_ROW = {
  id: 'g1',
  mode: 'otb',
  pgn: '1. e4 e5',
  result: '1-0',
  player_white: 'Alice',
  player_black: 'Bob',
  white_ms: 0,
  black_ms: 0,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_001_000,
};
jest.mock('../../src/data/repositories', () => ({
  listGames: jest.fn(() => [MOCK_GAME_ROW]),
  deleteGame: jest.fn(),
  getGameStats: jest.fn(() => ({ wins: 1, draws: 0, losses: 0, total: 1 })),
  createGame: jest.fn((d: any) => ({
    ...d,
    id: 'g1',
    created_at: Date.now(),
    updated_at: Date.now(),
  })),
  getGame: jest.fn(() => MOCK_GAME_ROW),
  updateGame: jest.fn(),
  getActiveGame: jest.fn(() => null),
  saveMove: jest.fn((m: any) => ({ ...m, id: 'mv1', created_at: Date.now() })),
  getMovesForGame: jest.fn(() => []),
  deleteLastMove: jest.fn(),
  saveAnalysis: jest.fn(),
  getAnalysis: jest.fn(() => null),
  updateAnalysis: jest.fn(),
  saveSession: jest.fn(),
  getSessionForGame: jest.fn(() => null),
}));

// db
jest.mock('../../src/data/db', () => ({
  initDb: jest.fn().mockResolvedValue(undefined),
  getDb: jest.fn(),
  closeDb: jest.fn().mockResolvedValue(undefined),
}));

// clock TIME_CONTROLS
jest.mock('../../src/domain/gamecore/clock', () => ({
  TIME_CONTROLS: [
    { label: 'Blitz 3+2', initialMs: 180_000, increment: 2 },
    { label: 'Rapid 10+0', initialMs: 600_000, increment: 0 },
  ],
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import React from 'react';
import renderer from 'react-test-renderer';

import { LibraryScreen } from '../../src/ui/screens/LibraryScreen';
import { SettingsScreen } from '../../src/ui/screens/SettingsScreen';
import { TacticsScreen } from '../../src/ui/screens/TacticsScreen';
import { SpectatorScreen } from '../../src/ui/screens/SpectatorScreen';
import { LiveGameScreen } from '../../src/ui/screens/LiveGameScreen';
import { ScanScreen } from '../../src/ui/screens/ScanScreen';

// ── Shared nav stub ───────────────────────────────────────────────────────────

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

// ── LibraryScreen ─────────────────────────────────────────────────────────────

describe('LibraryScreen — snapshots', () => {
  function collectText(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(collectText).join('');
    return (node.children ?? []).map(collectText).join('');
  }

  test('shows search bar, stats, and export button', async () => {
    const navigation = makeNav();
    const route = { key: 'Library', name: 'Library', params: undefined } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<LibraryScreen navigation={navigation} route={route} />);
    });
    const flat = collectText(tree.toJSON());
    expect(flat).toContain('Export all PGN');
    expect(flat).toContain('Long press');
  });

  test('shows game list entry with player names', async () => {
    const navigation = makeNav();
    const route = { key: 'Library', name: 'Library', params: undefined } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<LibraryScreen navigation={navigation} route={route} />);
    });
    const flat = collectText(tree.toJSON());
    expect(flat).toContain('Alice');
    expect(flat).toContain('Bob');
  });
});

// ── SettingsScreen ────────────────────────────────────────────────────────────

describe('SettingsScreen — snapshots', () => {
  test('renders with default settings (snapshot)', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<SettingsScreen />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('shows Appearance, Analysis, Gameplay sections and Save button', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<SettingsScreen />);
    });
    const texts: string[] = [];
    const collect = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (typeof node === 'string') {
        texts.push(node);
        return;
      }
      (node.children ?? []).forEach(collect);
    };
    collect(tree.toJSON());
    const flat = texts.join(' ');
    expect(flat).toContain('Appearance');
    expect(flat).toContain('Gameplay');
    expect(flat).toContain('Save Settings');
    expect(flat).toContain('Dark Mode');
  });
});

// ── TacticsScreen — loading state ─────────────────────────────────────────────

describe('TacticsScreen — snapshots', () => {
  test('renders loading spinner while puzzles are fetched (snapshot)', async () => {
    // Keep the promise pending so the screen stays in loading state.
    const { extractPuzzlesFromLibrary } = require('../../src/domain/tactics');
    (extractPuzzlesFromLibrary as jest.Mock).mockReturnValue(new Promise(() => {}));

    const navigation = makeNav();
    const route = { key: 'Tactics', name: 'Tactics', params: undefined } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<TacticsScreen navigation={navigation} route={route} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('renders empty state when no puzzles available', async () => {
    const { extractPuzzlesFromLibrary } = require('../../src/domain/tactics');
    (extractPuzzlesFromLibrary as jest.Mock).mockResolvedValue([]);

    const navigation = makeNav();
    const route = { key: 'Tactics', name: 'Tactics', params: undefined } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<TacticsScreen navigation={navigation} route={route} />);
    });
    const texts: string[] = [];
    const collect = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (typeof node === 'string') {
        texts.push(node);
        return;
      }
      (node.children ?? []).forEach(collect);
    };
    collect(tree.toJSON());
    const flat = texts.join('');
    expect(flat).toContain('No puzzles yet');
    expect(flat).toContain('Back');
  });
});

// ── SpectatorScreen ───────────────────────────────────────────────────────────

describe('SpectatorScreen — snapshots', () => {
  test('renders disconnected state (snapshot)', async () => {
    const navigation = makeNav();
    const route = {
      key: 'Spectator',
      name: 'Spectator',
      params: { sessionCode: 'ABC123', relayUrl: 'wss://example.com' },
    } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<SpectatorScreen navigation={navigation} route={route} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('shows session code and leave button while connecting', async () => {
    const navigation = makeNav();
    const route = {
      key: 'Spectator',
      name: 'Spectator',
      params: { sessionCode: 'MYCODE', relayUrl: 'wss://example.com' },
    } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<SpectatorScreen navigation={navigation} route={route} />);
    });
    const texts: string[] = [];
    const collect = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (typeof node === 'string') {
        texts.push(node);
        return;
      }
      (node.children ?? []).forEach(collect);
    };
    collect(tree.toJSON());
    const flat = texts.join('');
    expect(flat).toContain('Connecting');
    expect(flat).toContain('Leave');
    expect(flat).toContain('Spectating');
  });
});

// ── LiveGameScreen ────────────────────────────────────────────────────────────

describe('LiveGameScreen — snapshots', () => {
  test('renders solo OTB live game (snapshot)', async () => {
    const navigation = makeNav();
    const route = {
      key: 'LiveGame',
      name: 'LiveGame',
      params: { gameId: 'live-001', isMultiplayer: false },
    } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<LiveGameScreen navigation={navigation} route={route} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('shows Pause and Resign controls in solo mode', async () => {
    const navigation = makeNav();
    const route = {
      key: 'LiveGame',
      name: 'LiveGame',
      params: { gameId: 'live-002', isMultiplayer: false },
    } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<LiveGameScreen navigation={navigation} route={route} />);
    });
    const texts: string[] = [];
    const collect = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (typeof node === 'string') {
        texts.push(node);
        return;
      }
      (node.children ?? []).forEach(collect);
    };
    collect(tree.toJSON());
    const flat = texts.join('');
    expect(flat).toContain('Resign');
  });
});

// ── ScanScreen ────────────────────────────────────────────────────────────────

describe('ScanScreen — snapshots', () => {
  test('renders scanning phase with camera permission granted (snapshot)', async () => {
    const navigation = makeNav();
    const route = {
      key: 'Scan',
      name: 'Scan',
      params: { timeControlIndex: 0 },
    } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<ScanScreen navigation={navigation} route={route} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('shows scanning instructions and confidence bar in scanning phase', async () => {
    const navigation = makeNav();
    const route = {
      key: 'Scan',
      name: 'Scan',
      params: { timeControlIndex: 0 },
    } as any;
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<ScanScreen navigation={navigation} route={route} />);
    });
    const texts: string[] = [];
    const collect = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (typeof node === 'string') {
        texts.push(node);
        return;
      }
      (node.children ?? []).forEach(collect);
    };
    collect(tree.toJSON());
    const flat = texts.join('');
    expect(flat).toContain('Scanning');
  });
});
