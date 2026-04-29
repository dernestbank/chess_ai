import { AppState as RNAppState, AppStateStatus } from 'react-native';
import { create } from 'zustand';
import {
  createGameCore,
  GameCore,
} from '../gamecore';
import {
  Color,
  GameMode,
  GameResult,
  GameState,
  PieceType,
  SessionConfig,
  Square,
} from '../gamecore/types';
import {
  createGame,
  deleteLastMove,
  getActiveGame,
  getGame,
  getMovesForGame,
  saveMove,
  updateGame,
} from '../../data/repositories';
import { initDb } from '../../data/db';
import { routeAnalysis, AnalysisConfig } from '../analysisRouter';
import { getAnalysis, saveAnalysis, updateAnalysis } from '../../data/repositories';
import { pollAnalysis, JobStatus } from '../../api/analysis';
import { initApiClient } from '../../api/client';
import { getSettings } from '../settings';

// ---------------------------------------------------------------------------
// Store state shape
// ---------------------------------------------------------------------------
interface GameServiceState {
  core: GameCore | null;
  gameState: GameState | null;
  gameId: string | null;
  isLoading: boolean;
  error: string | null;

  /** Start a completely new game and persist it. Returns the new gameId. */
  startNewGame(config: SessionConfig): Promise<string>;

  /**
   * Check for an incomplete game (result='*') saved in SQLite.
   * Returns the gameId if one exists, null otherwise.
   */
  checkForActiveGame(): Promise<string | null>;

  /** Load and resume a game from SQLite by ID. */
  loadGame(gameId: string): Promise<void>;

  /**
   * Apply a move, persist it to SQLite, switch the clock.
   * Returns true if the move was legal, false otherwise.
   */
  applyMove(from: Square, to: Square, promotion?: PieceType): boolean;

  /** Undo the last move, remove it from SQLite. */
  undoMove(): void;

  /** Start the clock for the given color (call at game start). */
  startClock(color?: Color): void;

  /** Pause: freeze clock + persist remaining time. */
  pauseGame(): void;

  /** Resume: restart clock from persisted time. */
  resumeGame(): void;

  /** Record a definitive result (resign / draw offer / timeout). */
  endGame(result: GameResult): void;

  /** Export the current game as PGN. */
  exportPGN(headers?: Record<string, string>): string;

  /** Clear everything — ready for a new game. */
  reset(): void;

  /**
   * Force the board to a specific FEN without clearing move history.
   * Used by guest to accept a host-approved correction.
   */
  syncToFen(fen: string): void;
}

// ---------------------------------------------------------------------------
// Clock interval (module-level, not in Zustand — avoids serialisation issues)
// ---------------------------------------------------------------------------
let _clockInterval: ReturnType<typeof setInterval> | null = null;
let _appStateSubscription: ReturnType<typeof RNAppState.addEventListener> | null = null;

function stopClockInterval() {
  if (_clockInterval !== null) {
    clearInterval(_clockInterval);
    _clockInterval = null;
  }
}

