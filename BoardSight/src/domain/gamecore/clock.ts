import { ClockState, Color, TimeControl } from './types';

// Re-export TimeControl so consumers can import it from this module
export type { TimeControl };

export const TIME_CONTROLS: TimeControl[] = [
  { name: 'Bullet 1+0', timeMs: 60_000, increment: 0 },
  { name: 'Blitz 3+2', timeMs: 180_000, increment: 2_000 },
  { name: 'Blitz 5+0', timeMs: 300_000, increment: 0 },
  { name: 'Rapid 10+0', timeMs: 600_000, increment: 0 },
  { name: 'Rapid 15+10', timeMs: 900_000, increment: 10_000 },
];

export function createClock(timeMs: number, increment: number): ClockState {
  return {
    whiteMs: timeMs,
    blackMs: timeMs,
    activeColor: null,
    increment,
    lastTickAt: 0,
    isRunning: false,
  };
}

export function startClock(state: ClockState, color: Color): ClockState {
  return {
    ...state,
    activeColor: color,
    lastTickAt: Date.now(),
    isRunning: true,
  };
}

/** Deduct elapsed time from the active player without changing anything else. */
export function tickClock(state: ClockState, now: number = Date.now()): ClockState {
  if (!state.isRunning || !state.activeColor) {
    return state;
  }
  const elapsed = Math.max(0, now - state.lastTickAt);
  if (state.activeColor === 'w') {
    return {
      ...state,
      whiteMs: Math.max(0, state.whiteMs - elapsed),
      lastTickAt: now,
    };
  }
  return {
    ...state,
    blackMs: Math.max(0, state.blackMs - elapsed),
    lastTickAt: now,
  };
}

/** Called after a move is played: tick, add increment to mover, flip active color. */
export function switchSides(state: ClockState): ClockState {
  const now = Date.now();
  const ticked = tickClock(state, now);
  const mover = ticked.activeColor;
  const newColor: Color = mover === 'w' ? 'b' : 'w';

  let withIncrement = ticked;
  if (mover === 'w') {
    withIncrement = { ...ticked, whiteMs: ticked.whiteMs + ticked.increment };
  } else if (mover === 'b') {
    withIncrement = { ...ticked, blackMs: ticked.blackMs + ticked.increment };
  }

  return {
    ...withIncrement,
    activeColor: newColor,
    lastTickAt: now,
    isRunning: true,
  };
}

/** Freeze the clock — tick one last time then stop. */
export function pauseClock(state: ClockState): ClockState {
  const ticked = tickClock(state, Date.now());
  return { ...ticked, isRunning: false };
}

/** Resume after pause — reset lastTickAt so we don't count paused time. */
export function resumeClock(state: ClockState): ClockState {
  if (!state.activeColor) {
    return state;
  }
  return { ...state, lastTickAt: Date.now(), isRunning: true };
}

/** Returns the color that has run out of time, or null. */
export function isTimeout(state: ClockState): Color | null {
  if (state.whiteMs <= 0) { return 'w'; }
  if (state.blackMs <= 0) { return 'b'; }
  return null;
}

/** Format milliseconds as "M:SS" or "0:SS.d" (deciseconds) when < 10 seconds. */
export function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  if (totalSeconds < 10) {
    const secs = Math.floor(totalSeconds);
    const deci = Math.floor((totalSeconds - secs) * 10);
    return `0:${String(secs).padStart(2, '0')}.${deci}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
