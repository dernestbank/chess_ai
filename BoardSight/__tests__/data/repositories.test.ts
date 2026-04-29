/**
 * Integration tests for SQLite repositories.
 *
 * react-native-quick-sqlite is a native module that cannot run in Jest's
 * Node.js environment, so we mock it at the module level and control the
 * data returned from `execute()` on a per-test basis via `mockExecute`.
 *
 * The repositories always call `getDb()` which is provided by db.ts.  We
 * mock db.ts so that `getDb()` returns our in-memory `mockDb` object instead
 * of the real SQLite connection.
 */

// ---------------------------------------------------------------------------
// 1.  Mock react-native-quick-sqlite (never actually imported by the repos,
//     but db.ts would import it — the db.ts mock makes this redundant; we
//     keep it here so the module graph resolves cleanly).
// ---------------------------------------------------------------------------
jest.mock('react-native-quick-sqlite', () => ({
  open: jest.fn(),
}));

// ---------------------------------------------------------------------------
// 2.  Build a controllable fake DB connection.
//     `mockExecute` is a jest.fn() whose return value can be overridden with
//     `.mockReturnValueOnce(...)` inside individual tests.
// ---------------------------------------------------------------------------

/** Build a rows object that mirrors the QuickSQLiteConnection API. */
function makeRows(arr: any[]) {
  return {
    _array: arr,
    length: arr.length,
    item: (i: number) => arr[i],
  };
}

/** Default empty result returned when no specific value has been queued. */
const EMPTY_RESULT = { rows: makeRows([]) };

const mockExecute = jest.fn(() => EMPTY_RESULT);
const mockClose = jest.fn();

const mockDb = {
  execute: mockExecute,
  close: mockClose,
};

// ---------------------------------------------------------------------------
// 3.  Mock db.ts so `getDb()` returns our fake connection.
// ---------------------------------------------------------------------------
jest.mock('../../src/data/db', () => ({
  initDb: jest.fn().mockResolvedValue(undefined),
  getDb: jest.fn(() => mockDb),
  closeDb: jest.fn(),
}));

// ---------------------------------------------------------------------------
// 4.  Import the repositories AFTER the mocks are registered.
// ---------------------------------------------------------------------------
import {
  createGame,
  getGame,
  updateGame,
  listGames,
  getActiveGame,
  deleteGame,
  saveMove,
  getMovesForGame,
  deleteLastMove,
  saveAnalysis,
  getAnalysis,
  updateAnalysis,
  saveSession,
  getSessionForGame,
  getGameStats,
} from '../../src/data/repositories';
import type { GameRow, MoveRow, AnalysisRow, SessionRow } from '../../src/data/models';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset call history before each test so assertions stay isolated. */
beforeEach(() => {
  mockExecute.mockClear();
  mockClose.mockClear();
  // Restore the default empty-result behaviour so tests that don't configure
  // a return value still get a deterministic, non-crashing response.
  mockExecute.mockReturnValue(EMPTY_RESULT);
});

// ---------------------------------------------------------------------------
// uid() — tested indirectly via the id field of returned objects
// ---------------------------------------------------------------------------

