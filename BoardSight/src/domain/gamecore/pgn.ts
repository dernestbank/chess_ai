import { Chess } from 'chess.js';
import { GameResult, Move } from './types';

/** Parse a PGN string into a Move array. Returns [] on parse failure. */
export function pgnToMoves(pgn: string): Move[] {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    const moves: Move[] = [];
    const replay = new Chess();
    history.forEach((h, idx) => {
      replay.move(h);
      moves.push({
        san: h.san,
        from: h.from,
        to: h.to,
        promotion: h.promotion as Move['promotion'],
        fen: replay.fen(),
        whiteMs: 0,
        blackMs: 0,
        moveNumber: Math.floor(idx / 2) + 1,
        timestamp: Date.now(),
      });
    });
    return moves;
  } catch {
    return [];
  }
}

/** Build a PGN string from a moves array and result. */
export function movesToPgn(moves: Move[], result: GameResult): string {
  const chess = new Chess();
  moves.forEach(m => {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  });
  return chess.pgn() + (result !== '*' ? ` ${result}` : '');
}

/**
 * Parse a FEN string into an 8x8 board array.
 * Each cell is a piece string like "wP", "bK", or "" for empty.
 * Row 0 = rank 8 (top of board), col 0 = file a.
 */
export function fenToBoard(fen: string): string[][] {
  const board: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  const piecePart = fen.split(' ')[0] ?? '';
  const ranks = piecePart.split('/');
  ranks.forEach((rank, rowIdx) => {
    let colIdx = 0;
    for (const ch of rank) {
      const num = parseInt(ch, 10);
      if (!isNaN(num)) {
        colIdx += num;
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        board[rowIdx]![colIdx] = color + ch.toUpperCase();
        colIdx++;
      }
    }
  });
  return board;
}

/** Add or overwrite PGN header tags. */
export function addPgnHeaders(pgn: string, headers: Record<string, string>): string {
  let result = pgn;
  for (const [key, value] of Object.entries(headers)) {
    const tag = `[${key} "${value}"]`;
    const existing = new RegExp(`\\[${key} "[^"]*"\\]`);
    if (existing.test(result)) {
      result = result.replace(existing, tag);
    } else {
      result = tag + '\n' + result;
    }
  }
  return result;
}
