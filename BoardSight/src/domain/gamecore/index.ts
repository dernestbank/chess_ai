import { Chess, Move as ChessJsMove } from 'chess.js';
import { createClock, pauseClock, resumeClock, switchSides, tickClock } from './clock';
import {
  Color,
  GameResult,
  GameState,
  Move,
  PieceType,
  SessionConfig,
  Square,
} from './types';

export class GameCore {
  private chess: Chess;
  private state: GameState;

  constructor(config: SessionConfig) {
    this.chess = config.startFen ? new Chess(config.startFen) : new Chess();
    const clock = config.timeControl
      ? createClock(config.timeControl.timeMs, config.timeControl.increment)
      : createClock(0, 0);

    this.state = {
      id: config.id,
      mode: config.mode,
      fen: this.chess.fen(),
      moves: [],
      pgn: '',
      result: '*',
      clock,
      assistLevel: config.assistLevel,
      playerWhite: config.playerWhite,
      playerBlack: config.playerBlack,
    };
  }

  /** Apply a move. Returns updated state, or null if the move is illegal. */
  applyMove(from: Square, to: Square, promotion?: PieceType): GameState | null {
    const now = Date.now();
    let chessMove: ChessJsMove | null = null;
    try {
      chessMove = this.chess.move({ from, to, promotion });
    } catch {
      return null;
    }
    if (!chessMove) { return null; }

    const newClock = this.state.clock.isRunning
      ? switchSides(this.state.clock)
      : this.state.clock;

    const move: Move = {
      san: chessMove.san,
      from: chessMove.from,
      to: chessMove.to,
      promotion: chessMove.promotion as PieceType | undefined,
      fen: this.chess.fen(),
      whiteMs: newClock.whiteMs,
      blackMs: newClock.blackMs,
      moveNumber: Math.floor(this.state.moves.length / 2) + 1,
      timestamp: now,
    };

    this.state = {
      ...this.state,
      fen: this.chess.fen(),
      moves: [...this.state.moves, move],
      pgn: this.chess.pgn(),
      clock: newClock,
      result: this._computeResult(),
    };
    return this.state;
  }

  /** Undo the last move. */
  undoMove(): GameState {
    this.chess.undo();
    const moves = this.state.moves.slice(0, -1);
    const lastMove = moves[moves.length - 1];
    const prevClock = lastMove != null
      ? { ...this.state.clock, whiteMs: lastMove.whiteMs, blackMs: lastMove.blackMs }
      : this.state.clock;
    this.state = {
      ...this.state,
      fen: this.chess.fen(),
      moves,
      pgn: this.chess.pgn(),
      clock: prevClock,
      result: '*',
    };
    return this.state;
  }

  getState(): GameState {
    return this.state;
  }

  getLegalMoves(): { from: Square; to: Square; san: string }[] {
    return this.chess.moves({ verbose: true }).map(m => ({
      from: m.from,
      to: m.to,
      san: m.san,
    }));
  }

  getLegalMovesFrom(square: Square): Square[] {
    // chess.js overloads don't infer Move[] from { square, verbose:true } in all versions
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const raw: ChessJsMove[] = this.chess.moves({ square, verbose: true });
    return raw.map(m => m.to as Square);
  }

  loadFEN(fen: string): GameState {
    this.chess.load(fen);
    this.state = {
      ...this.state,
      fen,
      moves: [],
      pgn: '',
      result: '*',
    };
    return this.state;
  }

  exportPGN(headers?: Record<string, string>): string {
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        this.chess.header(key, value);
      }
    }
    return this.chess.pgn();
  }

  isGameOver(): { over: boolean; result: GameResult; reason?: string } {
    if (!this.chess.isGameOver()) {
      return { over: false, result: '*' };
    }
    const result = this._computeResult();
    let reason: string | undefined;
    if (this.chess.isCheckmate()) { reason = 'checkmate'; }
    else if (this.chess.isDraw()) {
      if (this.chess.isStalemate()) { reason = 'stalemate'; }
      else if (this.chess.isInsufficientMaterial()) { reason = 'insufficient material'; }
      else if (this.chess.isThreefoldRepetition()) { reason = 'threefold repetition'; }
      else { reason = 'draw'; }
    }
    return { over: true, result, reason };
  }

  /** Tick the clock — call this every ~100ms from a setInterval. */
  updateClock(now: number = Date.now()): GameState {
    this.state = { ...this.state, clock: tickClock(this.state.clock, now) };
    return this.state;
  }

  /** Start clock for white (call at game start). */
  startClock(color: Color = 'w'): GameState {
    const { startClock: sc } = require('./clock');
    this.state = { ...this.state, clock: sc(this.state.clock, color) };
    return this.state;
  }

  pauseClock(): GameState {
    this.state = { ...this.state, clock: pauseClock(this.state.clock) };
    return this.state;
  }

  resumeClock(): GameState {
    this.state = { ...this.state, clock: resumeClock(this.state.clock) };
    return this.state;
  }

  private _computeResult(): GameResult {
    if (this.chess.isCheckmate()) {
      return this.chess.turn() === 'w' ? '0-1' : '1-0';
    }
    if (this.chess.isDraw()) { return '1/2-1/2'; }
    return '*';
  }
}

export function createGameCore(config: SessionConfig): GameCore {
  return new GameCore(config);
}

export * from './types';
export * from './clock';
export * from './pgn';
