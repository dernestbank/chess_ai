import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@boardsight/settings';

export interface AppSettings {
  cloudEndpointUrl: string;
  apiKey: string;
  analysisModeDefault: 'cloud' | 'device' | 'auto';
  enableLLMExplanations: boolean;
  assistLevel: 'off' | 'light' | 'on';
  defaultBotDifficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Referee mode: warn on illegal moves detected with high confidence. */
  enableRefereeMode: boolean;
  /** UI theme preference. 'system' follows device dark/light mode. */
  colorScheme: 'system' | 'dark' | 'light';
  /**
   * Quick dark-mode toggle. When true, overrides colorScheme to 'dark';
   * when false, overrides to 'light'. The richer three-way colorScheme
   * picker keeps working — flipping this switch just shortcuts it.
   */
  darkMode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  cloudEndpointUrl: '',
  apiKey: '',
  analysisModeDefault: 'auto',
  enableLLMExplanations: false,
  assistLevel: 'off',
  defaultBotDifficulty: 'intermediate',
  enableRefereeMode: true,
  colorScheme: 'system',
  darkMode: true,
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
