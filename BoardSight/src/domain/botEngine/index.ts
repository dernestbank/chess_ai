import { Chess } from 'chess.js';

export type BotDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface BotConfig {
  difficulty: BotDifficulty;
  /** How long to "think" in ms before returning. Purely cosmetic for the stub. */
  thinkTimeMs?: number;
}

const DEFAULT_THINK_TIME: Record<BotDifficulty, number> = {
  beginner: 500,
  intermediate: 1500,
  advanced: 3000,
};

/**
 * Bot Engine wrapper.
 *
 * Current implementation: stub using random legal move selection.
 * TODO: Replace with Stockfish WASM for real engine strength.
 *       - beginner: depth 1
 *       - intermediate: depth 8
 *       - advanced: depth 18
 */
export class BotEngine {
  private config: BotConfig;
  private destroyed = false;

  constructor(config: BotConfig) {
    this.config = config;
  }

  /**
   * Returns a move in "from+to" format (e.g. "e2e4") or null if game is over.
   * Simulates think time via a setTimeout.
   */
  async getBestMove(fen: string): Promise<string | null> {
    if (this.destroyed) { return null; }

    const chess = new Chess(fen);
    if (chess.isGameOver()) { return null; }

    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) { return null; }

    const thinkMs = this.config.thinkTimeMs ?? DEFAULT_THINK_TIME[this.config.difficulty];

    await new Promise<void>(resolve => setTimeout(resolve, thinkMs));

    if (this.destroyed) { return null; }

    // Stub selection strategy
    let chosen: (typeof moves)[0] | undefined;
    switch (this.config.difficulty) {
      case 'beginner':
        // Pure random
        chosen = moves[Math.floor(Math.random() * moves.length)];
        break;
      case 'intermediate': {
        // Prefer captures over quiet moves
        const captures = moves.filter(m => m.captured);
        chosen = captures.length > 0
          ? captures[Math.floor(Math.random() * captures.length)]
          : moves[Math.floor(Math.random() * moves.length)];
        break;
      }
      case 'advanced': {
        // Pick best of 5 random — still random but slightly biased
        const candidates = Array.from({ length: Math.min(5, moves.length) }, () =>
          moves[Math.floor(Math.random() * moves.length)],
        );
        const withCapture = candidates.find(m => m?.captured);
        chosen = withCapture ?? candidates[0];
        break;
      }
    }

    if (!chosen) { return null; }
    return chosen.from + chosen.to + (chosen.promotion ?? '');
  }

  destroy(): void {
    this.destroyed = true;
  }
}
