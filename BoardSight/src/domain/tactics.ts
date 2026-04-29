/**
 * Tactics puzzle extraction.
 *
 * Scans completed games that have analysis with move classifications,
 * and generates puzzle positions from blunders and mistakes the user made.
 */

import { getAnalysis, listGames } from '../data/repositories';

export interface TacticsPuzzle {
  gameId: string;
  puzzleFen: string;       // position just BEFORE the blunder
  blunderMove: string;     // the bad move actually played (SAN)
  bestMove: string;        // engine-recommended move (UCI)
  evalDelta: number;       // centipawn loss of the blunder
  moveNumber: number;
  playerColor: 'w' | 'b'; // whose turn it was
}

interface AnalysedMove {
  san: string;
  fromSq: string;
  toSq: string;
  fenBefore: string;
  fenAfter: string;
  evalCp: number;
  classification?: string;
  bestMoveSan?: string;
  moveNumber: number;
  color: 'w' | 'b';
}

/**
 * Extract tactics puzzles from a player's game library.
 *
 * Looks for moves classified as 'blunder' or 'mistake' and returns
 * the position immediately before, so the player can try to find the
 * correct continuation.
 *
 * Returns puzzles ordered by eval delta (worst blunders first).
 */
export async function extractPuzzlesFromLibrary(
  minEvalDelta = 100,
): Promise<TacticsPuzzle[]> {
  const games = listGames(50);
  const puzzles: TacticsPuzzle[] = [];

  for (const game of games) {
    if (game.result === '*') { continue; } // skip ongoing games

    const analysis = getAnalysis(game.id);
    if (!analysis || analysis.status !== 'done' || !analysis.payload_json) { continue; }

    let payload: { moves?: AnalysedMove[] };
    try {
      payload = JSON.parse(analysis.payload_json);
    } catch {
      continue;
    }

    const moves = payload.moves ?? [];
    for (const m of moves) {
      const isBadMove =
        m.classification === 'blunder' ||
        (m.classification === 'mistake' && m.evalCp >= minEvalDelta);

      if (isBadMove && m.fenBefore && m.bestMoveSan) {
        puzzles.push({
          gameId: game.id,
          puzzleFen: m.fenBefore,
          blunderMove: m.san,
          bestMove: m.bestMoveSan,
          evalDelta: m.evalCp,
          moveNumber: m.moveNumber,
          playerColor: m.color,
        });
      }
    }
  }

  // Worst blunders first
  return puzzles.sort((a, b) => b.evalDelta - a.evalDelta);
}
