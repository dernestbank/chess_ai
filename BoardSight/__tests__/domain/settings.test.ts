/**
 * Unit tests for src/domain/settings.ts
 *
 * @react-native-async-storage/async-storage is already mocked in jest.setup.js.
 * Here we use `mockResolvedValue` / `mockImplementation` in each test to control
 * behaviour without referencing any out-of-scope variables in a jest.mock() factory
 * (which would be rejected by babel-jest's static hoisting check).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
} from '../../src/domain/settings';
import { saveThemePreference } from '../../src/ui/theme';

const SETTINGS_KEY = '@boardsight/settings';

beforeEach(() => {
  // Clear all mock history + reset default return values.
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// getSettings()
// ---------------------------------------------------------------------------

describe('getSettings()', () => {
  test('returns DEFAULT_SETTINGS when AsyncStorage is empty', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  test('returns default values merged with any stored partial object', async () => {
    const stored: Partial<AppSettings> = {
      darkMode: false,
      analysisModeDefault: 'cloud',
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(stored));

    const settings = await getSettings();

    expect(settings.darkMode).toBe(false);
    expect(settings.analysisModeDefault).toBe('cloud');
    // Keys not in the stored object come from defaults.
    expect(settings.enableRefereeMode).toBe(DEFAULT_SETTINGS.enableRefereeMode);
    expect(settings.enableLLMExplanations).toBe(DEFAULT_SETTINGS.enableLLMExplanations);
  });

  test('returns DEFAULT_SETTINGS when stored JSON is corrupted', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('NOT_VALID_JSON{{{');

    const settings = await getSettings();

    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});

// ---------------------------------------------------------------------------
// saveSettings()
// ---------------------------------------------------------------------------

describe('saveSettings()', () => {
  test('calls AsyncStorage.setItem with the correct key', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, darkMode: false });

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    const [calledKey] = (AsyncStorage.setItem as jest.Mock).mock.calls[0] as [string, string];
    expect(calledKey).toBe(SETTINGS_KEY);
  });

  test('serialises the full settings object to JSON', async () => {
    const newSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      cloudEndpointUrl: 'https://api.example.com',
      apiKey: 'secret-key',
    };

    await saveSettings(newSettings);

    const [, calledValue] = (AsyncStorage.setItem as jest.Mock).mock.calls[0] as [string, string];
    expect(JSON.parse(calledValue)).toEqual(newSettings);
  });

  test('saved value round-trips through getSettings', async () => {
    const partial: AppSettings = {
      ...DEFAULT_SETTINGS,
      darkMode: false,
      analysisModeDefault: 'device',
      cloudEndpointUrl: 'https://my-server.io',
    };

    // saveSettings → AsyncStorage.setItem stores JSON
    // getSettings → AsyncStorage.getItem returns that JSON
    let stored: string | null = null;
    (AsyncStorage.setItem as jest.Mock).mockImplementation((_k: string, v: string) => {
      stored = v;
      return Promise.resolve();
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation(() =>
      Promise.resolve(stored),
    );

    await saveSettings(partial);
    const retrieved = await getSettings();

    expect(retrieved.darkMode).toBe(false);
    expect(retrieved.analysisModeDefault).toBe('device');
    expect(retrieved.cloudEndpointUrl).toBe('https://my-server.io');
    // Fields not overridden remain at default.
    expect(retrieved.apiKey).toBe(DEFAULT_SETTINGS.apiKey);
  });
});

// ---------------------------------------------------------------------------
// saveThemePreference()
// ---------------------------------------------------------------------------

describe('saveThemePreference()', () => {
  test('writes the theme preference under the correct AsyncStorage key', async () => {
    await saveThemePreference('dark');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@boardsight/theme', 'dark');
  });

  test('accepts all three valid preference values without throwing', async () => {
    await expect(saveThemePreference('dark')).resolves.toBeUndefined();
    await expect(saveThemePreference('light')).resolves.toBeUndefined();
    await expect(saveThemePreference('system')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AppSettings shape
// ---------------------------------------------------------------------------

describe('AppSettings required keys', () => {
  test('DEFAULT_SETTINGS contains all required keys', () => {
    const requiredKeys: Array<keyof AppSettings> = [
      'darkMode',
      'enableRefereeMode',
      'enableLLMExplanations',
      'analysisModeDefault',
      'cloudEndpointUrl',
      'apiKey',
    ];

    for (const key of requiredKeys) {
      expect(DEFAULT_SETTINGS).toHaveProperty(key);
    }
  });

  test('getSettings() result contains all required keys', async () => {
    const settings = await getSettings();

    expect(settings).toHaveProperty('darkMode');
    expect(settings).toHaveProperty('enableRefereeMode');
    expect(settings).toHaveProperty('enableLLMExplanations');
    expect(settings).toHaveProperty('analysisModeDefault');
    expect(settings).toHaveProperty('cloudEndpointUrl');
    expect(settings).toHaveProperty('apiKey');
  });

  test('darkMode is a boolean', () => {
    expect(typeof DEFAULT_SETTINGS.darkMode).toBe('boolean');
  });

  test('enableRefereeMode is a boolean', () => {
    expect(typeof DEFAULT_SETTINGS.enableRefereeMode).toBe('boolean');
  });

  test('enableLLMExplanations is a boolean', () => {
    expect(typeof DEFAULT_SETTINGS.enableLLMExplanations).toBe('boolean');
  });

  test('analysisModeDefault is one of the allowed union values', () => {
    const allowed = ['cloud', 'device', 'auto'] as const;
    expect(allowed).toContain(DEFAULT_SETTINGS.analysisModeDefault);
  });

  test('cloudEndpointUrl and apiKey are strings', () => {
    expect(typeof DEFAULT_SETTINGS.cloudEndpointUrl).toBe('string');
    expect(typeof DEFAULT_SETTINGS.apiKey).toBe('string');
  });
});
