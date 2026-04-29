import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Onboarding: undefined;
  StartGame: undefined;
  Scan: { gameId: string; timeControlName?: string };
  LiveGame: {
    gameId: string;
    isMultiplayer?: boolean;
    role?: 'host' | 'guest';
    connectionType?: 'p2p' | 'cloud';
  };
  BotGame: {
    gameId: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    startFen?: string;
    drillName?: string;
  };
  Drill: undefined;
  Tactics: undefined;
  Spectator: { sessionCode: string; relayUrl: string };
  Lobby: undefined;
  Review: { gameId: string };
  Library: undefined;
  Settings: undefined;
};

export type OnboardingProps = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;
export type StartGameProps = NativeStackScreenProps<RootStackParamList, 'StartGame'>;
export type ScanProps = NativeStackScreenProps<RootStackParamList, 'Scan'>;
export type LiveGameProps = NativeStackScreenProps<RootStackParamList, 'LiveGame'>;
export type BotGameProps = NativeStackScreenProps<RootStackParamList, 'BotGame'>;
export type DrillProps = NativeStackScreenProps<RootStackParamList, 'Drill'>;
export type LobbyProps = NativeStackScreenProps<RootStackParamList, 'Lobby'>;
export type ReviewProps = NativeStackScreenProps<RootStackParamList, 'Review'>;
export type LibraryProps = NativeStackScreenProps<RootStackParamList, 'Library'>;
export type SettingsProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
