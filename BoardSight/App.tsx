import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { RootNavigator } from './src/ui/navigation';
import { RootStackParamList } from './src/ui/navigation/types';
import { initDb } from './src/data/db';
import { useGameService } from './src/domain/gameService';
import { getGame } from './src/data/repositories';
import { DARK } from './src/ui/theme';

const ONBOARDING_KEY = '@boardsight/onboarding_done';

// Use the dark palette constants directly — App renders outside any theme
// provider, so we reference DARK directly rather than calling useTheme().
const t = DARK;

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: t.bgAccent,
    borderTopWidth: 1,
    borderTopColor: t.border,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    // Keep above the default React Navigation tab bar (height ~49 dp on iOS,
    // ~56 dp on Android).  We rely on position:absolute and zIndex instead of
    // adjusting paddingBottom so the banner never obscures the tab bar itself.
    zIndex: 999,
    elevation: 10,
  },
  bannerText: {
    flex: 1,
    color: t.text,
    fontSize: 14,
    fontWeight: '600',
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  btnResume: {
    backgroundColor: t.accent,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  btnResumeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  btnDismiss: {
    backgroundColor: t.bgCard,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  btnDismissText: {
    color: t.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});

export default function App(): React.JSX.Element {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const { checkForActiveGame, loadGame, endGame } = useGameService();
  const [dbReady, setDbReady] = useState(false);

  // Banner state
  const [bannerGameId, setBannerGameId] = useState<string | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerOpacity = useRef(new Animated.Value(0)).current;

  // Prevent re-triggering the crash-recovery check on every navigator re-mount
  const hasChecked = useRef(false);

  // ── DB init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        await initDb();
        setDbReady(true);
      } catch (err) {
        console.error('DB init failed:', err);
        setDbReady(true); // allow app to boot even if DB fails
      }
    })();
  }, []);

  // ── Banner animation helpers ───────────────────────────────────────────────
  const showBanner = (gameId: string) => {
    setBannerGameId(gameId);
    setBannerVisible(true);
    Animated.timing(bannerOpacity, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  };

  const hideBanner = () => {
    Animated.timing(bannerOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setBannerVisible(false);
      setBannerGameId(null);
    });
  };

  // ── Crash-recovery + first-launch routing ─────────────────────────────────
  const handleNavReady = async () => {
    if (!dbReady) { return; }
    if (hasChecked.current) { return; }
    hasChecked.current = true;

    try {
      // Skip onboarding on subsequent launches
      const onboarded = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (onboarded) {
        navRef.current?.navigate('StartGame');
      }

      const activeGameId = await checkForActiveGame();
      if (activeGameId) {
        showBanner(activeGameId);
      }
    } catch (err) {
      console.warn('Crash recovery check failed:', err);
    }
  };

  // ── Banner actions ─────────────────────────────────────────────────────────
  const handleResume = async () => {
    if (!bannerGameId) { return; }
    hideBanner();
    try {
      await loadGame(bannerGameId);
      // Route to the correct screen based on the persisted game mode
      const row = getGame(bannerGameId);
      if (row?.mode === 'bot') {
        navRef.current?.navigate('BotGame', {
          gameId: bannerGameId,
          difficulty: 'beginner', // default; BotGameScreen will load actual difficulty from game row
        });
      } else {
        // 'otb' or 'multiplayer'
        navRef.current?.navigate('LiveGame', { gameId: bannerGameId });
      }
    } catch (err) {
      console.warn('Resume failed:', err);
    }
  };

  const handleDismiss = () => {
    hideBanner();
    // Clear the active-game flag so it won't surface on the next launch
    endGame('*');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer ref={navRef} onReady={handleNavReady}>
        <RootNavigator />
      </NavigationContainer>

      {bannerVisible && (
        <Animated.View style={[styles.bannerContainer, { opacity: bannerOpacity }]}>
          <Text style={styles.bannerText}>Resume your game?</Text>
          <View style={styles.bannerActions}>
            <TouchableOpacity style={styles.btnResume} onPress={handleResume} activeOpacity={0.8}>
              <Text style={styles.btnResumeText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnDismiss} onPress={handleDismiss} activeOpacity={0.8}>
              <Text style={styles.btnDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}
