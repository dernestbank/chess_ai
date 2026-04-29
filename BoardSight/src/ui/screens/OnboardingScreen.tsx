/**
 * OnboardingScreen — 3-step paged intro flow:
 *   1. Welcome overview
 *   2. Camera permission request
 *   3. Lighting & positioning tips → "Get Started"
 */
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCameraPermission } from 'react-native-vision-camera';
import { OnboardingProps } from '../navigation/types';
import { ColorPalette, useTheme } from '../theme';

const ONBOARDING_KEY = '@boardsight/onboarding_done';

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    scrollView: { flex: 1 },
    slide: {
      width: SCREEN_W,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    icon: { fontSize: 72, marginBottom: 20 },
    title: { fontSize: 26, fontWeight: 'bold', color: t.text, textAlign: 'center', marginBottom: 16 },
    body: { fontSize: 16, color: t.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: 28 },
    bullets: { alignSelf: 'stretch' },
    bulletRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-start' },
    bulletDot: { color: t.accent, fontSize: 18, marginRight: 10, lineHeight: 22 },
    bulletText: { flex: 1, color: t.text, fontSize: 15, lineHeight: 22 },
    permStatus: { marginTop: 16 },
    permGranted: { color: t.accentGreen, fontSize: 15, textAlign: 'center' },
    permDenied: { color: t.accentRed, fontSize: 14, textAlign: 'center' },
    dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 24, gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.border },
    dotActive: { backgroundColor: t.accent, width: 20 },
    navRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 16,
    },
    backBtn: { minWidth: 80 },
    backBtnText: { color: t.textMuted, fontSize: 16 },
    nextBtn: { backgroundColor: t.accent, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10 },
    nextBtnDisabled: { opacity: 0.5 },
    nextBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    skipBtn: { alignSelf: 'center', paddingBottom: 24, marginTop: -8 },
    skipText: { color: t.textFaint, fontSize: 14 },
  });
}

const { width: SCREEN_W } = Dimensions.get('window');

interface Slide {
  key: string;
  icon: string;
  title: string;
  body: string;
  bullets?: string[];
}

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    icon: '♟',
    title: 'BoardSight Chess',
    body: 'Point your phone camera at any chessboard to automatically record moves, run a clock, and get post-game analysis.',
    bullets: [
      'Auto-detect moves via camera',
      'Built-in chess clock',
      'Stockfish post-game analysis',
      'Play vs bots or friends over WiFi',
    ],
  },
  {
    key: 'camera',
    icon: '📷',
    title: 'Camera Access',
    body: 'BoardSight needs your camera to watch the board. Your video never leaves your device — all CV runs on-device.',
    bullets: undefined,
  },
  {
    key: 'tips',
    icon: '💡',
    title: 'Positioning Tips',
    body: 'For best accuracy, follow these guidelines when setting up your board:',
    bullets: [
      'Place phone in landscape on a stable surface',
      'Keep the full board in frame with some margin',
      'Avoid glare — indirect or diffused light is best',
      'White squares should face you (a1 bottom-left)',
    ],
  },
];

export function OnboardingScreen({ navigation }: OnboardingProps): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { hasPermission, requestPermission } = useCameraPermission();

  const [permissionState, setPermissionState] = useState<'idle' | 'requesting' | 'granted' | 'denied'>(
    hasPermission ? 'granted' : 'idle',
  );

  const isLastSlide = step === SLIDES.length - 1;
  const isCameraSlide = SLIDES[step]?.key === 'camera';

  const goToSlide = (index: number) => {
    setStep(index);
    scrollRef.current?.scrollTo({ x: index * SCREEN_W, animated: true });
  };

  const handleNext = async () => {
    if (isCameraSlide && permissionState !== 'granted') {
      setPermissionState('requesting');
      const granted = await requestPermission();
      setPermissionState(granted ? 'granted' : 'denied');
      if (granted) {
        goToSlide(step + 1);
      }
      return;
    }

    if (isLastSlide) {
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
      navigation.replace('StartGame');
      return;
    }

    goToSlide(step + 1);
  };

  const nextLabel = () => {
    if (isCameraSlide) {
      if (permissionState === 'granted') return 'Continue →';
      if (permissionState === 'requesting') return 'Requesting…';
      if (permissionState === 'denied') return 'Open Settings';
      return 'Allow Camera';
    }
    if (isLastSlide) return 'Get Started';
    return 'Continue →';
  };

  const nextDisabled = permissionState === 'requesting';

  return (
    <View style={styles.container}>
      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
      >
        {SLIDES.map(slide => (
          <View key={slide.key} style={styles.slide}>
            <Text style={styles.icon}>{slide.icon}</Text>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>

            {slide.bullets && (
              <View style={styles.bullets}>
                {slide.bullets.map((b, bi) => (
                  <View key={bi} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}

            {slide.key === 'camera' && (
              <View style={styles.permStatus}>
                {permissionState === 'granted' && (
                  <Text style={styles.permGranted}>✓ Camera access granted</Text>
                )}
                {permissionState === 'denied' && (
                  <Text style={styles.permDenied}>
                    Camera access denied. Please enable it in your device Settings.
                  </Text>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === step && styles.dotActive]}
          />
        ))}
      </View>

      {/* Navigation */}
      <View style={styles.navRow}>
        {step > 0 ? (
          <TouchableOpacity style={styles.backBtn} onPress={() => goToSlide(step - 1)}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}

        <TouchableOpacity
          style={[styles.nextBtn, nextDisabled && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={nextDisabled}
        >
          <Text style={styles.nextBtnText}>{nextLabel()}</Text>
        </TouchableOpacity>
      </View>

      {/* Skip (only on non-last slides) */}
      {!isLastSlide && (
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={async () => {
            await AsyncStorage.setItem(ONBOARDING_KEY, '1');
            navigation.replace('StartGame');
          }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