describe('uid (internal)', () => {
  test('createGame returns a non-empty string id', () => {
    const game = createGame({
      mode: 'otb',
      pgn: '',
      result: '*',
      player_white: null,
      player_black: null,
      white_ms: 0,
      black_ms: 0,
    });
    expect(typeof game.id).toBe('string');
    expect(game.id.length).toBeGreaterThan(0);
  });

  test('two successive createGame calls produce distinct ids', () => {
    const a = createGame({
      mode: 'otb',
      pgn: '',
      result: '*',
      player_white: null,
      player_black: null,
      white_ms: 0,
      black_ms: 0,
    });
    const b = createGame({
      mode: 'otb',
      pgn: '',
      result: '*',
      player_white: null,
      player_black: null,
      white_ms: 0,
      black_ms: 0,
    });
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// Games — createGame
// ---------------------------------------------------------------------------

describe('createGame', () => {
  const input: Omit<GameRow, 'id' | 'created_at' | 'updated_at'> = {
    mode: 'bot',
    pgn: '1. e4 e5',
    result: '*',
    player_white: 'Human',
    player_black: 'Bot',
    white_ms: 300_000,
    black_ms: 300_000,
  };

  test('calls execute with an INSERT INTO games statement', () => {
    createGame(input);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/INSERT INTO games/i);
  });

  test('passes all required fields as parameters', () => {
    createGame(input);
    const [, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    // params: [id, mode, pgn, result, player_white, player_black, white_ms, black_ms, created_at, updated_at]
    expect(params![1]).toBe('bot');
    expect(params![2]).toBe('1. e4 e5');
    expect(params![3]).toBe('*');
    expect(params![4]).toBe('Human');
    expect(params![5]).toBe('Bot');
    expect(params![6]).toBe(300_000);
    expect(params![7]).toBe(300_000);
  });

  test('returns a GameRow with matching fields and a generated id', () => {
    const row = createGame(input);
    expect(row.mode).toBe('bot');
    expect(row.pgn).toBe('1. e4 e5');
    expect(row.player_white).toBe('Human');
    expect(row.player_black).toBe('Bot');
    expect(row.white_ms).toBe(300_000);
    expect(typeof row.id).toBe('string');
    expect(row.id.length).toBeGreaterThan(0);
    expect(row.created_at).toBeGreaterThan(0);
    expect(row.updated_at).toBe(row.created_at);
  });

  test('handles null player fields', () => {
    const row = createGame({ ...input, player_white: null, player_black: null });
    expect(row.player_white).toBeNull();
    expect(row.player_black).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Games — getGame
// ---------------------------------------------------------------------------

describe('getGame', () => {
  const fakeRow = {
    id: 'abc123',
    mode: 'otb',
    pgn: '',
    result: '1-0',
    player_white: null,
    player_black: null,
    white_ms: 0,
    black_ms: 0,
    created_at: 1_000_000,
    updated_at: 1_000_001,
  };

  test('calls execute with SELECT … WHERE id = ?', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([fakeRow]) });
    getGame('abc123');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/SELECT \* FROM games WHERE id = \?/i);
    expect(params).toEqual(['abc123']);
  });

  test('maps the database row to a GameRow correctly', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([fakeRow]) });
    const result = getGame('abc123');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('abc123');
    expect(result!.mode).toBe('otb');
    expect(result!.result).toBe('1-0');
    expect(result!.created_at).toBe(1_000_000);
    expect(result!.updated_at).toBe(1_000_001);
  });

  test('returns null when the row does not exist', () => {
    // mockExecute already returns EMPTY_RESULT by default
    const result = getGame('nonexistent');
    expect(result).toBeNull();
  });

  test('sets player_white / player_black to null when absent in row', () => {
    const rowWithoutPlayers = { ...fakeRow, player_white: undefined, player_black: undefined };
    mockExecute.mockReturnValueOnce({ rows: makeRows([rowWithoutPlayers]) });
    const result = getGame('abc123');
    expect(result!.player_white).toBeNull();
    expect(result!.player_black).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Games — updateGame
// ---------------------------------------------------------------------------

describe('updateGame', () => {
  test('calls execute with UPDATE games SET … WHERE id = ?', () => {
    updateGame('game-1', { pgn: '1. d4', result: '1-0' });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/UPDATE games SET/i);
    expect(sql).toMatch(/WHERE id = \?/i);
    // values: [pgn, result, now, id]
    expect(params[0]).toBe('1. d4');
    expect(params[1]).toBe('1-0');
    expect(params[3]).toBe('game-1');
  });
});

// ---------------------------------------------------------------------------
// Games — listGames
// ---------------------------------------------------------------------------

describe('listGames', () => {
  const olderRow = {
    id: 'old',
    mode: 'otb',
    pgn: '',
    result: '0-1',
    player_white: null,
    player_black: null,
    white_ms: 0,
    black_ms: 0,
    created_at: 1_000,
    updated_at: 1_000,
  };
  const newerRow = {
    id: 'new',
    mode: 'bot',
    pgn: '',
    result: '*',
    player_white: 'Alice',
    player_black: null,
    white_ms: 5_000,
    black_ms: 5_000,
    created_at: 2_000,
    updated_at: 2_000,
  };

  test('calls execute with ORDER BY created_at DESC', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([newerRow, olderRow]) });
    listGames();
    const [sql] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/ORDER BY created_at DESC/i);
  });

  test('forwards limit and offset params', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([]) });
    listGames(10, 20);
    const [, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(params).toEqual([10, 20]);
  });

  test('returns mapped GameRow array in the order provided by DB', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([newerRow, olderRow]) });
    const results = listGames();
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('new');
    expect(results[1]!.id).toBe('old');
  });

  test('returns empty array when no rows exist', () => {
    // default mockReturnValue is EMPTY_RESULT
    const results = listGames();
    expect(results).toEqual([]);
  });

  test('uses default limit=50, offset=0 when called with no args', () => {
    listGames();
    const [, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(params).toEqual([50, 0]);
  });
});

