import React from 'react';
import { StyleSheet, View } from 'react-native';

interface CalibOverlayProps {
  confidence: number; // 0–1
}

export function CalibOverlay({ confidence }: CalibOverlayProps): React.JSX.Element {
  const color = confidence > 0.8 ? '#48bb78' : confidence > 0.5 ? '#fbd38d' : '#fc8181';
  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Corners */}
      {[styles.tl, styles.tr, styles.bl, styles.br].map((pos, i) => (
        <View key={i} style={[styles.corner, pos, { borderColor: color }]} />
      ))}
    </View>
  );
}

const CORNER_SIZE = 24;
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderWidth: 3 },
  tl: { top: 40, left: 20, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 40, right: 20, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: 40, left: 20, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: 40, right: 20, borderLeftWidth: 0, borderTopWidth: 0 },
});
