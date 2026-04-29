import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface EvalBarProps {
  evalCp: number; // centipawns, positive = white advantage
}

export function EvalBar({ evalCp }: EvalBarProps): React.JSX.Element {
  const clamped = Math.max(-500, Math.min(500, evalCp));
  const whitePct = ((clamped + 500) / 1000) * 100;
  const label = evalCp > 0 ? `+${(evalCp / 100).toFixed(1)}` : (evalCp / 100).toFixed(1);

  return (
    <View style={styles.container}>
      <View style={[styles.white, { width: `${whitePct}%` }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 20, backgroundColor: '#2d3748', borderRadius: 10, overflow: 'hidden', position: 'relative' },
  white: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#f7fafc' },
  label: { position: 'absolute', right: 8, top: 2, fontSize: 11, color: '#4a5568' },
});