// ---------------------------------------------------------------------------
// Games — getActiveGame
// ---------------------------------------------------------------------------

describe('getActiveGame', () => {
  test("queries for result = '*' ordered by updated_at DESC", () => {
    getActiveGame();
    const [sql] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/result\s*=\s*'\*'/);
    expect(sql).toMatch(/ORDER BY updated_at DESC/i);
    expect(sql).toMatch(/LIMIT 1/i);
  });

  test('returns null when no active game exists', () => {
    expect(getActiveGame()).toBeNull();
  });

  test('returns mapped GameRow when an active game exists', () => {
    const activeRow = {
      id: 'active-1',
      mode: 'multiplayer',
      pgn: '',
      result: '*',
      player_white: 'Bob',
      player_black: 'Carol',
      white_ms: 10_000,
      black_ms: 10_000,
      created_at: 5_000,
      updated_at: 6_000,
    };
    mockExecute.mockReturnValueOnce({ rows: makeRows([activeRow]) });
    const result = getActiveGame();
    expect(result).not.toBeNull();
    expect(result!.id).toBe('active-1');
    expect(result!.result).toBe('*');
    expect(result!.mode).toBe('multiplayer');
  });
});

// ---------------------------------------------------------------------------
// Games — deleteGame
// ---------------------------------------------------------------------------

describe('deleteGame', () => {
  test('calls execute with DELETE FROM games WHERE id = ?', () => {
    deleteGame('to-delete');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/DELETE FROM games WHERE id = \?/i);
    expect(params).toEqual(['to-delete']);
  });
});

// ---------------------------------------------------------------------------
// Moves — saveMove
// ---------------------------------------------------------------------------

describe('saveMove', () => {
  const moveInput: Omit<MoveRow, 'id' | 'created_at'> = {
    game_id: 'game-abc',
    san: 'e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    from_sq: 'e2',
    to_sq: 'e4',
    promotion: null,
    move_number: 1,
    white_ms_after: 295_000,
    black_ms_after: 300_000,
  };

  test('calls execute with INSERT INTO moves', () => {
    saveMove(moveInput);
    const [sql] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/INSERT INTO moves/i);
  });

  test('passes all fields as parameters in correct positions', () => {
    saveMove(moveInput);
    const [, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    // [id, game_id, san, fen, from_sq, to_sq, promotion, move_number, white_ms_after, black_ms_after, created_at]
    expect(params[1]).toBe('game-abc');
    expect(params[2]).toBe('e4');
    expect(params[4]).toBe('e2');
    expect(params[5]).toBe('e4');
    expect(params[6]).toBeNull();
    expect(params[7]).toBe(1);
    expect(params[8]).toBe(295_000);
    expect(params[9]).toBe(300_000);
  });

  test('returns MoveRow with generated id and created_at', () => {
    const result = saveMove(moveInput);
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.created_at).toBeGreaterThan(0);
    expect(result.game_id).toBe('game-abc');
    expect(result.san).toBe('e4');
  });

  test('passes promotion piece when provided', () => {
    saveMove({ ...moveInput, promotion: 'q' });
    const [, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(params[6]).toBe('q');
  });
});

