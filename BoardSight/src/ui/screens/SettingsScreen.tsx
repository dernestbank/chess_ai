import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
} from '../../domain/settings';
import { ColorPalette, saveThemePreference, useTheme } from '../theme';

function makeStyles(t: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingBottom: 40 },
    sectionHeader: {
      color: t.textMuted,
      fontSize: 12,
      fontWeight: 'bold',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: 20,
    },
    card: {
      backgroundColor: t.bgCard,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    rowCard: {
      backgroundColor: t.bgCard,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleInfo: { flex: 1, paddingRight: 12 },
    toggleLabel: { color: t.text, fontSize: 14, fontWeight: '600' },
    toggleSub: { color: t.textMuted, fontSize: 11, marginTop: 2 },
    label: { color: t.textMuted, fontSize: 13, marginBottom: 8 },
    input: {
      backgroundColor: t.bgAccent,
      color: t.text,
      padding: 12,
      borderRadius: 8,
      fontSize: 14,
      marginBottom: 12,
    },
    segmented: { flexDirection: 'row', gap: 8 },
    segment: {
      flex: 1,
      padding: 10,
      borderRadius: 8,
      backgroundColor: t.bgAccent,
      alignItems: 'center',
    },
    segmentActive: { backgroundColor: t.accent },
    segmentText: { color: t.textMuted, fontSize: 13 },
    segmentTextActive: { color: '#fff', fontWeight: 'bold' },
    saveBtn: {
      backgroundColor: t.accent,
      padding: 18,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 24,
    },
    saveBtnDone: { backgroundColor: t.accentGreen },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    savedConfirm: {
      color: t.accentGreen,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 10,
    },
  });
}