function startClockInterval(tickFn: () => void) {
  stopClockInterval();
  _clockInterval = setInterval(tickFn, 100);
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------
export const useGameService = create<GameServiceState>((set, get) => ({
  core: null,
  gameState: null,
  gameId: null,
  isLoading: false,
  error: null,

  // -------------------------------------------------------------------------
  startNewGame: async (config: SessionConfig): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      await initDb();

      const core = createGameCore(config);
      const state = core.getState();

      // Persist to SQLite
      const row = createGame({
        mode: config.mode,
        pgn: '',
        result: '*',
        player_white: config.playerWhite ?? null,
        player_black: config.playerBlack ?? null,
        white_ms: state.clock.whiteMs,
        black_ms: state.clock.blackMs,
      });

      set({ core, gameState: state, gameId: row.id, isLoading: false });
      _setupAppStateListener(row.id);
      return row.id;
    } catch (err) {
      set({ isLoading: false, error: String(err) });
      throw err;
    }
  },

  // -------------------------------------------------------------------------
  checkForActiveGame: async (): Promise<string | null> => {
    await initDb();
    const row = getActiveGame();
    return row?.id ?? null;
  },

  // -------------------------------------------------------------------------
  loadGame: async (gameId: string): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      await initDb();
      const row = getGame(gameId);
      if (!row) { throw new Error(`Game ${gameId} not found`); }

      const moves = getMovesForGame(gameId);
      const lastMove = moves[moves.length - 1];

      const config: SessionConfig = {
        id: row.id,
        mode: row.mode as GameMode,
        boardOrientation: 'white-bottom',
        assistLevel: 'off',
        playerWhite: row.player_white ?? undefined,
        playerBlack: row.player_black ?? undefined,
      };

      const core = createGameCore(config);
      // Replay all moves to restore position
      for (const m of moves) {
        core.applyMove(m.from_sq, m.to_sq, m.promotion as PieceType | undefined);
      }

      // Restore clock from last saved values
      if (lastMove) {
        const restoredState = core.getState();
        const restoredClock = {
          ...restoredState.clock,
          whiteMs: lastMove.white_ms_after,
          blackMs: lastMove.black_ms_after,
          isRunning: false,
          activeColor: null as Color | null,
        };
        // Patch clock directly (GameCore re-creates it)
        (core as any).state = { ...restoredState, clock: restoredClock };
      }

      set({ core, gameState: core.getState(), gameId, isLoading: false });
      _setupAppStateListener(gameId);
    } catch (err) {
      set({ isLoading: false, error: String(err) });
      throw err;
    }
  },

  // -------------------------------------------------------------------------
  applyMove: (from: Square, to: Square, promotion?: PieceType): boolean => {
    const { core, gameId } = get();
    if (!core || !gameId) { return false; }

    const newState = core.applyMove(from, to, promotion);
    if (!newState) { return false; }

    const move = newState.moves[newState.moves.length - 1];
    if (!move) { return false; }

    // Persist move to SQLite
    saveMove({
      game_id: gameId,
      san: move.san,
      fen: move.fen,
      from_sq: move.from,
      to_sq: move.to,
      promotion: move.promotion ?? null,
      move_number: move.moveNumber,
      white_ms_after: move.whiteMs,
      black_ms_after: move.blackMs,
    });

    // Persist PGN + result + clock to games table
    updateGame(gameId, {
      pgn: newState.pgn,
      result: newState.result,
      white_ms: newState.clock.whiteMs,
      black_ms: newState.clock.blackMs,
    });

    set({ gameState: newState });

    // Check game over
    const over = core.isGameOver();
    if (over.over) {
      get().endGame(over.result);
    } else {
      // Start clock ticking for next player
      _startTicking();
    }
    return true;
  },

  // -------------------------------------------------------------------------
  undoMove: (): void => {
    const { core, gameId } = get();
    if (!core || !gameId) { return; }

    const newState = core.undoMove();
    deleteLastMove(gameId);
    updateGame(gameId, { pgn: newState.pgn, result: '*' });
    set({ gameState: newState });
  },

  // -------------------------------------------------------------------------
  startClock: (color: Color = 'w'): void => {
    const { core } = get();
    if (!core) { return; }
    const newState = core.startClock(color);
    set({ gameState: newState });
    _startTicking();
  },

  // -------------------------------------------------------------------------
  pauseGame: (): void => {
    stopClockInterval();
    const { core, gameId } = get();
    if (!core || !gameId) { return; }
    const newState = core.pauseClock();
    set({ gameState: newState });
    updateGame(gameId, {
      white_ms: newState.clock.whiteMs,
      black_ms: newState.clock.blackMs,
    });
  },

  // -------------------------------------------------------------------------
  resumeGame: (): void => {
    const { core } = get();
    if (!core) { return; }
    const newState = core.resumeClock();
    set({ gameState: newState });
    _startTicking();
  },

  // -------------------------------------------------------------------------
  endGame: (result: GameResult): void => {
    stopClockInterval();
    _appStateSubscription?.remove();
    _appStateSubscription = null;

    const { gameId, core } = get();
    if (gameId) {
      updateGame(gameId, { result, pgn: core?.exportPGN() ?? '' });
    }
    const current = get().gameState;
    if (current) {
      set({ gameState: { ...current, result } });
    }

    // Auto-trigger analysis
    const pgn = core?.exportPGN() ?? '';
    if (pgn && gameId) {
      _triggerAnalysis(gameId, pgn).catch(err =>
        console.warn('[GameService] Analysis failed:', err)
      );
    }
  },

  // -------------------------------------------------------------------------
  exportPGN: (headers?: Record<string, string>): string => {
    const { core } = get();
    return core?.exportPGN(headers) ?? '';
  },

  // -------------------------------------------------------------------------
  reset: (): void => {
    stopClockInterval();
    _appStateSubscription?.remove();
    _appStateSubscription = null;
    set({ core: null, gameState: null, gameId: null, isLoading: false, error: null });
  },

  // -------------------------------------------------------------------------
  syncToFen: (fen: string): void => {
    // On correction approval, undo the last move to match the host's corrected state.
    // The fen param is used for validation only — the undo restores the correct position.
    const { core } = get();
    if (!core) { return; }
    const newState = core.undoMove();
    set({ gameState: newState });
    console.log(`[GameService] syncToFen: undid last move, expected FEN: ${fen}`);
  },
}));

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Tick the clock every 100ms and update Zustand state. */
function _startTicking() {
  startClockInterval(() => {
    const { core, gameState } = useGameService.getState();
    if (!core || !gameState?.clock.isRunning) {
      stopClockInterval();
      return;
    }
    const newState = core.updateClock(Date.now());
    useGameService.setState({ gameState: newState });

    // Check for timeout
    const { isTimeout } = require('../gamecore/clock');
    const timedOut: Color | null = isTimeout(newState.clock);
    if (timedOut !== null) {
      const result: GameResult = timedOut === 'w' ? '0-1' : '1-0';
      useGameService.getState().endGame(result);
    }
  });
}

