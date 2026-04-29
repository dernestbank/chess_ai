/**
 * BoardSight theme system.
 *
 * Two palettes: dark (default) and light.
 * Usage:
 *   import { useTheme } from './theme';
 *   const theme = useTheme();
 *   <View style={{ backgroundColor: theme.bg }} />
 */
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Palettes ────────────────────────────────────────────────────────────────

export interface ColorPalette {
  bg: string;           // primary background
  bgCard: string;       // card / panel background
  bgAccent: string;     // deeper accent background
  text: string;         // primary text
  textMuted: string;    // secondary / caption text
  textFaint: string;    // very faint text (hints)
  accent: string;       // primary action color (blue)
  /** Full-width / high-emphasis CTAs (e.g. Play, confirm). Distinct from informational `accent`. */
  accentCta: string;
  accentGreen: string;  // success / positive
  accentRed: string;    // danger / negative
  accentGold: string;   // highlight / chess result
  border: string;       // subtle divider
}

export const DARK: ColorPalette = {
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

export const LIGHT: ColorPalette = {
  bg:          '#f7fafc',
  bgCard:      '#ffffff',
  bgAccent:    '#edf2f7',
  text:        '#1a202c',
  textMuted:   '#4a5568',
  textFaint:   '#718096',
  accent:      '#3182ce',
  accentCta:   '#2f855a',
  accentGreen: '#276749',
  accentRed:   '#c53030',
  accentGold:  '#b7791f',
  border:      '#e2e8f0',
};

// ── Persistence ─────────────────────────────────────────────────────────────

const THEME_KEY = '@boardsight/theme';

export async function saveThemePreference(pref: 'system' | 'dark' | 'light'): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, pref);
}

export async function loadThemePreference(): Promise<'system' | 'dark' | 'light'> {
  const raw = await AsyncStorage.getItem(THEME_KEY);
  if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  return 'system';
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the active ColorPalette.
 * Reads the persisted preference; falls back to the system scheme when 'system'.
 */
export function useTheme(): ColorPalette {
  const system = useRNColorScheme(); // 'dark' | 'light' | null | undefined
  const [pref, setPref] = useState<'system' | 'dark' | 'light'>('system');

  useEffect(() => {
    loadThemePreference().then(setPref);
  }, []);

  if (pref === 'dark') return DARK;
  if (pref === 'light') return LIGHT;
  // 'system': follow device
  return system === 'light' ? LIGHT : DARK;
}
