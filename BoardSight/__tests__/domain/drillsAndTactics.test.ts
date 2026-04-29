/**
 * Unit tests for src/domain/drills.ts and src/domain/tactics.ts
 */

import { DRILLS, getDrillsByCategory } from '../../src/domain/drills';
import { extractPuzzlesFromLibrary } from '../../src/domain/tactics';

// ── Mock repositories ─────────────────────────────────────────────────────────

const mockListGames = jest.fn();
const mockGetAnalysis = jest.fn();

jest.mock('../../src/data/repositories', () => ({
  listGames: (...args: any[]) => mockListGames(...args),
  getAnalysis: (...args: any[]) => mockGetAnalysis(...args),
}));

// ── drills.ts ─────────────────────────────────────────────────────────────────

describe('DRILLS dataset', () => {
  it('contains at least 5 openings', () => {
    expect(getDrillsByCategory('opening').length).toBeGreaterThanOrEqual(5);
  });

  it('contains at least 4 endgames', () => {
    expect(getDrillsByCategory('endgame').length).toBeGreaterThanOrEqual(4);
  });

  it('all drills have a valid startFen (contains w or b turn indicator)', () => {
    for (const d of DRILLS) {
      expect(d.startFen).toMatch(/ (w|b) /);
    }
  });

  it('all drills have a name and description', () => {
    for (const d of DRILLS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
    }
  });

  it('all drills have a unique id', () => {
    const ids = DRILLS.map(d => d.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('getDrillsByCategory returns only openings', () => {
    const openings = getDrillsByCategory('opening');
    expect(openings.every(d => d.category === 'opening')).toBe(true);
  });

  it('getDrillsByCategory returns only endgames', () => {
    const endgames = getDrillsByCategory('endgame');
    expect(endgames.every(d => d.category === 'endgame')).toBe(true);
  });
});

// ── tactics.ts ────────────────────────────────────────────────────────────────

describe('extractPuzzlesFromLibrary', () => {
  const SAMPLE_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no games exist', async () => {
    mockListGames.mockReturnValue([]);
    const puzzles = await extractPuzzlesFromLibrary();
    expect(puzzles).toHaveLength(0);
  });

  it('skips ongoing games (result = *)', async () => {
    mockListGames.mockReturnValue([{ id: 'g1', result: '*' }]);
    const puzzles = await extractPuzzlesFromLibrary();
    expect(puzzles).toHaveLength(0);
    expect(mockGetAnalysis).not.toHaveBeenCalled();
  });

  it('skips games with no analysis', async () => {
    mockListGames.mockReturnValue([{ id: 'g2', result: '1-0' }]);
    mockGetAnalysis.mockReturnValue(null);
    const puzzles = await extractPuzzlesFromLibrary();
    expect(puzzles).toHaveLength(0);
  });

  it('skips games where analysis is not done', async () => {
    mockListGames.mockReturnValue([{ id: 'g3', result: '1-0' }]);
    mockGetAnalysis.mockReturnValue({ status: 'running', payload_json: null });
    const puzzles = await extractPuzzlesFromLibrary();
    expect(puzzles).toHaveLength(0);
  });

  it('extracts a blunder as a puzzle', async () => {
    mockListGames.mockReturnValue([{ id: 'g4', result: '1-0' }]);
    mockGetAnalysis.mockReturnValue({
      status: 'done',
      payload_json: JSON.stringify({
        moves: [
          {
            san: 'Nf6',
            fromSq: 'g8',
            toSq: 'f6',
            fenBefore: SAMPLE_FEN,
            fenAfter: SAMPLE_FEN,
            evalCp: 250,
            classification: 'blunder',
            bestMoveSan: 'e5',
            moveNumber: 1,
            color: 'b',
          },
        ],
      }),
    });
    const puzzles = await extractPuzzlesFromLibrary();
    expect(puzzles).toHaveLength(1);
    expect(puzzles[0]!.blunderMove).toBe('Nf6');
    expect(puzzles[0]!.bestMove).toBe('e5');
    expect(puzzles[0]!.evalDelta).toBe(250);
    expect(puzzles[0]!.playerColor).toBe('b');
  });

  it('skips non-blunder moves (classification = inaccuracy)', async () => {
    mockListGames.mockReturnValue([{ id: 'g5', result: '0-1' }]);
    mockGetAnalysis.mockReturnValue({
      status: 'done',
      payload_json: JSON.stringify({
        moves: [
          {
            san: 'Nf3',
            fenBefore: SAMPLE_FEN,
            evalCp: 25,
            classification: 'inaccuracy',
            bestMoveSan: 'e4',
            moveNumber: 1,
            color: 'w',
          },
        ],
      }),
    });
    const puzzles = await extractPuzzlesFromLibrary();
    expect(puzzles).toHaveLength(0);
  });

  it('sorts puzzles worst-blunder first', async () => {
    const makeMoves = (evals: number[]) =>
      evals.map((e, i) => ({
        san: 'Nf6',
        fenBefore: SAMPLE_FEN,
        evalCp: e,
        classification: 'blunder',
        bestMoveSan: 'e5',
        moveNumber: i + 1,
        color: 'b',
      }));

    mockListGames.mockReturnValue([{ id: 'g6', result: '1-0' }]);
    mockGetAnalysis.mockReturnValue({
      status: 'done',
      payload_json: JSON.stringify({ moves: makeMoves([100, 400, 200]) }),
    });
    const puzzles = await extractPuzzlesFromLibrary();
    expect(puzzles[0]!.evalDelta).toBe(400);
    expect(puzzles[2]!.evalDelta).toBe(100);
  });
});
