/**
 * Session persistence for multiplayer.
 * Saves the last P2P session code + role so LobbyScreen can offer a quick-reconnect.
 * Session expires after 10 minutes (likely stale after that).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@boardsight/last_mp_session';
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface SavedSession {
  sessionCode: string;  // host IP or cloud session ID
  role: 'host' | 'guest';
  savedAt: number;      // epoch ms
}

export async function saveLastSession(
  sessionCode: string,
  role: 'host' | 'guest',
): Promise<void> {
  const record: SavedSession = { sessionCode, role, savedAt: Date.now() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export async function loadLastSession(): Promise<SavedSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const record: SavedSession = JSON.parse(raw);
    if (Date.now() - record.savedAt > SESSION_TTL_MS) {
      await clearLastSession();
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export async function clearLastSession(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
