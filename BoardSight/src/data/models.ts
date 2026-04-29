export interface GameRow {
  id: string;
  mode: 'otb' | 'bot' | 'multiplayer';
  pgn: string;
  result: string; // '1-0' | '0-1' | '1/2-1/2' | '*'
  player_white: string | null;
  player_black: string | null;
  white_ms: number;
  black_ms: number;
  created_at: number; // unix ms
  updated_at: number;
}

export interface MoveRow {
  id: string;
  game_id: string;
  san: string;
  fen: string;
  from_sq: string;
  to_sq: string;
  promotion: string | null;
  move_number: number;
  white_ms_after: number;
  black_ms_after: number;
  created_at: number;
}

export interface AnalysisRow {
  id: string;
  game_id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  job_id: string | null;
  payload_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface SessionRow {
  id: string;
  game_id: string;
  transport: 'p2p' | 'cloud';
  peer_id: string | null;
  created_at: number;
}
