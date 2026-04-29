import {
  createClock,
  formatMs,
  isTimeout,
  pauseClock,
  resumeClock,
  startClock,
  switchSides,
  tickClock,
} from '../../src/domain/gamecore/clock';

describe('createClock', () => {
  it('initialises with equal time for both sides', () => {
    const clock = createClock(300_000, 2_000);
    expect(clock.whiteMs).toBe(300_000);
    expect(clock.blackMs).toBe(300_000);
    expect(clock.increment).toBe(2_000);
    expect(clock.isRunning).toBe(false);
    expect(clock.activeColor).toBeNull();
  });
});

describe('startClock', () => {
  it('sets active color and starts running', () => {
    const clock = createClock(60_000, 0);
    const started = startClock(clock, 'w');
    expect(started.isRunning).toBe(true);
    expect(started.activeColor).toBe('w');
    expect(started.lastTickAt).toBeGreaterThan(0);
  });
});

describe('tickClock', () => {
  it('deducts elapsed time from active player', () => {
    const clock = createClock(60_000, 0);
    const started = startClock(clock, 'w');
    const future = started.lastTickAt + 1_000;
    const ticked = tickClock(started, future);
    expect(ticked.whiteMs).toBe(59_000);
    expect(ticked.blackMs).toBe(60_000);
  });

  it('does not go below 0', () => {
    const clock = createClock(500, 0);
    const started = startClock(clock, 'w');
    const ticked = tickClock(started, started.lastTickAt + 10_000);
    expect(ticked.whiteMs).toBe(0);
  });

  it('does nothing when clock is not running', () => {
    const clock = createClock(60_000, 0);
    const ticked = tickClock(clock, Date.now() + 5_000);
    expect(ticked.whiteMs).toBe(60_000);
  });
});

describe('switchSides', () => {
  it('flips active color and adds increment to mover', () => {
    const clock = createClock(60_000, 2_000);
    const started = startClock(clock, 'w');
    const after = { ...started, lastTickAt: started.lastTickAt - 1_000 };
    const switched = switchSides(after);
    expect(switched.activeColor).toBe('b');
    // white had 60s, lost 1s, gained 2s increment -> 61s
    expect(switched.whiteMs).toBe(61_000);
    expect(switched.isRunning).toBe(true);
  });
});

describe('pauseClock / resumeClock', () => {
  it('pauses and stops ticking', () => {
    const started = startClock(createClock(60_000, 0), 'w');
    const paused = pauseClock(started);
    expect(paused.isRunning).toBe(false);
  });

  it('resumes with new lastTickAt', () => {
    const started = startClock(createClock(60_000, 0), 'w');
    const paused = pauseClock(started);
    const resumed = resumeClock(paused);
    expect(resumed.isRunning).toBe(true);
    expect(resumed.lastTickAt).toBeGreaterThanOrEqual(paused.lastTickAt);
  });
});

describe('isTimeout', () => {
  it('returns null when both players have time', () => {
    const clock = createClock(60_000, 0);
    expect(isTimeout(clock)).toBeNull();
  });

  it('returns "w" when white has 0ms', () => {
    const clock = { ...createClock(60_000, 0), whiteMs: 0 };
    expect(isTimeout(clock)).toBe('w');
  });

  it('returns "b" when black has 0ms', () => {
    const clock = { ...createClock(60_000, 0), blackMs: 0 };
    expect(isTimeout(clock)).toBe('b');
  });
});

describe('formatMs', () => {
  it('formats minutes and seconds correctly', () => {
    expect(formatMs(180_000)).toBe('3:00');
    expect(formatMs(65_000)).toBe('1:05');
    expect(formatMs(60_000)).toBe('1:00');
  });

  it('formats sub-10 seconds with deciseconds', () => {
    expect(formatMs(9_500)).toBe('0:09.5');
    // 1200ms = 1.2s; floating-point: (1.2 - 1) * 10 truncates to 1
    expect(formatMs(1_200)).toBe('0:01.1');
  });

  it('handles 0', () => {
    expect(formatMs(0)).toBe('0:00.0');
  });

  it('handles negative values (clamps to 0)', () => {
    expect(formatMs(-500)).toBe('0:00.0');
  });
});