/** Listen for app going to background/foreground and pause/resume clock. */
function _setupAppStateListener(_gameId: string) {
  _appStateSubscription?.remove();
  _appStateSubscription = RNAppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        useGameService.getState().pauseGame();
      } else if (nextState === 'active') {
        useGameService.getState().resumeGame();
      }
    },
  );
}

/** Trigger post-game analysis asynchronously. */
async function _triggerAnalysis(gameId: string, pgn: string): Promise<void> {
  // Analysis cache: skip if a completed result already exists in SQLite
  const existing = getAnalysis(gameId);
  if (existing?.status === 'done' && existing.payload_json) {
    return; // already analysed — no need to re-request
  }

  const settings = await getSettings();

  // Initialize API client with user's cloud endpoint + key if configured
  if (settings.cloudEndpointUrl) {
    initApiClient(settings.cloudEndpointUrl, settings.apiKey);
  }

  const config: AnalysisConfig = {
    mode: settings.analysisModeDefault,
    enableLLM: settings.enableLLMExplanations,
    cloudEndpointUrl: settings.cloudEndpointUrl || undefined,
    apiKey: settings.apiKey || undefined,
  };
  const jobId = await routeAnalysis(pgn, config);

  saveAnalysis({
    game_id: gameId,
    status: 'pending',
    job_id: jobId,
    payload_json: null,
  });

  if (!jobId.startsWith('local_')) {
    // Cloud job — poll for result
    try {
      const result = await pollAnalysis(jobId, (status: JobStatus) => {
        // Map API 'queued' → DB 'pending'
        const dbStatus = status === 'queued' ? 'pending' : status;
        updateAnalysis(gameId, { status: dbStatus, job_id: jobId });
      });
      updateAnalysis(gameId, {
        status: 'done',
        payload_json: JSON.stringify(result),
      });
    } catch {
      updateAnalysis(gameId, { status: 'failed' });
    }
  }
}
