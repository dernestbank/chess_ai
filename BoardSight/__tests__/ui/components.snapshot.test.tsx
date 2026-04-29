/**
 * Snapshot tests for BoardSight UI components.
 *
 * Mocks are declared before any imports so Jest's babel-jest hoisting works.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

// The react-native preset already mocks Vibration with `vibrate: jest.fn()`.
// No additional Vibration mock is needed here.

// FlatList's VirtualizedList internals produce deeply-nested style arrays that
// cause pretty-format to throw "RangeError: Invalid string length" when
// serialising snapshots.  Replace it with a minimal component that exercises
// the same props (data, renderItem, ListEmptyComponent) without the recursion.
jest.mock(
  'react-native/Libraries/Lists/FlatList',
  () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    function MockFlatList<T>(props: {
      data?: T[];
      renderItem?: (info: { item: T; index: number }) => React.ReactNode;
      ListEmptyComponent?: React.ReactNode | (() => React.ReactNode);
      keyExtractor?: (item: T, index: number) => string;
      [key: string]: unknown;
    }): React.ReactElement {
      const { data = [], renderItem, ListEmptyComponent } = props;
      if (data.length === 0) {
        const EmptyComp = ListEmptyComponent;
        if (typeof EmptyComp === 'function') {
          return React.createElement(View, null, React.createElement(EmptyComp));
        }
        return React.createElement(View, null, EmptyComp as React.ReactNode);
      }
      return React.createElement(
        View,
        null,
        data.map((item, index) =>
          renderItem ? renderItem({ item, index }) : null,
        ),
      );
    }

    MockFlatList.displayName = 'FlatList';
    return { default: MockFlatList };
  },
);

// react-native-vision-camera is a project dependency; mock it so any
// transitive import from future component changes doesn't break the suite.
jest.mock('react-native-vision-camera', () => ({
  Camera: 'Camera',
  useCameraDevices: jest.fn(() => ({})),
  useCameraDevice: jest.fn(() => null),
  useCodeScanner: jest.fn(() => ({})),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import React from 'react';
import renderer from 'react-test-renderer';

import { Clock } from '../../src/ui/components/Clock';
import { MoveList } from '../../src/ui/components/MoveList';
import { EvalBar } from '../../src/ui/components/EvalBar';
import { RecapCard } from '../../src/ui/components/RecapCard';
import type { Move } from '../../src/domain/gamecore/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMove(san: string, moveNumber: number, idx: number): Move {
  return {
    san,
    from: 'e2',
    to: 'e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    whiteMs: 180_000,
    blackMs: 180_000,
    moveNumber,
    timestamp: 1_700_000_000_000 + idx * 5_000,
  };
}

const FOUR_MOVES: Move[] = [
  makeMove('e4', 1, 0),
  makeMove('e5', 1, 1),
  makeMove('Nf3', 2, 2),
  makeMove('Nc6', 2, 3),
];

// ── Clock ─────────────────────────────────────────────────────────────────────

describe('Clock', () => {
  test('inactive, normal time (180 000 ms) matches snapshot', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<Clock side="white" timeMs={180_000} isActive={false} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('active, normal time (180 000 ms) matches snapshot', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<Clock side="black" timeMs={180_000} isActive={true} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  // This case starts an Animated.loop (blink) that runs indefinitely.
  // Use fake timers so act() does not wait for the infinite animation loop.
  test('active, low time (8 500 ms — under 10 s threshold) matches snapshot', () => {
    jest.useFakeTimers();
    let tree!: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(<Clock side="white" timeMs={8_500} isActive={true} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
    jest.useRealTimers();
  });

  test('inactive, low time (8 500 ms) matches snapshot', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<Clock side="black" timeMs={8_500} isActive={false} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('with onTap handler renders TouchableOpacity wrapper', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <Clock side="white" timeMs={180_000} isActive={true} onTap={() => {}} />,
      );
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });
});

// ── MoveList ──────────────────────────────────────────────────────────────────

describe('MoveList', () => {
  test('empty moves array renders "No moves yet" placeholder', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<MoveList moves={[]} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('four moves (two pairs) renders correctly', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<MoveList moves={FOUR_MOVES} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });
});

// ── EvalBar ───────────────────────────────────────────────────────────────────

describe('EvalBar', () => {
  test('equal position (0 cp) matches snapshot', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<EvalBar evalCp={0} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('white advantage (+300 cp) matches snapshot', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<EvalBar evalCp={300} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('black advantage (-300 cp) matches snapshot', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<EvalBar evalCp={-300} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('out-of-range black advantage (-700 cp, clamped to -500) matches snapshot', async () => {
    // -700 should clamp to -500 internally; the white bar width should be 0%.
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(<EvalBar evalCp={-700} />);
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });
});

// ── RecapCard ─────────────────────────────────────────────────────────────────

describe('RecapCard', () => {
  test('white wins — typical props match snapshot', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <RecapCard
          playerWhite="Alice"
          playerBlack="Bob"
          result="1-0"
          date="2026-03-27"
          accuracyWhite={91}
          accuracyBlack={84}
          moves={42}
        />,
      );
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('draw result matches snapshot', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <RecapCard
          playerWhite="Stockfish"
          playerBlack="Leela"
          result="1/2-1/2"
          date="2026-01-01"
          accuracyWhite={99}
          accuracyBlack={98}
          moves={120}
        />,
      );
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });

  test('black wins matches snapshot', async () => {
    let tree!: renderer.ReactTestRenderer;
    await renderer.act(async () => {
      tree = renderer.create(
        <RecapCard
          playerWhite="Player"
          playerBlack="Opponent"
          result="0-1"
          date="2025-12-25"
          accuracyWhite={55}
          accuracyBlack={77}
          moves={31}
        />,
      );
    });
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
