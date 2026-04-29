/**
 * Unit tests for src/api/analysis.ts
 *
 * Isolation strategy
 * ------------------
 * • `src/api/client` is module-mocked so `getApiClient()` returns a
 *   controlled `mockClient` whose `.request` method is a `jest.fn()`.
 * • Polling tests use `jest.useFakeTimers()` to advance `setTimeout`
 *   without waiting for real wall-clock time.
 */

// ── Module mock — must appear before any imports ──────────────────────────────
const mockRequest = jest.fn();

jest.mock('../../src/api/client', () => ({
  getApiClient: () => ({ request: mockRequest }),
  // Re-export ApiError so imports from the real module still work in tests.
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import {
  submitAnalysisJob,
  getJobResult,
  pollJobStatus,
  pollAnalysis,
  analyseGame,
  type AnalysisResult,
  type JobStatus,
} from '../../src/api/analysis';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const SAMPLE_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 *';
const JOB_ID = 'job-abc-123';

const SAMPLE_RESULT: AnalysisResult = {
  jobId: JOB_ID,
  moves: [
    {
      moveNumber: 1,
      san: 'e4',
      evalCp: 20,
      classification: 'good',
      bestLine: ['e4', 'e5'],
    },
  ],
  accuracy: { white: 92, black: 88 },
  takeaways: ['Strong opening play.'],
};

// ── Setup / teardown ──────────────────────────────────────────────────────────
beforeEach(() => {
  mockRequest.mockReset();
});

// ── submitAnalysisJob ─────────────────────────────────────────────────────────

describe('submitAnalysisJob', () => {
  it('returns the job_id from a successful response', async () => {
    mockRequest.mockResolvedValueOnce({ job_id: 'j1' });

    const jobId = await submitAnalysisJob(SAMPLE_PGN);

    expect(jobId).toBe('j1');
  });

  it('POSTs to /v1/analysis/jobs', async () => {
    mockRequest.mockResolvedValueOnce({ job_id: 'j1' });

    await submitAnalysisJob(SAMPLE_PGN);

    expect(mockRequest).toHaveBeenCalledWith(
      '/v1/analysis/jobs',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('includes pgn in the request body', async () => {
    mockRequest.mockResolvedValueOnce({ job_id: 'j1' });

    await submitAnalysisJob(SAMPLE_PGN);

    const [, opts] = mockRequest.mock.calls[0]! as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(opts.body.pgn).toBe(SAMPLE_PGN);
  });

  it('sends depth when provided in options', async () => {
    mockRequest.mockResolvedValueOnce({ job_id: 'j2' });

    await submitAnalysisJob(SAMPLE_PGN, { depth: 20 });

    const [, opts] = mockRequest.mock.calls[0]! as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(opts.body.depth).toBe(20);
  });

  it('sends include_llm_takeaways as true when includeLlmTakeaways is set', async () => {
    mockRequest.mockResolvedValueOnce({ job_id: 'j3' });

    await submitAnalysisJob(SAMPLE_PGN, { includeLlmTakeaways: true });

    const [, opts] = mockRequest.mock.calls[0]! as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(opts.body.include_llm_takeaways).toBe(true);
  });

  it('defaults include_llm_takeaways to false when not specified', async () => {
    mockRequest.mockResolvedValueOnce({ job_id: 'j4' });

    await submitAnalysisJob(SAMPLE_PGN);

    const [, opts] = mockRequest.mock.calls[0]! as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(opts.body.include_llm_takeaways).toBe(false);
  });

  it('forwards apiKey as api_key in the body', async () => {
    mockRequest.mockResolvedValueOnce({ job_id: 'j5' });

    await submitAnalysisJob(SAMPLE_PGN, { apiKey: 'sk-test' });

    const [, opts] = mockRequest.mock.calls[0]! as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(opts.body.api_key).toBe('sk-test');
  });

  it('sends api_key as null when apiKey is not provided', async () => {
    mockRequest.mockResolvedValueOnce({ job_id: 'j6' });

    await submitAnalysisJob(SAMPLE_PGN);

    const [, opts] = mockRequest.mock.calls[0]! as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(opts.body.api_key).toBeNull();
  });

  it('rejects when request throws', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Network error'));

    await expect(submitAnalysisJob(SAMPLE_PGN)).rejects.toThrow('Network error');
  });
});

// ── getJobResult ──────────────────────────────────────────────────────────────

describe('getJobResult', () => {
  it('returns the result from a successful response', async () => {
    mockRequest.mockResolvedValueOnce({ result: SAMPLE_RESULT });

    const result = await getJobResult(JOB_ID);

    expect(result).toEqual(SAMPLE_RESULT);
  });

  it('GETs from /v1/analysis/jobs/{jobId}/result', async () => {
    mockRequest.mockResolvedValueOnce({ result: SAMPLE_RESULT });

    await getJobResult(JOB_ID);

    expect(mockRequest).toHaveBeenCalledWith(
      `/v1/analysis/jobs/${JOB_ID}/result`,
    );
  });

  it('rejects when request throws (e.g. 202 still processing)', async () => {
    const pendingError = new Error('HTTP 202');
    mockRequest.mockRejectedValueOnce(pendingError);

    await expect(getJobResult(JOB_ID)).rejects.toThrow('HTTP 202');
  });

  it('preserves moves and accuracy from the payload', async () => {
    mockRequest.mockResolvedValueOnce({ result: SAMPLE_RESULT });

    const result = await getJobResult(JOB_ID);

    expect(result.moves).toHaveLength(1);
    expect(result.accuracy.white).toBe(92);
    expect(result.accuracy.black).toBe(88);
  });
});

// ── pollJobStatus ─────────────────────────────────────────────────────────────

describe('pollJobStatus', () => {
  it('returns the status string from the response', async () => {
    mockRequest.mockResolvedValueOnce({ status: 'running' });

    const status = await pollJobStatus(JOB_ID);

    expect(status).toBe('running');
  });

  it('maps backend "error" to "failed"', async () => {
    mockRequest.mockResolvedValueOnce({ status: 'error' });

    const status = await pollJobStatus(JOB_ID);

    expect(status).toBe('failed');
  });

  it('GETs from /v1/analysis/jobs/{jobId}', async () => {
    mockRequest.mockResolvedValueOnce({ status: 'queued' });

    await pollJobStatus(JOB_ID);

    expect(mockRequest).toHaveBeenCalledWith(`/v1/analysis/jobs/${JOB_ID}`);
  });

  it('passes through "done" status unchanged', async () => {
    mockRequest.mockResolvedValueOnce({ status: 'done' });

    const status = await pollJobStatus(JOB_ID);

    expect(status).toBe('done');
  });
});

// ── pollAnalysis ──────────────────────────────────────────────────────────────

describe('pollAnalysis', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves immediately when the first poll returns "done"', async () => {
    // First call: pollJobStatus → done
    mockRequest
      .mockResolvedValueOnce({ status: 'done' })
      // Second call: getJobResult
      .mockResolvedValueOnce({ result: SAMPLE_RESULT });

    const promise = pollAnalysis(JOB_ID);

    // No timer advancement needed — resolves synchronously after first poll.
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual(SAMPLE_RESULT);
    // pollJobStatus + getJobResult = exactly 2 request calls
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('resolves after one "running" cycle then "done"', async () => {
    mockRequest
      // Poll 1: running
      .mockResolvedValueOnce({ status: 'running' })
      // Poll 2: done
      .mockResolvedValueOnce({ status: 'done' })
      // getJobResult
      .mockResolvedValueOnce({ result: SAMPLE_RESULT });

    const promise = pollAnalysis(JOB_ID);

    // Drain the first poll + its 3 s sleep + second poll
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual(SAMPLE_RESULT);
    // 2 status polls + 1 result fetch
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it('calls onProgress with each status received', async () => {
    const onProgress = jest.fn<void, [JobStatus]>();

    mockRequest
      .mockResolvedValueOnce({ status: 'queued' })
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ status: 'done' })
      .mockResolvedValueOnce({ result: SAMPLE_RESULT });

    const promise = pollAnalysis(JOB_ID, onProgress);
    await jest.runAllTimersAsync();
    await promise;

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 'queued');
    expect(onProgress).toHaveBeenNthCalledWith(2, 'running');
    expect(onProgress).toHaveBeenNthCalledWith(3, 'done');
  });

  it('throws when job status is "failed"', async () => {
    // 'failed' is returned immediately — no timer is scheduled before the throw.
    mockRequest.mockResolvedValueOnce({ status: 'failed' });

    await expect(pollAnalysis(JOB_ID)).rejects.toThrow(
      `Analysis job ${JOB_ID} failed on the server.`,
    );
  });

  it('maps backend "error" to "failed" and throws', async () => {
    mockRequest.mockResolvedValueOnce({ status: 'error' });

    await expect(pollAnalysis(JOB_ID)).rejects.toThrow(
      `Analysis job ${JOB_ID} failed on the server.`,
    );
  });

  it('throws a timeout error after timeoutMs elapses without completion', async () => {
    // Always return "running" so it never finishes.
    mockRequest.mockResolvedValue({ status: 'running' });

    const TIMEOUT_MS = 6_000;
    // Catch upfront so no unhandled rejection races with advanceTimersByTimeAsync.
    const caught = pollAnalysis(JOB_ID, undefined, TIMEOUT_MS).catch((e: Error) => e);

    // Advance time past the deadline — POLL_INTERVAL is 3s so two full polls fit.
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS + 1_000);

    const err = await caught;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(`timed out after ${TIMEOUT_MS / 1_000}s`);
  });

  it('does not call getJobResult when status is never "done"', async () => {
    mockRequest.mockResolvedValue({ status: 'running' });

    // Catch upfront to avoid unhandled rejection.
    const caught = pollAnalysis(JOB_ID, undefined, 3_000).catch(() => undefined);

    // Advance time past the 3s timeout.
    await jest.advanceTimersByTimeAsync(4_000);
    await caught;

    const resultCalls = mockRequest.mock.calls.filter(([path]) =>
      (path as string).endsWith('/result'),
    );
    expect(resultCalls).toHaveLength(0);
  });

  it('respects a very short timeout (less than one poll interval)', async () => {
    // With a 100 ms timeout the deadline is passed after the first poll returns.
    mockRequest.mockResolvedValue({ status: 'running' });

    const caught = pollAnalysis(JOB_ID, undefined, 100).catch((e: Error) => e);

    // Advance time past the short timeout.
    await jest.advanceTimersByTimeAsync(500);

    const err = await caught;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('timed out');
  });
});

// ── analyseGame ───────────────────────────────────────────────────────────────

describe('analyseGame', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('submits a job and returns the analysis result', async () => {
    mockRequest
      // submitAnalysisJob
      .mockResolvedValueOnce({ job_id: JOB_ID })
      // pollJobStatus → done
      .mockResolvedValueOnce({ status: 'done' })
      // getJobResult
      .mockResolvedValueOnce({ result: SAMPLE_RESULT });

    const promise = analyseGame(SAMPLE_PGN);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual(SAMPLE_RESULT);
  });

  it('passes depth option through to submitAnalysisJob', async () => {
    mockRequest
      .mockResolvedValueOnce({ job_id: JOB_ID })
      .mockResolvedValueOnce({ status: 'done' })
      .mockResolvedValueOnce({ result: SAMPLE_RESULT });

    const promise = analyseGame(SAMPLE_PGN, { depth: 22 });
    await jest.runAllTimersAsync();
    await promise;

    const [, submitOpts] = mockRequest.mock.calls[0]! as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(submitOpts.body.depth).toBe(22);
  });

  it('invokes onProgress callback during polling', async () => {
    const onProgress = jest.fn<void, [JobStatus]>();

    mockRequest
      .mockResolvedValueOnce({ job_id: JOB_ID })
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ status: 'done' })
      .mockResolvedValueOnce({ result: SAMPLE_RESULT });

    const promise = analyseGame(SAMPLE_PGN, { onProgress });
    await jest.runAllTimersAsync();
    await promise;

    expect(onProgress).toHaveBeenCalledWith('running');
    expect(onProgress).toHaveBeenCalledWith('done');
  });

  it('rejects when the polling job fails on the server', async () => {
    mockRequest
      .mockResolvedValueOnce({ job_id: JOB_ID })
      .mockResolvedValueOnce({ status: 'failed' });

    // 'failed' is returned on first poll — no timer wait needed.
    await expect(analyseGame(SAMPLE_PGN)).rejects.toThrow(
      `Analysis job ${JOB_ID} failed on the server.`,
    );
  });

  it('rejects with a timeout error when analysis never finishes', async () => {
    mockRequest
      .mockResolvedValueOnce({ job_id: JOB_ID })
      .mockResolvedValue({ status: 'running' });

    const caught = analyseGame(SAMPLE_PGN, { timeoutMs: 6_000 }).catch((e: Error) => e);

    // Advance time past the 6s timeout.
    await jest.advanceTimersByTimeAsync(7_000);

    const err = await caught;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('timed out after 6s');
  });

  it('passes includeLlmTakeaways and apiKey to the submit call', async () => {
    mockRequest
      .mockResolvedValueOnce({ job_id: JOB_ID })
      .mockResolvedValueOnce({ status: 'done' })
      .mockResolvedValueOnce({ result: SAMPLE_RESULT });

    const promise = analyseGame(SAMPLE_PGN, {
      includeLlmTakeaways: true,
      apiKey: 'bearer-xyz',
    });
    await jest.runAllTimersAsync();
    await promise;

    const [, submitOpts] = mockRequest.mock.calls[0]! as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(submitOpts.body.include_llm_takeaways).toBe(true);
    expect(submitOpts.body.api_key).toBe('bearer-xyz');
  });
});
