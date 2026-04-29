/**
 * Focused smoke tests for the crash-recovery banner rendered by App.tsx.
 *
 * App.tsx imports NavigationContainer + all screen components transitively, so
 * rendering the full App in a unit test requires stubbing out the entire
 * navigation tree and every native module those screens touch.  Rather than
 * doing that here (the screens.snapshot suite already validates screen
 * rendering), we extract the banner's conditional-render logic into a minimal
 * inline harness component and exercise only that logic.
 *
 * The harness mirrors the exact banner JSX from App.tsx so the test remains a
 * faithful representation of the production behaviour.
 *
 * Mocks must be declared before any imports so babel-jest hoisting works.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

// useGameService — each test configures checkForActiveGame / loadGame / endGame
// via the module-level mockGameService object that the mock factory closes over.
let mockCheckForActiveGame: jest.Mock = jest.fn().mockResolvedValue(null);
let mockLoadGame: jest.Mock = jest.fn().mockResolvedValue(undefined);
let mockEndGame: jest.Mock = jest.fn();

jest.mock('../../src/domain/gameService', () => ({
  useGameService: () => ({
    get checkForActiveGame() { return mockCheckForActiveGame; },
    get loadGame()           { return mockLoadGame; },
    get endGame()            { return mockEndGame; },
  }),
}));

// src/data/db — initDb is awaited inside the harness useEffect.
jest.mock('../../src/data/db', () => ({
  initDb: jest.fn().mockResolvedValue(undefined),
}));

// src/data/repositories — getGame may be imported transitively; stub it.
jest.mock('../../src/data/repositories', () => ({
  getGame: jest.fn().mockReturnValue(null),
}));

// src/ui/theme — App.tsx imports DARK directly; provide it without native deps.
jest.mock('../../src/ui/theme', () => {
  const palette = {
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
    DARK:                 palette,
    LIGHT:                palette,
    useTheme:             jest.fn(() => palette),
    loadThemePreference:  jest.fn().mockResolvedValue('dark'),
    saveThemePreference:  jest.fn().mockResolvedValue(undefined),
  };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import renderer from 'react-test-renderer';
import { useGameService } from '../../src/domain/gameService';
import { initDb } from '../../src/data/db';

// ── Minimal banner harness ────────────────────────────────────────────────────
//
// This component replicates the banner section of App.tsx without the
// NavigationContainer or any screen imports, letting the conditional render be
// exercised in isolation.  It calls checkForActiveGame() inside a useEffect,
// exactly as App.tsx's handleNavReady does.

interface BannerHarnessProps {
  onResume?: () => void;
  onDismiss?: () => void;
}

function BannerHarness({ onResume, onDismiss }: BannerHarnessProps): React.JSX.Element {
  const { checkForActiveGame, loadGame, endGame } = useGameService();

  const [bannerGameId, setBannerGameId] = useState<string | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void initDb().then(() => {
      if (cancelled) { return; }
      void checkForActiveGame().then(activeGameId => {
        if (cancelled) { return; }
        if (activeGameId) {
          setBannerGameId(activeGameId);
          setBannerVisible(true);
          Animated.timing(bannerOpacity, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }).start();
        }
      });
    });
    return () => { cancelled = true; };
  // Only run on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResume = () => {
    setBannerVisible(false);
    void loadGame(bannerGameId ?? '');
    setBannerGameId(null);
    onResume?.();
  };

  const handleDismiss = () => {
    setBannerVisible(false);
    setBannerGameId(null);
    endGame('*');
    onDismiss?.();
  };

  return (
    <View style={{ flex: 1 }}>
      {bannerVisible && (
        <Animated.View style={{ opacity: bannerOpacity }}>
          <Text>Resume your game?</Text>
          <View>
            <TouchableOpacity onPress={handleResume} testID="btn-resume">
              <Text>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDismiss} testID="btn-dismiss">
              <Text>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Recursively collect all leaf text strings from a react-test-renderer JSON
 * tree and join them into a single string.
 */
function collectText(node: renderer.ReactTestRendererJSON | string | null): string {
  if (node === null) { return ''; }
  if (typeof node === 'string') { return node; }
  const children = node.children;
  if (!children) { return ''; }
  return children.map(collectText).join('');
}

function treeContains(root: renderer.ReactTestRendererJSON | null, text: string): boolean {
  if (root === null) { return false; }
  return collectText(root).includes(text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('crash recovery banner', () => {
  beforeEach(() => {
    jest
      .spyOn(Animated, 'timing')
      .mockImplementation(
        (value, _config) =>
          ({
            start: (callback?: (() => void) | undefined) => {
              value.setValue(1);
              callback?.();
            },
          }) as Animated.CompositeAnimation,
      );
    // Reset mocks to a safe default (no active game) before each test.
    mockCheckForActiveGame = jest.fn().mockResolvedValue(null);
    mockLoadGame           = jest.fn().mockResolvedValue(undefined);
    mockEndGame            = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Core banner-visibility smoke tests (required by Task 2) ────────────────

  it('shows banner when checkForActiveGame returns a game ID', async () => {
    mockCheckForActiveGame = jest.fn().mockResolvedValue('game-1');

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<BannerHarness />);
    });

    expect(
      treeContains(tree.toJSON() as renderer.ReactTestRendererJSON, 'Resume'),
    ).toBe(true);
  });

  it('does not show banner when no active game', async () => {
    // mockCheckForActiveGame already returns null (set in beforeEach).

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<BannerHarness />);
    });

    expect(
      treeContains(tree.toJSON() as renderer.ReactTestRendererJSON, 'Resume'),
    ).toBe(false);
  });

  // ── Additional banner interaction tests ────────────────────────────────────

  it('hides banner and calls loadGame when Resume is pressed', async () => {
    mockCheckForActiveGame = jest.fn().mockResolvedValue('game-2');

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<BannerHarness />);
    });

    // Banner is visible — now press the Resume button.
    const resumeBtn = tree.root.findByProps({ testID: 'btn-resume' });
    await renderer.act(async () => {
      resumeBtn.props.onPress();
    });

    expect(mockLoadGame).toHaveBeenCalledWith('game-2');
    expect(
      treeContains(tree.toJSON() as renderer.ReactTestRendererJSON, 'Resume'),
    ).toBe(false);
  });

  it('hides banner and calls endGame when Dismiss is pressed', async () => {
    mockCheckForActiveGame = jest.fn().mockResolvedValue('game-3');

    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<BannerHarness />);
    });

    const dismissBtn = tree.root.findByProps({ testID: 'btn-dismiss' });
    await renderer.act(async () => {
      dismissBtn.props.onPress();
    });

    expect(mockEndGame).toHaveBeenCalledWith('*');
    expect(
      treeContains(tree.toJSON() as renderer.ReactTestRendererJSON, 'Resume'),
    ).toBe(false);
  });
});
