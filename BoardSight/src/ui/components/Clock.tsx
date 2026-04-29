import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { formatMs } from '../../domain/gamecore/clock';

interface ClockProps {
  side: 'white' | 'black';
  timeMs: number;
  isActive: boolean;
  onTap?: () => void; // manual clock tap (switches sides)
}

export function Clock({ side, timeMs, isActive, onTap }: ClockProps): React.JSX.Element {
  const isLow = timeMs < 10_000 && timeMs > 0;
  const blink = useRef(new Animated.Value(1)).current;
  const prevLow = useRef(false);

  const prevActive = useRef(false);

  // Haptic on clock switch (this side becomes active)
  useEffect(() => {
    if (isActive && !prevActive.current) {
      Vibration.vibrate(40);
    }
    prevActive.current = isActive;
  }, [isActive]);

  // Haptic once when crossing the 10s threshold
  useEffect(() => {
    if (isActive && isLow && !prevLow.current) {
      Vibration.vibrate([0, 80, 60, 80]);
    }
    prevLow.current = isLow;
  }, [isLow, isActive]);

  // Blink when active + low
  useEffect(() => {
    if (isActive && isLow) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(blink, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      blink.setValue(1);
    }
  }, [isActive, isLow]);

  const content = (
    <View style={[styles.container, isActive && styles.active, isLow && isActive && styles.lowTime]}>
      <Text style={styles.sideLabel}>{side === 'white' ? '⬜ White' : '⬛ Black'}</Text>
      <Animated.Text style={[styles.time, isLow && styles.timeLow, isActive && styles.timeActive, { opacity: blink }]}>
        {formatMs(timeMs)}
      </Animated.Text>
    </View>
  );

  if (onTap) {
    return <TouchableOpacity onPress={onTap} activeOpacity={0.7}>{content}</TouchableOpacity>;
  }
  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#0f3460',
  },
  active: { backgroundColor: '#1a365d' },
  lowTime: { borderWidth: 2, borderColor: '#fc8181' },
  sideLabel: { color: '#a0aec0', fontSize: 14 },
  time: { fontSize: 28, fontWeight: 'bold', color: '#cbd5e0', fontVariant: ['tabular-nums'] },
  timeLow: { color: '#fc8181' },
  timeActive: { color: '#ffffff' },
});
