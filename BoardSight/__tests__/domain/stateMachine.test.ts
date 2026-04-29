// Mock zustand so the module-level `create(...)` call in stateMachine/index.ts
// doesn't attempt to initialise any React Native internals.
jest.mock('zustand', () => ({
  create: (_initialiser: unknown) => () => ({}),
}));

import { transition, AppState, AppEvent } from '../../src/domain/stateMachine';

// Helper
const go = (state: AppState, event: AppEvent): AppState => transition(state, event);

describe('State machine — valid transitions', () => {
  test('idle -> scan_board on START_OTB', () => {
    expect(go('idle', { type: 'START_OTB' })).toBe('scan_board');
  });

  test('idle -> bot_game on START_BOT', () => {
    expect(go('idle', { type: 'START_BOT', difficulty: 'beginner' })).toBe('bot_game');
  });

  test('idle -> lobby on START_MULTIPLAYER', () => {
    expect(go('idle', { type: 'START_MULTIPLAYER' })).toBe('lobby');
  });

  test('scan_board -> calibrate on BOARD_DETECTED', () => {
    expect(go('scan_board', { type: 'BOARD_DETECTED' })).toBe('calibrate');
  });

  test('calibrate -> confirm_position on CALIBRATED', () => {
    expect(go('calibrate', { type: 'CALIBRATED' })).toBe('confirm_position');
  });

  test('confirm_position -> live_play on POSITION_CONFIRMED', () => {
    expect(go('confirm_position', { type: 'POSITION_CONFIRMED', fen: 'rnbq...' })).toBe('live_play');
  });

  test('live_play -> paused on PAUSE', () => {
    expect(go('live_play', { type: 'PAUSE' })).toBe('paused');
  });

  test('live_play -> paused on APP_BACKGROUND', () => {
    expect(go('live_play', { type: 'APP_BACKGROUND' })).toBe('paused');
  });

  test('paused -> live_play on RESUME', () => {
    expect(go('paused', { type: 'RESUME' })).toBe('live_play');
  });

  test('live_play -> game_end on GAME_OVER', () => {
    expect(go('live_play', { type: 'GAME_OVER', result: '1-0' })).toBe('game_end');
  });

  test('bot_game -> game_end on GAME_OVER', () => {
    expect(go('bot_game', { type: 'GAME_OVER', result: '0-1' })).toBe('game_end');
  });

  test('game_end -> review_ready on ANALYSIS_READY', () => {
    expect(go('game_end', { type: 'ANALYSIS_READY', jobId: 'abc' })).toBe('review_ready');
  });

  test('any state -> idle on RESET', () => {
    const states: AppState[] = [
      'scan_board',
      'calibrate',
      'paused',
      'bot_game',
      'lobby',
      'game_end',
      'review_ready',
    ];
    states.forEach(s => {
      expect(go(s, { type: 'RESET' })).toBe('idle');
    });
  });

  test('lobby -> live_play on GAME_STARTED', () => {
    expect(go('lobby', { type: 'GAME_STARTED' })).toBe('live_play');
  });
});

describe('State machine — invalid transitions (stay in current state)', () => {
  test('idle stays idle on BOARD_DETECTED', () => {
    expect(go('idle', { type: 'BOARD_DETECTED' })).toBe('idle');
  });

  test('live_play stays live_play on BOARD_DETECTED', () => {
    expect(go('live_play', { type: 'BOARD_DETECTED' })).toBe('live_play');
  });

  test('game_end stays game_end on RESUME', () => {
    expect(go('game_end', { type: 'RESUME' })).toBe('game_end');
  });

  test('review_ready stays review_ready on POSITION_CONFIRMED', () => {
    expect(go('review_ready', { type: 'POSITION_CONFIRMED', fen: '' })).toBe('review_ready');
  });
});
