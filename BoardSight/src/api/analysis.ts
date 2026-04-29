import { getApiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status values returned by the backend (backend uses "error"; we surface
 *  it as "failed" to keep the mobile naming convention consistent). */
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface SubmitOptions {
  depth?: number;
  includeLlmTakeaways?: boolean;
  /** Forwarded to the backend as `api_key` for LLM requests. */
  apiKey?: string;
}

export interface MoveAnnotation {
  moveNumber: number;
  san: string;
  evalCp: number;
  classification: 'brilliant' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | null;
  bestLine?: string[];
}

export interface AnalysisResult {
  jobId: string;
  moves: MoveAnnotation[];
  accuracy: { white: number; black: number };
  takeaways?: string[];
}

// ---------------------------------------------------------------------------
// Low-level helpers (one HTTP call each)
// ---------------------------------------------------------------------------

/**
 * POST /v1/analysis/jobs
 * Enqueues a game and returns the opaque job_id.
 */
export async function submitAnalysisJob(
  pgn: string,
  options: SubmitOptions = {},
): Promise<string> {
  const data = await getApiClient().request<{ job_id: string }>(
    '/v1/analysis/jobs',
    {
      method: 'POST',
      body: {
        pgn,
        depth: options.depth,
        include_llm_takeaways: options.includeLlmTakeaways ?? false,
        api_key: options.apiKey ?? null,
      },
    },
  );
  return data.job_id;
}

/**
 * GET /v1/analysis/jobs/{job_id}
 * Returns the current status (and result/error when finished).
 */
export async function pollJobStatus(jobId: string): Promise<JobStatus> {
  const data = await getApiClient().request<{ status: string }>(
    `/v1/analysis/jobs/${jobId}`,
  );
  // Map backend "error" → "failed" to match the mobile convention.
  const raw = data.status;
  return (raw === 'error' ? 'failed' : raw) as JobStatus;
}

/**
 * GET /v1/analysis/jobs/{job_id}/result
 * Fetches ONLY the full result payload.
 * Returns null with a 202 (still running) — callers should not call this
 * directly; use pollAnalysis() instead.
 */
export async function getJobResult(jobId: string): Promise<AnalysisResult> {
  const data = await getApiClient().request<{ result: AnalysisResult }>(
    `/v1/analysis/jobs/${jobId}/result`,
  );
  return data.result;
}

// ---------------------------------------------------------------------------
// High-level public API
// ---------------------------------------------------------------------------

/**
 * Submit a PGN for analysis.
 *
 * @returns The opaque `jobId` to pass to `pollAnalysis()`.
 */
export async function submitAnalysis(
  pgn: string,
  options: SubmitOptions = {},
): Promise<string> {
  return submitAnalysisJob(pgn, options);
}

/**
 * Poll the backend every 3 seconds until the job finishes (or times out),
 * then fetch and return the full analysis result.
 *
 * @param jobId     - Returned by `submitAnalysis()`.
 * @param onProgress - Optional callback invoked on each poll cycle.
 * @param timeoutMs  - Maximum wait time (default 60 s).
 */
export async function pollAnalysis(
  jobId: string,
  onProgress?: (status: JobStatus) => void,
  timeoutMs = 60_000,
): Promise<AnalysisResult> {
  const deadline = Date.now() + timeoutMs;
  const POLL_INTERVAL_MS = 3_000;

  while (Date.now() < deadline) {
    const status = await pollJobStatus(jobId);
    onProgress?.(status);

    if (status === 'done') {
      return getJobResult(jobId);
    }
    if (status === 'failed') {
      throw new Error(`Analysis job ${jobId} failed on the server.`);
    }

    // Wait before next poll — but bail early if we would exceed the deadline.
    const remaining = deadline - Date.now();
    await new Promise<void>(resolve =>
      setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remaining)),
    );
  }

  throw new Error(
    `Analysis job ${jobId} timed out after ${timeoutMs / 1_000}s.`,
  );
}

// ---------------------------------------------------------------------------
// Convenience: submit + wait in one call
// ---------------------------------------------------------------------------

/**
 * Submit a PGN and wait for the full analysis result in one step.
 *
 * Equivalent to `submitAnalysis` → `pollAnalysis`.
 */
export async function analyseGame(
  pgn: string,
  options: SubmitOptions & {
    onProgress?: (status: JobStatus) => void;
    timeoutMs?: number;
  } = {},
): Promise<AnalysisResult> {
  const { onProgress, timeoutMs = 60_000, ...submitOpts } = options;
  const jobId = await submitAnalysis(pgn, submitOpts);
  return pollAnalysis(jobId, onProgress, timeoutMs);
}
