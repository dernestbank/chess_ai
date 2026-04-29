import { GameCore } from '../../src/domain/gamecore';
import { SessionConfig } from '../../src/domain/gamecore/types';

const config: SessionConfig = {
  id: 'test-game',
  mode: 'bot',
  boardOrientation: 'white-bottom',
  assistLevel: 'off',
};

describe('GameCore', () => {
  let core: GameCore;

  beforeEach(() => {
    core = new GameCore(config);
  });

  test('starts at initial FEN', () => {
    const state = core.getState();
    expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(state.moves).toHaveLength(0);
    expect(state.result).toBe('*');
  });

  test('applyMove returns updated state for legal move', () => {
    const state = core.applyMove('e2', 'e4');
    expect(state).not.toBeNull();
    expect(state!.moves).toHaveLength(1);
    expect(state!.moves[0]!.san).toBe('e4');
    expect(state!.fen).toContain('b'); // black to move
  });

  test('applyMove returns null for illegal move', () => {
    const state = core.applyMove('e2', 'e5'); // illegal
    expect(state).toBeNull();
  });

  test('undoMove removes last move', () => {
    core.applyMove('e2', 'e4');
    core.applyMove('e7', 'e5');
    const state = core.undoMove();
    expect(state.moves).toHaveLength(1);
    expect(state.moves[0]!.san).toBe('e4');
  });

  test('getLegalMovesFrom returns correct targets', () => {
    const targets = core.getLegalMovesFrom('e2');
    expect(targets).toContain('e3');
    expect(targets).toContain('e4');
    expect(targets).not.toContain('e5');
  });

  test('getLegalMoves returns 20 moves at start', () => {
    const moves = core.getLegalMoves();
    expect(moves).toHaveLength(20);
  });

  test('exportPGN returns valid PGN string', () => {
    core.applyMove('e2', 'e4');
    core.applyMove('e7', 'e5');
    const pgn = core.exportPGN();
    expect(pgn).toContain('e4');
    expect(pgn).toContain('e5');
  });

  test('isGameOver returns false at start', () => {
    expect(core.isGameOver().over).toBe(false);
  });

  test('detects checkmate', () => {
    // Fool's mate
    core.applyMove('f2', 'f3');
    core.applyMove('e7', 'e5');
    core.applyMove('g2', 'g4');
    core.applyMove('d8', 'h4'); // Qh4#
    const over = core.isGameOver();
    expect(over.over).toBe(true);
    expect(over.result).toBe('0-1');
    expect(over.reason).toBe('checkmate');
  });

  test('loadFEN resets to given position', () => {
    core.applyMove('e2', 'e4');
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const state = core.loadFEN(fen);
    expect(state.fen).toBe(fen);
    expect(state.moves).toHaveLength(0);
  });
});

describe('pgn helpers', () => {
  test('fenToBoard parses starting position correctly', () => {
    const { fenToBoard } = require('../../src/domain/gamecore/pgn');
    const board = fenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(board[0][0]).toBe('bR'); // a8
    expect(board[0][4]).toBe('bK'); // e8
    expect(board[7][4]).toBe('wK'); // e1
    expect(board[4][0]).toBe(''); // empty square
  });
});
