/**
 * Unit tests for sessionPersistence.ts
 *
 * @react-native-async-storage/async-storage is mocked in jest.setup.js.
 * Each test configures the mock's return values independently.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveLastSession,
  loadLastSession,
  clearLastSession,
} from '../../src/domain/multiplayer/sessionPersistence';

const STORAGE_KEY = '@boardsight/last_mp_session';

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// saveLastSession
// ---------------------------------------------------------------------------

describe('saveLastSession()', () => {
  it('writes to the correct AsyncStorage key', async () => {
    await saveLastSession('192.168.1.10', 'host');
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    const [key] = (AsyncStorage.setItem as jest.Mock).mock.calls[0] as [string, string];
    expect(key).toBe(STORAGE_KEY);
  });

  it('serialises sessionCode, role, and savedAt correctly', async () => {
    const before = Date.now();
    await saveLastSession('sess-abc', 'guest');
    const after = Date.now();

    const [, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0] as [string, string];
    const parsed = JSON.parse(value);
    expect(parsed.sessionCode).toBe('sess-abc');
    expect(parsed.role).toBe('guest');
    expect(parsed.savedAt).toBeGreaterThanOrEqual(before);
    expect(parsed.savedAt).toBeLessThanOrEqual(after);
  });

  it('accepts both "host" and "guest" roles', async () => {
    await expect(saveLastSession('id1', 'host')).resolves.toBeUndefined();
    await expect(saveLastSession('id2', 'guest')).resolves.toBeUndefined();
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// loadLastSession
// ---------------------------------------------------------------------------

describe('loadLastSession()', () => {
  it('returns null when AsyncStorage is empty', async () => {
    const result = await loadLastSession();
    expect(result).toBeNull();
  });

  it('returns the saved session when it is within the 10-minute TTL', async () => {
    const record = {
      sessionCode: '10.0.0.5',
      role: 'host',
      savedAt: Date.now() - 60_000, // 1 minute ago — within TTL
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(record));

    const result = await loadLastSession();
    expect(result).not.toBeNull();
    expect(result!.sessionCode).toBe('10.0.0.5');
    expect(result!.role).toBe('host');
  });

  it('returns null and clears storage when session is older than 10 minutes', async () => {
    const record = {
      sessionCode: 'stale-sess',
      role: 'guest',
      savedAt: Date.now() - 11 * 60 * 1000, // 11 minutes ago — expired
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(record));

    const result = await loadLastSession();
    expect(result).toBeNull();
    // clearLastSession() should have been called (calls removeItem)
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('returns null when stored JSON is corrupted', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('CORRUPTED{{{');

    const result = await loadLastSession();
    expect(result).toBeNull();
  });

  it('reads from the correct storage key', async () => {
    await loadLastSession();
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('exactly at TTL boundary (10 minutes) is treated as expired', async () => {
    const record = {
      sessionCode: 'boundary',
      role: 'host',
      // Exactly 10 minutes + 1ms ago — expired
      savedAt: Date.now() - 10 * 60 * 1000 - 1,
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(record));

    const result = await loadLastSession();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearLastSession
// ---------------------------------------------------------------------------

describe('clearLastSession()', () => {
  it('calls removeItem with the correct key', async () => {
    await clearLastSession();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1);
  });

  it('resolves without error', async () => {
    await expect(clearLastSession()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Round-trip: save → load
// ---------------------------------------------------------------------------

describe('round-trip: saveLastSession → loadLastSession', () => {
  it('save then load returns the same sessionCode and role', async () => {
    let stored: string | null = null;
    (AsyncStorage.setItem as jest.Mock).mockImplementation((_k: string, v: string) => {
      stored = v;
      return Promise.resolve();
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation(() =>
      Promise.resolve(stored),
    );

    await saveLastSession('cloud-xyz', 'guest');
    const result = await loadLastSession();

    expect(result).not.toBeNull();
    expect(result!.sessionCode).toBe('cloud-xyz');
    expect(result!.role).toBe('guest');
  });
});
