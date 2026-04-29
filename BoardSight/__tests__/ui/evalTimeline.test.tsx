/**
 * Snapshot + unit tests for the EvalTimeline component.
 *
 * Uses react-test-renderer (already a devDependency) following the same
 * patterns as __tests__/ui/components.snapshot.test.tsx.
 *
 * Mocks must be declared before imports so babel-jest hoisting works.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

// react-native-vision-camera is a transitive dep — stub it out.
jest.mock('react-native-vision-camera', () => ({
  Camera: 'Camera',
  useCameraDevices: jest.fn(() => ({})),
  useCameraDevice: jest.fn(() => null),
  useCodeScanner: jest.fn(() => ({})),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import React from 'react';
import renderer from 'react-test-renderer';

import { EvalTimeline } from '../../src/ui/components/EvalTimeline';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Synchronously create a rendered tree inside act(). */
async function render(element: React.ReactElement): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

// ── Snapshot tests ─────────────────────────────────────────────────────────────

describe('EvalTimeline — snapshots', () => {
  test('1. empty evals renders "No evaluation data" view', async () => {
    const tree = await render(
      <EvalTimeline evals={[]} replayIndex={0} onSeek={jest.fn()} />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('2. white winning position (cp=300) matches snapshot', async () => {
    const tree = await render(
      <EvalTimeline evals={[300]} replayIndex={0} onSeek={jest.fn()} />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('3. black winning position (cp=-200) matches snapshot', async () => {
    const tree = await render(
      <EvalTimeline evals={[-200]} replayIndex={0} onSeek={jest.fn()} />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('4. equal position (cp=0) matches snapshot', async () => {
    const tree = await render(
      <EvalTimeline evals={[0]} replayIndex={0} onSeek={jest.fn()} />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });
});

// ── Unit tests ─────────────────────────────────────────────────────────────────

describe('EvalTimeline — unit tests', () => {
  test('5. onSeek called with correct index when column tapped', async () => {
    const onSeek = jest.fn();
    // Three evals → three columns (indices 0, 1, 2 → seeks 1, 2, 3)
    const tree = await render(
      <EvalTimeline evals={[100, 200, 300]} replayIndex={0} onSeek={onSeek} />,
    );

    // Find all TouchableOpacity instances (one per column)
    const columns = tree.root.findAllByType(
      require('react-native').TouchableOpacity,
    );
    expect(columns).toHaveLength(3);

    // Tap the first column → should seek to index 1
    await renderer.act(async () => {
      columns[0]!.props.onPress();
    });
    expect(onSeek).toHaveBeenCalledWith(1);

    // Tap the second column → should seek to index 2
    await renderer.act(async () => {
      columns[1]!.props.onPress();
    });
    expect(onSeek).toHaveBeenCalledWith(2);

    // Tap the third column → should seek to index 3
    await renderer.act(async () => {
      columns[2]!.props.onPress();
    });
    expect(onSeek).toHaveBeenCalledWith(3);

    expect(onSeek).toHaveBeenCalledTimes(3);
  });

  test('6. active column marked — replayIndex=2 makes column at i=1 active', async () => {
    const tree = await render(
      <EvalTimeline evals={[100, 200, 300]} replayIndex={2} onSeek={jest.fn()} />,
    );

    const columns = tree.root.findAllByType(
      require('react-native').TouchableOpacity,
    );
    expect(columns).toHaveLength(3);

    // Helper: check whether a column's style array contains the active style
    // (which adds borderWidth:1 / borderColor:'#e53e3e').
    function hasActiveBorder(col: renderer.ReactTestInstance): boolean {
      const styles: unknown[] = Array.isArray(col.props.style)
        ? (col.props.style as unknown[])
        : [col.props.style];
      return styles.some(
        (s) =>
          s !== null &&
          typeof s === 'object' &&
          (s as Record<string, unknown>).borderColor === '#e53e3e',
      );
    }

    // Only column at i=1 (replayIndex === i + 1 === 2) should be active
    expect(hasActiveBorder(columns[0]!)).toBe(false); // i=0, seek=1, not active
    expect(hasActiveBorder(columns[1]!)).toBe(true);  // i=1, seek=2, active
    expect(hasActiveBorder(columns[2]!)).toBe(false); // i=2, seek=3, not active
  });

  test('7. values clamped to ±800 — cp=1000 renders identically to cp=800', async () => {
    // Both should produce the same bar height because MAX_CP=800.
    const tree1000 = await render(
      <EvalTimeline evals={[1000]} replayIndex={0} onSeek={jest.fn()} />,
    );
    const tree800 = await render(
      <EvalTimeline evals={[800]} replayIndex={0} onSeek={jest.fn()} />,
    );

    // Serialise to JSON and compare structure (keys keyed to content, not key prop)
    const json1000 = JSON.stringify(tree1000.toJSON());
    const json800 = JSON.stringify(tree800.toJSON());

    // The rendered trees should be structurally identical (same bar heights)
    expect(json1000).toEqual(json800);
  });
});

// ── Additional unit tests ─────────────────────────────────────────────────────

describe('EvalTimeline — additional unit tests', () => {
  // Test 8: onSeek is called with the correct index for each column.
  // This extends test 5 by confirming the exact argument contract across a
  // longer evals array (5 entries) and verifying the last column too.
  test('8. onSeek called with correct 1-based index for 5-entry eval array', async () => {
    const onSeek = jest.fn();
    const evals = [50, -50, 150, -150, 0];
    const tree = await render(
      <EvalTimeline evals={evals} replayIndex={0} onSeek={onSeek} />,
    );

    const columns = tree.root.findAllByType(
      require('react-native').TouchableOpacity,
    );
    expect(columns).toHaveLength(evals.length);

    // Tap each column in order and verify the seek argument = column index + 1.
    for (let i = 0; i < evals.length; i++) {
      await renderer.act(async () => {
        columns[i]!.props.onPress();
      });
      expect(onSeek).toHaveBeenLastCalledWith(i + 1);
    }

    expect(onSeek).toHaveBeenCalledTimes(evals.length);
  });

  // Test 9: empty evals renders the "No evaluation data" fallback (not a
  // ScrollView with columns), which is what the component shows instead of an
  // ActivityIndicator. EvalTimeline has no isLoading prop — the "loading"
  // state is represented by an empty evals array before analysis arrives.
  test('9. empty evals shows "No evaluation data" text (no column buttons)', async () => {
    const tree = await render(
      <EvalTimeline evals={[]} replayIndex={0} onSeek={jest.fn()} />,
    );

    // No tappable columns should exist — the empty-state view has no TouchableOpacity.
    const columns = tree.root.findAllByType(
      require('react-native').TouchableOpacity,
    );
    expect(columns).toHaveLength(0);

    // The "No evaluation data" text must be present.
    const texts = tree.root.findAllByType(require('react-native').Text);
    const hasEmptyLabel = texts.some(
      (t: renderer.ReactTestInstance) => t.props.children === 'No evaluation data',
    );
    expect(hasEmptyLabel).toBe(true);

    // Snapshot the empty state too.
    expect(tree.toJSON()).toMatchSnapshot();
  });

  // Test 10: white and black accuracy % display — exercised via RecapCard which
  // is the component responsible for showing per-side accuracy in this app.
  // EvalTimeline itself does not render accuracy %, so we import RecapCard here.
  test('10. RecapCard displays correct white and black accuracy percentages', async () => {
    // Lazy-import RecapCard; it has no extra mocks beyond what this file already sets up.
    const { RecapCard } = require('../../src/ui/components/RecapCard') as typeof import('../../src/ui/components/RecapCard');

    const tree = await render(
      <RecapCard
        playerWhite="White Player"
        playerBlack="Black Player"
        result="1-0"
        date="2026-04-14"
        accuracyWhite={88}
        accuracyBlack={72}
        moves={35}
      />,
    );

    const json = JSON.stringify(tree.toJSON());

    // Both accuracy values must appear in the rendered output.
    expect(json).toContain('88');
    expect(json).toContain('72');

    // Snapshot for regression.
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
