/**
 * Commentator service — generates a short natural-language comment after each move.
 *
 * When LLM explanations are enabled in settings and a cloud endpoint is configured,
 * it calls POST /v1/commentary with the current FEN + last move.
 * Otherwise it returns a canned comment, or null when the feature is disabled.
 */

import { getSettings } from './settings';

const CANNED: readonly string[] = [
  'A solid developing move.',
  'Interesting choice — creating tension in the centre.',
  'Activating the pieces.',
  'A natural recapture.',
  'Fighting for space.',
  'The position remains balanced.',
  'Keeping options open.',
  'Challenging the opponent\'s pawn structure.',
  'A key square is seized.',
  'Pressure builds in the centre.',
  'An important defensive resource.',
  'The initiative shifts.',
];

function pickCanned(): string {
  return CANNED[Math.floor(Math.random() * CANNED.length)] ?? 'A natural move.';
}

/**
 * Returns a comment string for the last move, or null if commentator is off.
 * @param fen  FEN *after* the move was played
 * @param move SAN notation of the move (e.g. "Nf3", "e4")
 */
export async function getComment(fen: string, move: string): Promise<string | null> {
  const settings = await getSettings();
  if (!settings.enableLLMExplanations) {
    return null;
  }

  const url = settings.cloudEndpointUrl;
  if (!url) {
    return pickCanned();
  }

  try {
    const res = await fetch(`${url}/v1/commentary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { 'X-Api-Key': settings.apiKey } : {}),
      },
      body: JSON.stringify({ fen, move }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signal: (AbortSignal as any).timeout?.(5000),
    });
    if (!res.ok) { return pickCanned(); }
    const data = (await res.json()) as { comment?: string };
    return data.comment ?? pickCanned();
  } catch {
    return pickCanned();
  }
}
