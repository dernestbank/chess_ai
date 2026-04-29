/**
 * Preset positions for Opening and Endgame drill modes.
 * Each drill starts BotGame at a specific FEN so players can practise
 * a particular theme rather than always starting from the initial position.
 */

export interface Drill {
  id: string;
  name: string;
  category: 'opening' | 'endgame';
  description: string;
  /** FEN to start the game from. */
  startFen: string;
  /** Which colour the player controls in this drill. */
  targetColor: 'w' | 'b';
}

export const DRILLS: readonly Drill[] = [
  // ── Openings ────────────────────────────────────────────────────────────────
  {
    id: 'italian_game',
    name: 'Italian Game',
    category: 'opening',
    description: 'After 1.e4 e5 2.Nf3 Nc6 3.Bc4 — play as Black',
    startFen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    targetColor: 'b',
  },
  {
    id: 'sicilian_najdorf',
    name: 'Sicilian — Najdorf',
    category: 'opening',
    description: 'After 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 — play as Black',
    startFen: 'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq - 1 5',
    targetColor: 'b',
  },
  {
    id: 'french_advance',
    name: 'French — Advance',
    category: 'opening',
    description: 'After 1.e4 e6 2.d4 d5 3.e5 — play as Black',
    startFen: 'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
    targetColor: 'b',
  },
  {
    id: 'qga',
    name: "Queen's Gambit Accepted",
    category: 'opening',
    description: 'After 1.d4 d5 2.c4 dxc4 — play as White',
    startFen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
    targetColor: 'w',
  },
  {
    id: 'kings_indian',
    name: "King's Indian — Classical",
    category: 'opening',
    description: 'After 1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 — play as Black',
    startFen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP3PPP/R1BQKB1R b KQkq - 1 5',
    targetColor: 'b',
  },
  // ── Endgames ─────────────────────────────────────────────────────────────────
  {
    id: 'kg_vs_kp',
    name: 'King + Pawn vs King',
    category: 'endgame',
    description: 'Push the pawn to promotion using king opposition. White to move.',
    startFen: '8/8/8/4k3/4P3/4K3/8/8 w - - 0 1',
    targetColor: 'w',
  },
  {
    id: 'lucena',
    name: 'Lucena Position',
    category: 'endgame',
    description: 'Classic rook-and-pawn technique: build a bridge. White to win.',
    startFen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    targetColor: 'w',
  },
  {
    id: 'philidor',
    name: 'Philidor Defence (Rook)',
    category: 'endgame',
    description: 'Hold the draw from behind with the rook. Black to move.',
    startFen: '4k3/8/4K3/4P3/8/8/8/3r3R b - - 0 1',
    targetColor: 'b',
  },
  {
    id: 'queen_vs_pawn',
    name: 'Queen vs Advanced Pawn',
    category: 'endgame',
    description: 'Stop the pawn with your queen before it promotes. White to move.',
    startFen: '8/8/8/8/8/2Q5/1p6/1K1k4 w - - 0 1',
    targetColor: 'w',
  },
  {
    id: 'opposition',
    name: 'Opposition & Key Squares',
    category: 'endgame',
    description: 'Use king opposition to escort the pawn home. White to move.',
    startFen: '8/8/3k4/8/3K4/8/3P4/8 w - - 0 1',
    targetColor: 'w',
  },
];

export function getDrillsByCategory(category: 'opening' | 'endgame'): Drill[] {
  return DRILLS.filter(d => d.category === category);
}
