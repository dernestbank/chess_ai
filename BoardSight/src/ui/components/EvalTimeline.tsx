/**
 * EvalTimeline — horizontal centipawn evaluation chart for the ReviewScreen.
 *
 * Renders one vertical column per half-move:
 *   - Top half  (white region): grows downward from centre for White advantage
 *   - Bottom half (black region): grows upward from centre for Black advantage
 *   - A thin red cursor marks the current replay position
 *   - Tap any column to seek to that position
 */
import React, { useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const CHART_HEIGHT = 64;   // total chart height in px
const HALF = CHART_HEIGHT / 2;
const BAR_WIDTH = 8;
const BAR_GAP = 2;
const MAX_CP = 800;        // centipawns clamped to ±this for display

interface EvalTimelineProps {
  /** evalCp values, one per half-move (index 0 = after move 1 by white). */
  evals: number[];
  /** Current replay index (0 = start position, N = after move N). */
  replayIndex: number;
  /** Called when user taps a column. Receives replay index (1-based after-move). */
  onSeek: (index: number) => void;
}

export function EvalTimeline({
  evals,
  replayIndex,
  onSeek,
}: EvalTimelineProps): React.JSX.Element {
  const scrollRef = useRef<ScrollView>(null);

  if (evals.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No evaluation data</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {/* Background centre line */}
      <View style={[styles.centreLine, { width: evals.length * (BAR_WIDTH + BAR_GAP) }]} />

      {evals.map((cp, i) => {
        const clamped = Math.max(-MAX_CP, Math.min(MAX_CP, cp));
        const ratio = Math.abs(clamped) / MAX_CP; // 0–1
        const barPx = Math.round(ratio * HALF);
        const isWhiteAdv = clamped >= 0;
        const isActive = i + 1 === replayIndex; // replayIndex N = after move N

        return (
          <TouchableOpacity
            key={i}
            style={[styles.column, isActive && styles.columnActive]}
            onPress={() => onSeek(i + 1)}
            activeOpacity={0.7}
          >
            {/* White advantage bar — fills downward from top of upper half */}
            <View style={styles.upperHalf}>
              {isWhiteAdv && barPx > 0 && (
                <View
                  style={[
                    styles.bar,
                    styles.whiteBar,
                    { height: barPx, position: 'absolute', bottom: 0 },
                  ]}
                />
              )}
            </View>
            {/* Black advantage bar — fills upward from bottom of lower half */}
            <View style={styles.lowerHalf}>
              {!isWhiteAdv && barPx > 0 && (
                <View
                  style={[
                    styles.bar,
                    styles.blackBar,
                    { height: barPx, position: 'absolute', top: 0 },
                  ]}
                />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { height: CHART_HEIGHT + 2 },
  content: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4 },

  centreLine: {
    position: 'absolute',
    top: HALF - 1,
    height: 1,
    backgroundColor: '#4a5568',
  },

  column: {
    width: BAR_WIDTH,
    height: CHART_HEIGHT,
    marginRight: BAR_GAP,
    overflow: 'hidden',
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  columnActive: {
    // highlight column with a subtle border
    borderWidth: 1,
    borderColor: '#e53e3e',
  },

  upperHalf: { height: HALF, overflow: 'hidden', backgroundColor: 'transparent' },
  lowerHalf: { height: HALF, overflow: 'hidden', backgroundColor: 'transparent' },

  bar: { width: BAR_WIDTH, borderRadius: 1 },
  whiteBar: { backgroundColor: '#e2e8f0' },
  blackBar: { backgroundColor: '#2d3748' },

  empty: { height: CHART_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#718096', fontSize: 12 },
});
