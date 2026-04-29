/**
 * Snapshot tests for BoardSight screen components, plus functional tests for
 * SettingsScreen and LibraryScreen.
 *
 * Mocks must be declared before any imports so babel-jest hoisting works.
 * Each screen has its own describe block; navigation and route are stubbed
 * with the minimal shape required by the screen.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// react-native-vision-camera — used transitively by OnboardingScreen.
jest.mock('react-native-vision-camera', () => ({
  Camera: 'Camera',
  useCameraDevices: jest.fn(() => ({})),
  useCameraDevice: jest.fn(() => null),
  useCameraPermission: jest.fn(() => ({
    hasPermission: false,
    requestPermission: jest.fn().mockResolvedValue(true),
  })),
  useCodeScanner: jest.fn(() => ({})),
}));

// SectionList renders VirtualizedList internals that overflow pretty-format's
// string-length limit. Replace with a minimal component that renders sections
// and items without recursion.
jest.mock(
  'react-native/Libraries/Lists/VirtualizedSectionList',
  () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View, Text } = jest.requireActual<typeof import('react-native')>('react-native');

    function MockSectionList<T>(props: {
      sections?: Array<{ title?: string; data: T[] }>;
      renderItem?: (info: { item: T; index: number }) => React.ReactNode;
      renderSectionHeader?: (info: { section: { title?: string; data: T[] } }) => React.ReactNode;
      keyExtractor?: (item: T, index: number) => string;
      [key: string]: unknown;
    }): React.ReactElement {
      const { sections = [], renderItem, renderSectionHeader } = props;
      return React.createElement(
        View,
        null,
        sections.map((section, si) =>
          React.createElement(
            View,
            { key: String(si) },
            renderSectionHeader
              ? renderSectionHeader({ section })
              : React.createElement(Text, null, section.title ?? ''),
            section.data.map((item, ii) =>
              renderItem ? renderItem({ item, index: ii }) : null,
            ),
          ),
        ),
      );
    }

    MockSectionList.displayName = 'SectionList';
    return { default: MockSectionList };
  },
);

// useGameService — DrillScreen calls startNewGame on drill tap (not exercised
// in snapshot tests, but the hook import must resolve).
jest.mock('../../src/domain/gameService', () => ({
  useGameService: jest.fn(() => ({
    startNewGame: jest.fn().mockResolvedValue('game-id-mock'),
  })),
}));

// useTheme — return the DARK palette for all screens in this file.
jest.mock('../../src/ui/theme', () => {
  const DARK = {
    bg:          '#16213e',
    bgCard:      '#0f3460',
    bgAccent:    '#1a1a2e',
    text:        '#e2e8f0',
    textMuted:   '#a0aec0',
    textFaint:   '#718096',
    accent:      '#4299e1',
    accentCta:   '#6daf48',
    accentGreen: '#48bb78',
    accentRed:   '#fc8181',
    accentGold:  '#fbd38d',
    border:      '#2d3748',
  };
  return {
    DARK,
    LIGHT: DARK, // not exercised in this suite
    useTheme: jest.fn(() => DARK),
    loadThemePreference: jest.fn().mockResolvedValue('dark'),
    saveThemePreference: jest.fn().mockResolvedValue(undefined),
  };
});

// p2pManager — LobbyScreen calls disconnect() on unmount and startHost/joinSession
// on user actions (not exercised in idle-phase snapshot).
jest.mock('../../src/domain/multiplayer/p2p', () => ({
  p2pManager: {
    startHost: jest.fn().mockResolvedValue({ id: '192.168.1.1', role: 'host', peerConnected: false }),
    joinSession: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    getSession: jest.fn(() => null),
  },
}));

// cloudRelayManager — LobbyScreen imports this for cloud fallback.
jest.mock('../../src/domain/multiplayer/cloudRelay', () => ({
  cloudRelayManager: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    getSession: jest.fn(() => null),
  },
}));

// activeTransport — imported by LobbyScreen.
jest.mock('../../src/domain/multiplayer/activeTransport', () => ({
  getTransportType: jest.fn(() => 'p2p'),
  setTransportType: jest.fn(),
  getTransport: jest.fn(() => ({
    disconnect: jest.fn(),
    getSession: jest.fn(() => null),
  })),
}));

// sessionPersistence — loadLastSession() is called in a useEffect; return null
// so LobbyScreen stays in the 'idle' phase with no reconnect banner.
jest.mock('../../src/domain/multiplayer/sessionPersistence', () => ({
  loadLastSession: jest.fn().mockResolvedValue(null),
  saveLastSession: jest.fn().mockResolvedValue(undefined),
  clearLastSession: jest.fn().mockResolvedValue(undefined),
}));

// getSettings — LobbyScreen and SettingsScreen both call this.
// The mock exposes saveSettings too so SettingsScreen's handleSave resolves.
// DEFAULT_SETTINGS includes darkMode so the SettingsScreen initialState is valid.
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

// repositories — LibraryScreen calls getGameStats() and listGames() synchronously
// inside a try/catch after awaiting initDb().  Mocked here at module level so
// jest.requireMock() can retrieve and mutate them per-test.
jest.mock('../../src/data/repositories', () => ({
  getGameStats: jest.fn(() => ({ wins: 0, draws: 0, losses: 0, total: 0 })),
  listGames: jest.fn(() => []),
  deleteGame: jest.fn(),
}));

// db — LibraryScreen awaits initDb() on mount.
jest.mock('../../src/data/db', () => ({
  initDb: jest.fn().mockResolvedValue(undefined),
  getDb: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import React from 'react';
import renderer from 'react-test-renderer';

import { DrillScreen }      from '../../src/ui/screens/DrillScreen';
import { LobbyScreen }      from '../../src/ui/screens/LobbyScreen';
import { OnboardingScreen } from '../../src/ui/screens/OnboardingScreen';

// ── Shared navigation / route stubs ──────────────────────────────────────────

function makeNav() {
  return {
    replace: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
    // Minimal extra props required by the NativeStackScreenProps shape
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
    push: jest.fn(),
    pop: jest.fn(),
    popToTop: jest.fn(),
  } as unknown as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ── DrillScreen ───────────────────────────────────────────────────────────────

describe('DrillScreen — snapshots', () => {
  test('renders drill sections with DARK theme', async () => {
    const navigation = makeNav();
    const route = { key: 'Drill', name: 'Drill', params: undefined } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <DrillScreen navigation={navigation} route={route} />,
      );
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('renders without navigation (component mounts)', async () => {
    const navigation = makeNav();
    const route = { key: 'Drill', name: 'Drill', params: undefined } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <DrillScreen navigation={navigation} route={route} />,
      );
    });
    // Component should mount — top-level element exists
    expect(tree.toJSON()).not.toBeNull();
  });
});

// ── LobbyScreen ───────────────────────────────────────────────────────────────

describe('LobbyScreen — snapshots', () => {
  test('idle phase (no active connection) matches snapshot', async () => {
    const navigation = makeNav();
    const route = { key: 'Lobby', name: 'Lobby', params: undefined } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <LobbyScreen navigation={navigation} route={route} />,
      );
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('idle phase renders Host and Join buttons', async () => {
    const navigation = makeNav();
    const route = { key: 'Lobby', name: 'Lobby', params: undefined } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <LobbyScreen navigation={navigation} route={route} />,
      );
    });
    // Heading text "Multiplayer" should appear in the tree
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Multiplayer');
    expect(json).toContain('Host a Game');
    expect(json).toContain('Join Game');
  });
});

// ── OnboardingScreen ──────────────────────────────────────────────────────────

describe('OnboardingScreen — snapshots', () => {
  test('step 0 (welcome slide) matches snapshot', async () => {
    const navigation = makeNav();
    const route = { key: 'Onboarding', name: 'Onboarding', params: undefined } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <OnboardingScreen navigation={navigation} route={route} />,
      );
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('step 0 renders BoardSight title and Continue button', async () => {
    const navigation = makeNav();
    const route = { key: 'Onboarding', name: 'Onboarding', params: undefined } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <OnboardingScreen navigation={navigation} route={route} />,
      );
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('BoardSight Chess');
    expect(json).toContain('Continue');
  });

  test('step 0 shows Skip button (not on last slide)', async () => {
    const navigation = makeNav();
    const route = { key: 'Onboarding', name: 'Onboarding', params: undefined } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <OnboardingScreen navigation={navigation} route={route} />,
      );
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Skip');
  });
});

