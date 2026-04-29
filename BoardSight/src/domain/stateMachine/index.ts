import { create } from 'zustand';
import { GameResult } from '../gamecore/types';

// ---------------------------------------------------------------------------
// State & Event types
// ---------------------------------------------------------------------------

export type AppState =
  | 'idle'
  | 'scan_board'
  | 'calibrate'
  | 'confirm_position'
  | 'live_play'
  | 'paused'
  | 'bot_game'
  | 'lobby'
  | 'game_end'
  | 'review_ready';

export type AppEvent =
  | { type: 'START_OTB' }
  | { type: 'START_BOT'; difficulty: 'beginner' | 'intermediate' | 'advanced' }
  | { type: 'START_MULTIPLAYER' }
  | { type: 'BOARD_DETECTED' }
  | { type: 'CALIBRATED' }
  | { type: 'POSITION_CONFIRMED'; fen: string }
  | { type: 'GAME_STARTED' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'GAME_OVER'; result: GameResult }
  | { type: 'ANALYSIS_READY'; jobId: string }
  | { type: 'RESET' }
  | { type: 'APP_BACKGROUND' }
  | { type: 'APP_FOREGROUND' };

// ---------------------------------------------------------------------------
// Pure transition function
// ---------------------------------------------------------------------------

export function transition(state: AppState, event: AppEvent): AppState {
  switch (state) {
    case 'idle':
      if (event.type === 'START_OTB') { return 'scan_board'; }
      if (event.type === 'START_BOT') { return 'bot_game'; }
      if (event.type === 'START_MULTIPLAYER') { return 'lobby'; }
      break;

    case 'scan_board':
      if (event.type === 'BOARD_DETECTED') { return 'calibrate'; }
      if (event.type === 'RESET') { return 'idle'; }
      break;

    case 'calibrate':
      if (event.type === 'CALIBRATED') { return 'confirm_position'; }
      if (event.type === 'RESET') { return 'idle'; }
      break;

    case 'confirm_position':
      if (event.type === 'POSITION_CONFIRMED') { return 'live_play'; }
      if (event.type === 'RESET') { return 'idle'; }
      break;

    case 'live_play':
      if (event.type === 'PAUSE') { return 'paused'; }
      if (event.type === 'APP_BACKGROUND') { return 'paused'; }
      if (event.type === 'GAME_OVER') { return 'game_end'; }
      break;

    case 'paused':
      if (event.type === 'RESUME') { return 'live_play'; }
      if (event.type === 'APP_FOREGROUND') { return 'live_play'; }
      if (event.type === 'GAME_OVER') { return 'game_end'; }
      if (event.type === 'RESET') { return 'idle'; }
      break;

    case 'bot_game':
      if (event.type === 'PAUSE') { return 'paused'; }
      if (event.type === 'APP_BACKGROUND') { return 'paused'; }
      if (event.type === 'GAME_OVER') { return 'game_end'; }
      if (event.type === 'RESET') { return 'idle'; }
      break;

    case 'lobby':
      if (event.type === 'GAME_STARTED') { return 'live_play'; }
      if (event.type === 'RESET') { return 'idle'; }
      break;

    case 'game_end':
      if (event.type === 'ANALYSIS_READY') { return 'review_ready'; }
      if (event.type === 'RESET') { return 'idle'; }
      break;

    case 'review_ready':
      if (event.type === 'RESET') { return 'idle'; }
      break;
  }
  // No valid transition — stay in current state
  return state;
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

interface AppStoreState {
  appState: AppState;
  lastResult: GameResult | null;
  analysisJobId: string | null;
  confirmedFen: string | null;
  botDifficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  dispatch: (event: AppEvent) => void;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  appState: 'idle',
  lastResult: null,
  analysisJobId: null,
  confirmedFen: null,
  botDifficulty: null,

  dispatch: (event: AppEvent) => {
    const current = get().appState;
    const next = transition(current, event);

    const extra: Partial<AppStoreState> = {};
    if (event.type === 'GAME_OVER') { extra.lastResult = event.result; }
    if (event.type === 'ANALYSIS_READY') { extra.analysisJobId = event.jobId; }
    if (event.type === 'POSITION_CONFIRMED') { extra.confirmedFen = event.fen; }
    if (event.type === 'START_BOT') { extra.botDifficulty = event.difficulty; }
    if (event.type === 'RESET') {
      extra.lastResult = null;
      extra.analysisJobId = null;
      extra.confirmedFen = null;
      extra.botDifficulty = null;
    }

    set({ appState: next, ...extra });
  },
}));
