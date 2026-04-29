import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';

const DB_NAME = 'boardsight.db';

// ---------------------------------------------------------------------------
// Schema — v1 DDL inline (can't load .sql files in RN bundle)
// ---------------------------------------------------------------------------
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'otb',
        pgn TEXT NOT NULL DEFAULT '',
        result TEXT NOT NULL DEFAULT '*',
        player_white TEXT,
        player_black TEXT,
        white_ms INTEGER NOT NULL DEFAULT 0,
        black_ms INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS moves (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        san TEXT NOT NULL,
        fen TEXT NOT NULL,
        from_sq TEXT NOT NULL,
        to_sq TEXT NOT NULL,
        promotion TEXT,
        move_number INTEGER NOT NULL,
        white_ms_after INTEGER NOT NULL DEFAULT 0,
        black_ms_after INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analysis (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        job_id TEXT,
        payload_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        transport TEXT NOT NULL DEFAULT 'p2p',
        peer_id TEXT,
        created_at INTEGER NOT NULL
      );
    `,
  },
];

// ---------------------------------------------------------------------------
// Connection singleton
// ---------------------------------------------------------------------------
let _db: QuickSQLiteConnection | null = null;

export function getDb(): QuickSQLiteConnection {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}

export async function initDb(): Promise<void> {
  _db = open({ name: DB_NAME });
  await runMigrations(_db);
}

export async function closeDb(): Promise<void> {
  _db?.close();
  _db = null;
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------
async function runMigrations(db: QuickSQLiteConnection): Promise<void> {
  // Ensure schema_version table exists first
  db.execute(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const result = db.execute('SELECT MAX(version) as current FROM schema_version;');
  const currentVersion: number = result.rows?.item(0)?.current ?? 0;

  const pending = MIGRATIONS.filter(m => m.version > currentVersion);

  for (const migration of pending) {
    db.execute('BEGIN TRANSACTION;');
    try {
      // Run each statement separately (quick-sqlite doesn't support multi-statement)
      const statements = migration.sql
        .split(';')
        .map(s => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        db.execute(stmt + ';');
      }
      db.execute(
        'INSERT INTO schema_version (version, applied_at) VALUES (?, ?);',
        [migration.version, Date.now()],
      );
      db.execute('COMMIT;');
    } catch (err) {
      db.execute('ROLLBACK;');
      throw new Error(`Migration v${migration.version} failed: ${String(err)}`);
    }
  }
}