// ---------------------------------------------------------------------------
// Moves — getMovesForGame
// ---------------------------------------------------------------------------

describe('getMovesForGame', () => {
  const move1 = {
    id: 'm1',
    game_id: 'g1',
    san: 'e4',
    fen: 'fen1',
    from_sq: 'e2',
    to_sq: 'e4',
    promotion: null,
    move_number: 1,
    white_ms_after: 295_000,
    black_ms_after: 300_000,
    created_at: 100,
  };
  const move2 = {
    id: 'm2',
    game_id: 'g1',
    san: 'e5',
    fen: 'fen2',
    from_sq: 'e7',
    to_sq: 'e5',
    promotion: null,
    move_number: 1,
    white_ms_after: 295_000,
    black_ms_after: 295_000,
    created_at: 200,
  };

  test('queries with ORDER BY move_number, created_at', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([move1, move2]) });
    getMovesForGame('g1');
    const [sql, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/ORDER BY move_number.*created_at/i);
    expect(params).toEqual(['g1']);
  });

  test('returns moves in the order provided by DB', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([move1, move2]) });
    const moves = getMovesForGame('g1');
    expect(moves).toHaveLength(2);
    expect(moves[0]!.id).toBe('m1');
    expect(moves[1]!.id).toBe('m2');
  });

  test('maps MoveRow fields correctly', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([move1]) });
    const [m] = getMovesForGame('g1') as [ReturnType<typeof getMovesForGame>[number]];
    expect(m!.game_id).toBe('g1');
    expect(m!.san).toBe('e4');
    expect(m!.from_sq).toBe('e2');
    expect(m!.to_sq).toBe('e4');
    expect(m!.promotion).toBeNull();
    expect(m!.move_number).toBe(1);
    expect(m!.white_ms_after).toBe(295_000);
    expect(m!.black_ms_after).toBe(300_000);
  });

  test('returns empty array when no moves exist', () => {
    const result = getMovesForGame('g-empty');
    expect(result).toEqual([]);
  });

  test('sets promotion to null when field is absent', () => {
    const rowMissingPromotion = { ...move1, promotion: undefined };
    mockExecute.mockReturnValueOnce({ rows: makeRows([rowMissingPromotion]) });
    const [m] = getMovesForGame('g1');
    expect(m!.promotion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Moves — deleteLastMove
// ---------------------------------------------------------------------------

describe('deleteLastMove', () => {
  test('calls execute with a DELETE using a subquery on move_number DESC', () => {
    deleteLastMove('game-xyz');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/DELETE FROM moves/i);
    expect(sql).toMatch(/ORDER BY move_number DESC/i);
    expect(params).toEqual(['game-xyz']);
  });
});

// ---------------------------------------------------------------------------
// Analysis — saveAnalysis
// ---------------------------------------------------------------------------

describe('saveAnalysis', () => {
  const analysisInput: Omit<AnalysisRow, 'id' | 'created_at' | 'updated_at'> = {
    game_id: 'game-1',
    status: 'pending',
    job_id: null,
    payload_json: null,
  };

  test('calls execute with INSERT INTO analysis', () => {
    saveAnalysis(analysisInput);
    const [sql] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/INSERT INTO analysis/i);
  });

  test('passes all fields as parameters', () => {
    saveAnalysis(analysisInput);
    const [, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    // [id, game_id, status, job_id, payload_json, created_at, updated_at]
    expect(params[1]).toBe('game-1');
    expect(params[2]).toBe('pending');
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
  });

  test('returns AnalysisRow with generated id and timestamps', () => {
    const result = saveAnalysis(analysisInput);
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.game_id).toBe('game-1');
    expect(result.status).toBe('pending');
    expect(result.created_at).toBeGreaterThan(0);
    expect(result.updated_at).toBe(result.created_at);
  });

  test('stores payload_json when provided', () => {
    const payload = JSON.stringify({ score: 0.3 });
    const result = saveAnalysis({ ...analysisInput, status: 'done', payload_json: payload });
    expect(result.payload_json).toBe(payload);
  });
});

// ---------------------------------------------------------------------------
// Analysis — getAnalysis
// ---------------------------------------------------------------------------

describe('getAnalysis', () => {
  const fakeAnalysisRow = {
    id: 'an-1',
    game_id: 'game-1',
    status: 'done',
    job_id: 'job-42',
    payload_json: '{"score":0.5}',
    created_at: 1_000,
    updated_at: 2_000,
  };

  test('queries with ORDER BY created_at DESC LIMIT 1', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([fakeAnalysisRow]) });
    getAnalysis('game-1');
    const [sql, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/ORDER BY created_at DESC LIMIT 1/i);
    expect(params).toEqual(['game-1']);
  });

  test('maps the row to AnalysisRow correctly', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([fakeAnalysisRow]) });
    const result = getAnalysis('game-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('an-1');
    expect(result!.game_id).toBe('game-1');
    expect(result!.status).toBe('done');
    expect(result!.job_id).toBe('job-42');
    expect(result!.payload_json).toBe('{"score":0.5}');
    expect(result!.created_at).toBe(1_000);
    expect(result!.updated_at).toBe(2_000);
  });

  test('returns null when no analysis exists', () => {
    expect(getAnalysis('no-game')).toBeNull();
  });

  test('sets job_id and payload_json to null when absent', () => {
    const rowWithoutOptionals = { ...fakeAnalysisRow, job_id: undefined, payload_json: undefined };
    mockExecute.mockReturnValueOnce({ rows: makeRows([rowWithoutOptionals]) });
    const result = getAnalysis('game-1');
    expect(result!.job_id).toBeNull();
    expect(result!.payload_json).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Analysis — saveAnalysis / getAnalysis round-trip (via mock)
// ---------------------------------------------------------------------------

describe('saveAnalysis / getAnalysis round-trip', () => {
  test('data saved matches data retrieved when mock returns the same row', () => {
    const input: Omit<AnalysisRow, 'id' | 'created_at' | 'updated_at'> = {
      game_id: 'game-rt',
      status: 'running',
      job_id: 'job-99',
      payload_json: '{"depth":20}',
    };

    // First call: INSERT (saveAnalysis)
    const saved = saveAnalysis(input);

    // Second call: SELECT (getAnalysis) — mock returns what saveAnalysis produced
    mockExecute.mockReturnValueOnce({
      rows: makeRows([
        {
          id: saved.id,
          game_id: saved.game_id,
          status: saved.status,
          job_id: saved.job_id,
          payload_json: saved.payload_json,
          created_at: saved.created_at,
          updated_at: saved.updated_at,
        },
      ]),
    });

    const retrieved = getAnalysis('game-rt');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(saved.id);
    expect(retrieved!.game_id).toBe(saved.game_id);
    expect(retrieved!.status).toBe(saved.status);
    expect(retrieved!.job_id).toBe(saved.job_id);
    expect(retrieved!.payload_json).toBe(saved.payload_json);
    expect(retrieved!.created_at).toBe(saved.created_at);
    expect(retrieved!.updated_at).toBe(saved.updated_at);
  });
});

// ---------------------------------------------------------------------------
// Analysis — updateAnalysis
// ---------------------------------------------------------------------------

describe('updateAnalysis', () => {
  test('calls execute with UPDATE analysis SET … WHERE game_id = ?', () => {
    updateAnalysis('game-1', { status: 'done', payload_json: '{}' });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/UPDATE analysis SET/i);
    expect(sql).toMatch(/WHERE game_id = \?/i);
    expect(params[0]).toBe('done');
    expect(params[1]).toBe('{}');
    expect(params[params.length - 1]).toBe('game-1');
  });
});

// ---------------------------------------------------------------------------
// Sessions — saveSession
// ---------------------------------------------------------------------------

describe('saveSession', () => {
  const sessionInput: Omit<SessionRow, 'id' | 'created_at'> = {
    game_id: 'game-s1',
    transport: 'p2p',
    peer_id: 'peer-abc',
  };

  test('calls execute with INSERT INTO sessions', () => {
    saveSession(sessionInput);
    const [sql] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/INSERT INTO sessions/i);
  });

  test('passes all fields as parameters', () => {
    saveSession(sessionInput);
    const [, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    // [id, game_id, transport, peer_id, created_at]
    expect(params[1]).toBe('game-s1');
    expect(params[2]).toBe('p2p');
    expect(params[3]).toBe('peer-abc');
  });

  test('returns SessionRow with generated id and created_at', () => {
    const result = saveSession(sessionInput);
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.created_at).toBeGreaterThan(0);
    expect(result.game_id).toBe('game-s1');
    expect(result.transport).toBe('p2p');
  });

  test('handles null peer_id', () => {
    const result = saveSession({ ...sessionInput, peer_id: null });
    expect(result.peer_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sessions — getSessionForGame
// ---------------------------------------------------------------------------

describe('getSessionForGame', () => {
  const fakeSession = {
    id: 'sess-1',
    game_id: 'game-s1',
    transport: 'cloud',
    peer_id: 'peer-xyz',
    created_at: 9_000,
  };

  test('queries with ORDER BY created_at DESC LIMIT 1', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([fakeSession]) });
    getSessionForGame('game-s1');
    const [sql, params] = (mockExecute.mock.calls[0] as unknown as [string, unknown[]])!;
    expect(sql).toMatch(/ORDER BY created_at DESC LIMIT 1/i);
    expect(params).toEqual(['game-s1']);
  });

  test('maps row to SessionRow correctly', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([fakeSession]) });
    const result = getSessionForGame('game-s1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('sess-1');
    expect(result!.game_id).toBe('game-s1');
    expect(result!.transport).toBe('cloud');
    expect(result!.peer_id).toBe('peer-xyz');
    expect(result!.created_at).toBe(9_000);
  });

  test('returns null when no session exists', () => {
    expect(getSessionForGame('no-game')).toBeNull();
  });

  test('sets peer_id to null when absent in row', () => {
    mockExecute.mockReturnValueOnce({ rows: makeRows([{ ...fakeSession, peer_id: undefined }]) });
    const result = getSessionForGame('game-s1');
    expect(result!.peer_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getGameStats
// ---------------------------------------------------------------------------

describe('getGameStats', () => {
  const makeGame = (id: string, result: string) => ({
    id,
    mode: 'otb',
    pgn: '',
    result,
    player_white: null,
    player_black: null,
    white_ms: 0,
    black_ms: 0,
    created_at: 1_000,
    updated_at: 1_000,
  });

  test('counts wins, draws, losses correctly', () => {
    mockExecute.mockReturnValueOnce({
      rows: makeRows([
        makeGame('g1', '1-0'),
        makeGame('g2', '1-0'),
        makeGame('g3', '0-1'),
        makeGame('g4', '1/2-1/2'),
        makeGame('g5', '*'),
      ]),
    });
    const stats = getGameStats();
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.draws).toBe(1);
    expect(stats.total).toBe(5); // total includes in-progress '*'
  });

  test('returns zeros when no games exist', () => {
    // mockExecute already returns EMPTY_RESULT by default
    const stats = getGameStats();
    expect(stats.wins).toBe(0);
    expect(stats.draws).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.total).toBe(0);
  });

  test('excludes in-progress games from win/draw/loss counts', () => {
    mockExecute.mockReturnValueOnce({
      rows: makeRows([makeGame('g1', '*'), makeGame('g2', '*')]),
    });
    const stats = getGameStats();
    expect(stats.wins).toBe(0);
    expect(stats.draws).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.total).toBe(2);
  });
});
