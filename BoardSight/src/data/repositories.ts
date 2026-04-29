import { getDb } from './db';
import { AnalysisRow, GameRow, MoveRow, SessionRow } from './models';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function rowToGame(row: any): GameRow {
  return {
    id: row.id,
    mode: row.mode,
    pgn: row.pgn,
    result: row.result,
    player_white: row.player_white ?? null,
    player_black: row.player_black ?? null,
    white_ms: row.white_ms,
    black_ms: row.black_ms,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToMove(row: any): MoveRow {
  return {
    id: row.id,
    game_id: row.game_id,
    san: row.san,
    fen: row.fen,
    from_sq: row.from_sq,
    to_sq: row.to_sq,
    promotion: row.promotion ?? null,
    move_number: row.move_number,
    white_ms_after: row.white_ms_after,
    black_ms_after: row.black_ms_after,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------
export function createGame(
  data: Omit<GameRow, 'id' | 'created_at' | 'updated_at'>,
): GameRow {
  const db = getDb();
  const now = Date.now();
  const id = uid();
  db.execute(
    `INSERT INTO games (id, mode, pgn, result, player_white, player_black, white_ms, black_ms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, data.mode, data.pgn, data.result, data.player_white, data.player_black, data.white_ms, data.black_ms, now, now],
  );
  return { ...data, id, created_at: now, updated_at: now };
}

export function getGame(id: string): GameRow | null {
  const db = getDb();
  const result = db.execute('SELECT * FROM games WHERE id = ?;', [id]);
  const row = result.rows?.item(0);
  return row ? rowToGame(row) : null;
}

export function updateGame(id: string, updates: Partial<Omit<GameRow, 'id' | 'created_at'>>): void {
  const db = getDb();
  const now = Date.now();
  const fields = Object.keys(updates)
    .map(k => `${k} = ?`)
    .join(', ');
  const values = [...Object.values(updates), now, id];
  db.execute(`UPDATE games SET ${fields}, updated_at = ? WHERE id = ?;`, values);
}

export function listGames(limit = 50, offset = 0): GameRow[] {
  const db = getDb();
  const result = db.execute(
    'SELECT * FROM games ORDER BY created_at DESC LIMIT ? OFFSET ?;',
    [limit, offset],
  );
  const rows: GameRow[] = [];
  for (let i = 0; i < (result.rows?.length ?? 0); i++) {
    rows.push(rowToGame(result.rows!.item(i)));
  }
  return rows;
}

export function getActiveGame(): GameRow | null {
  const db = getDb();
  const result = db.execute(
    "SELECT * FROM games WHERE result = '*' ORDER BY updated_at DESC LIMIT 1;",
  );
  const row = result.rows?.item(0);
  return row ? rowToGame(row) : null;
}

export function deleteGame(id: string): void {
  getDb().execute('DELETE FROM games WHERE id = ?;', [id]);
}

export interface GameStats {
  wins: number;
  draws: number;
  losses: number;
  total: number;
}

export function getGameStats(): GameStats {
  const rows = listGames(10_000);
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const g of rows) {
    if (g.result === '1-0') { wins++; }
    else if (g.result === '0-1') { losses++; }
    else if (g.result === '1/2-1/2') { draws++; }
    // '*' (in-progress) is excluded from stats
  }
  return { wins, draws, losses, total: rows.length };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------
export function saveMove(move: Omit<MoveRow, 'id' | 'created_at'>): MoveRow {
  const db = getDb();
  const id = uid();
  const now = Date.now();
  db.execute(
    `INSERT INTO moves (id, game_id, san, fen, from_sq, to_sq, promotion, move_number, white_ms_after, black_ms_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, move.game_id, move.san, move.fen, move.from_sq, move.to_sq, move.promotion, move.move_number, move.white_ms_after, move.black_ms_after, now],
  );
  return { ...move, id, created_at: now };
}

export function getMovesForGame(gameId: string): MoveRow[] {
  const db = getDb();
  const result = db.execute(
    'SELECT * FROM moves WHERE game_id = ? ORDER BY move_number, created_at;',
    [gameId],
  );
  const rows: MoveRow[] = [];
  for (let i = 0; i < (result.rows?.length ?? 0); i++) {
    rows.push(rowToMove(result.rows!.item(i)));
  }
  return rows;
}

export function deleteLastMove(gameId: string): void {
  const db = getDb();
  db.execute(
    `DELETE FROM moves WHERE id = (
       SELECT id FROM moves WHERE game_id = ? ORDER BY move_number DESC, created_at DESC LIMIT 1
     );`,
    [gameId],
  );
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
export function saveAnalysis(data: Omit<AnalysisRow, 'id' | 'created_at' | 'updated_at'>): AnalysisRow {
  const db = getDb();
  const id = uid();
  const now = Date.now();
  db.execute(
    `INSERT INTO analysis (id, game_id, status, job_id, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [id, data.game_id, data.status, data.job_id, data.payload_json, now, now],
  );
  return { ...data, id, created_at: now, updated_at: now };
}

export function getAnalysis(gameId: string): AnalysisRow | null {
  const db = getDb();
  const result = db.execute(
    'SELECT * FROM analysis WHERE game_id = ? ORDER BY created_at DESC LIMIT 1;',
    [gameId],
  );
  const row = result.rows?.item(0);
  if (!row) { return null; }
  return {
    id: row.id,
    game_id: row.game_id,
    status: row.status,
    job_id: row.job_id ?? null,
    payload_json: row.payload_json ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function updateAnalysis(gameId: string, updates: Partial<Omit<AnalysisRow, 'id' | 'game_id' | 'created_at'>>): void {
  const db = getDb();
  const now = Date.now();
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), now, gameId];
  db.execute(`UPDATE analysis SET ${fields}, updated_at = ? WHERE game_id = ?;`, values);
}

// ---------------------------------------------------------------------------
// Sessions (multiplayer)
// ---------------------------------------------------------------------------
export function saveSession(data: Omit<SessionRow, 'id' | 'created_at'>): SessionRow {
  const db = getDb();
  const id = uid();
  const now = Date.now();
  db.execute(
    'INSERT INTO sessions (id, game_id, transport, peer_id, created_at) VALUES (?, ?, ?, ?, ?);',
    [id, data.game_id, data.transport, data.peer_id, now],
  );
  return { ...data, id, created_at: now };
}

export function getSessionForGame(gameId: string): SessionRow | null {
  const db = getDb();
  const result = db.execute(
    'SELECT * FROM sessions WHERE game_id = ? ORDER BY created_at DESC LIMIT 1;',
    [gameId],
  );
  const row = result.rows?.item(0);
  if (!row) { return null; }
  return {
    id: row.id,
    game_id: row.game_id,
    transport: row.transport,
    peer_id: row.peer_id ?? null,
    created_at: row.created_at,
  };
}
