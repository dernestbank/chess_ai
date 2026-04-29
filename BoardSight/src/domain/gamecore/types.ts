export interface Point {
  x: number;
  y: number;
}

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Square = string; // e.g. "e2"
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';
export type GameMode = 'otb' | 'bot' | 'multiplayer';
export type AssistLevel = 'off' | 'light' | 'on';
export type BotDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Move {
  san: string;
  from: Square;
  to: Square;
  promotion?: PieceType;
  fen: string; // FEN after the move
  whiteMs: number;
  blackMs: number;
  moveNumber: number;
  timestamp: number;
}

export interface ClockState {
  whiteMs: number;
  blackMs: number;
  activeColor: Color | null;
  increment: number; // ms to add after each move
  lastTickAt: number; // Date.now() when clock last started/ticked
  isRunning: boolean;
}

export interface TimeControl {
  name: string;
  timeMs: number;
  increment: number; // ms
}

export interface GameState {
  id: string;
  mode: GameMode;
  fen: string;
  moves: Move[];
  pgn: string;
  result: GameResult;
  clock: ClockState;
  assistLevel: AssistLevel;
  playerWhite?: string;
  playerBlack?: string;
}

export interface SessionConfig {
  id: string;
  mode: GameMode;
  boardOrientation: 'white-bottom' | 'black-bottom';
  timeControl?: TimeControl;
  assistLevel: AssistLevel;
  botDifficulty?: BotDifficulty;
  playerWhite?: string;
  playerBlack?: string;
  /** Optional FEN to start from (drills, custom positions). Defaults to starting position. */
  startFen?: string;
}