export function SettingsScreen(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const savedOpacity = useRef(new Animated.Value(0)).current;
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();
  const styles = makeStyles(theme);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  // Clean up the auto-dismiss timer on unmount.
  useEffect(() => {
    return () => {
      if (savedTimer.current !== null) {
        clearTimeout(savedTimer.current);
      }
    };
  }, []);

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings(prev => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [],
  );

  /**
   * Toggling darkMode also keeps colorScheme in sync so the rest of the
   * app (which reads colorScheme via saveThemePreference) stays consistent.
   */
  const handleDarkModeToggle = useCallback(
    (enabled: boolean) => {
      setSettings(prev => ({
        ...prev,
        darkMode: enabled,
        colorScheme: enabled ? 'dark' : 'light',
      }));
      setSaved(false);
    },
    [],
  );

  /**
   * Toggling the colorScheme picker keeps darkMode in sync:
   *   dark   → darkMode true
   *   light  → darkMode false
   *   system → darkMode matches the 'dark' preset (leave as-is so we don't
   *             fight the system; users who care can use the explicit toggle)
   */
  const handleColorScheme = useCallback(
    (scheme: AppSettings['colorScheme']) => {
      setSettings(prev => ({
        ...prev,
        colorScheme: scheme,
        darkMode: scheme === 'dark' ? true : scheme === 'light' ? false : prev.darkMode,
      }));
      setSaved(false);
    },
    [],
  );

  const showSavedConfirm = useCallback(() => {
    // Cancel any previous timer.
    if (savedTimer.current !== null) {
      clearTimeout(savedTimer.current);
    }
    setSaved(true);
    savedOpacity.setValue(1);
    savedTimer.current = setTimeout(() => {
      Animated.timing(savedOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setSaved(false));
    }, 1500);
  }, [savedOpacity]);

  const handleSave = useCallback(async () => {
    await saveSettings(settings);
    await saveThemePreference(settings.colorScheme);
    showSavedConfirm();
  }, [settings, showSavedConfirm]);

  const isCloud = settings.analysisModeDefault === 'cloud';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Appearance ─────────────────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>Appearance</Text>

      {/* Dark mode quick toggle */}
      <View style={styles.rowCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Dark Mode</Text>
          <Text style={styles.toggleSub}>
            Switch between dark and light interface
          </Text>
        </View>
        <Switch
          value={settings.darkMode}
          onValueChange={handleDarkModeToggle}
          trackColor={{ true: theme.accent, false: theme.bgAccent }}
          thumbColor={settings.darkMode ? theme.accentGold : theme.textMuted}
        />
      </View>

      {/* Three-way theme picker (overrides the quick toggle above) */}
      <View style={styles.card}>
        <Text style={styles.label}>Theme</Text>
        <View style={styles.segmented}>
          {(['system', 'dark', 'light'] as const).map(scheme => (
            <TouchableOpacity
              key={scheme}
              style={[
                styles.segment,
                settings.colorScheme === scheme && styles.segmentActive,
              ]}
              onPress={() => handleColorScheme(scheme)}
            >
              <Text
                style={[
                  styles.segmentText,
                  settings.colorScheme === scheme && styles.segmentTextActive,
                ]}
              >
                {scheme === 'system' ? 'Auto' : scheme === 'dark' ? 'Dark' : 'Light'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Post-game Analysis ─────────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>Post-game Analysis</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Analysis mode</Text>
        <View style={styles.segmented}>
          {(['auto', 'cloud', 'device'] as const).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.segment,
                settings.analysisModeDefault === mode && styles.segmentActive,
              ]}
              onPress={() => update('analysisModeDefault', mode)}
            >
              <Text
                style={[
                  styles.segmentText,
                  settings.analysisModeDefault === mode && styles.segmentTextActive,
                ]}
              >
                {mode === 'device' ? 'On-Device' : mode === 'cloud' ? 'Cloud' : 'Auto'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Cloud endpoint + API key — only visible when cloud mode is selected */}
      {isCloud && (
        <View style={styles.card}>
          <Text style={styles.label}>Cloud API endpoint</Text>
          <TextInput
            style={styles.input}
            value={settings.cloudEndpointUrl}
            onChangeText={v => update('cloudEndpointUrl', v)}
            placeholder="https://your-api.example.com"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Text style={styles.label}>API key</Text>
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            value={settings.apiKey}
            onChangeText={v => update('apiKey', v)}
            placeholder="your-api-key"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="none"
            secureTextEntry
          />
        </View>
      )}

      {/* LLM explanations toggle */}
      <View style={styles.rowCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>LLM Explanations</Text>
          <Text style={styles.toggleSub}>
            Show Claude commentary for each move
          </Text>
        </View>
        <Switch
          value={settings.enableLLMExplanations}
          onValueChange={v => update('enableLLMExplanations', v)}
          trackColor={{ true: theme.accent, false: theme.bgAccent }}
          thumbColor={settings.enableLLMExplanations ? theme.accentGold : theme.textMuted}
        />
      </View>

      {/* ── Gameplay ───────────────────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>Gameplay</Text>

      {/* Referee mode toggle */}
      <View style={styles.rowCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Referee Mode</Text>
          <Text style={styles.toggleSub}>
            Warn on illegal moves detected by camera
          </Text>
        </View>
        <Switch
          value={settings.enableRefereeMode}
          onValueChange={v => update('enableRefereeMode', v)}
          trackColor={{ true: theme.accent, false: theme.bgAccent }}
          thumbColor={settings.enableRefereeMode ? theme.accentGold : theme.textMuted}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Assist level</Text>
        <View style={styles.segmented}>
          {(['off', 'light', 'on'] as const).map(level => (
            <TouchableOpacity
              key={level}
              style={[
                styles.segment,
                settings.assistLevel === level && styles.segmentActive,
              ]}
              onPress={() => update('assistLevel', level)}
            >
              <Text
                style={[
                  styles.segmentText,
                  settings.assistLevel === level && styles.segmentTextActive,
                ]}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Default bot difficulty</Text>
        <View style={styles.segmented}>
          {(['beginner', 'intermediate', 'advanced'] as const).map(d => (
            <TouchableOpacity
              key={d}
              style={[
                styles.segment,
                settings.defaultBotDifficulty === d && styles.segmentActive,
              ]}
              onPress={() => update('defaultBotDifficulty', d)}
            >
              <Text
                style={[
                  styles.segmentText,
                  settings.defaultBotDifficulty === d && styles.segmentTextActive,
                ]}
              >
                {d.slice(0, 3).charAt(0).toUpperCase() + d.slice(1, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Save ───────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.saveBtn, saved && styles.saveBtnDone]}
        onPress={handleSave}
        activeOpacity={0.8}
      >
        <Text style={styles.saveBtnText}>
          {saved ? 'Saved \u2713' : 'Save Settings'}
        </Text>
      </TouchableOpacity>

      {/* Inline fade-out confirmation */}
      <Animated.Text style={[styles.savedConfirm, { opacity: savedOpacity }]}>
        Settings saved \u2713
      </Animated.Text>

    </ScrollView>
  );
}
