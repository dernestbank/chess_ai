/**
 * Unit tests for src/domain/analysisRouter/index.ts
 *
 * Isolation strategy
 * ------------------
 * • global.fetch is replaced with a jest.fn() so isNetworkAvailable() can be
 *   driven to return true (status 204) or false (thrown error) per test.
 * • The entire src/api/analysis module is module-mocked so the dynamic
 *   import('../../api/analysis') inside routeAnalysis() resolves to our
 *   mock — Jest intercepts dynamic imports that target a path already in
 *   the module registry.
 * • AbortSignal.timeout is stubbed because older Node versions used in the
 *   React-Native Jest preset may not expose it.
 */

// ── Module mock — must be at the top level before any imports ────────────────
jest.mock('../../src/api/analysis', () => ({
  submitAnalysisJob: jest.fn().mockResolvedValue('cloud_job_123'),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import { routeAnalysis, AnalysisConfig } from '../../src/domain/analysisRouter';
import { submitAnalysisJob } from '../../src/api/analysis';

// ── Typed mock helpers ────────────────────────────────────────────────────────
const mockFetch = jest.fn();
const mockSubmitAnalysisJob = submitAnalysisJob as jest.MockedFunction<typeof submitAnalysisJob>;

// ── Test fixtures ─────────────────────────────────────────────────────────────
const SAMPLE_PGN = '1. e4 e5 2. Nf3 Nc6 *';

const baseConfig: AnalysisConfig = {
  enableLLM: false,
  mode: 'device',
};

// ── Environment setup ─────────────────────────────────────────────────────────
beforeAll(() => {
  // Polyfill AbortSignal.timeout for Node environments that lack it
  if (typeof (AbortSignal as unknown as Record<string, unknown>).timeout !== 'function') {
    (AbortSignal as unknown as Record<string, unknown>).timeout = (_ms: number) =>
      new AbortController().signal;
  }
});

beforeEach(() => {
  // Install the fetch mock globally before every test
  (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;
  mockFetch.mockReset();
  mockSubmitAnalysisJob.mockClear();
});

afterAll(() => {
  // Restore original fetch if it existed (it typically doesn't in RN Jest)
  delete (globalThis as unknown as Record<string, unknown>).fetch;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simulates an online environment — generates_204 returns 204. */
function mockNetworkOnline(): void {
  mockFetch.mockResolvedValue({ status: 204 });
}

/** Simulates an offline environment — fetch throws a network error. */
function mockNetworkOffline(): void {
  mockFetch.mockRejectedValue(new TypeError('Network request failed'));
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('routeAnalysis', () => {
  // ── 1. device mode ──────────────────────────────────────────────────────────
  describe('mode: device', () => {
    it('returns a local_ prefixed job ID without calling fetch', async () => {
      const config: AnalysisConfig = { ...baseConfig, mode: 'device' };

      const jobId = await routeAnalysis(SAMPLE_PGN, config);

      expect(jobId).toMatch(/^local_/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not call submitAnalysisJob regardless of cloudEndpointUrl', async () => {
      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'device',
        cloudEndpointUrl: 'https://api.example.com',
        apiKey: 'secret',
      };

      await routeAnalysis(SAMPLE_PGN, config);

      expect(mockSubmitAnalysisJob).not.toHaveBeenCalled();
    });
  });

  // ── 2. cloud mode — missing cloudEndpointUrl ────────────────────────────────
  describe('mode: cloud — empty cloudEndpointUrl', () => {
    it('falls back to local stub when cloudEndpointUrl is absent', async () => {
      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'cloud',
        // cloudEndpointUrl intentionally omitted
        apiKey: 'secret',
      };

      const jobId = await routeAnalysis(SAMPLE_PGN, config);

      expect(jobId).toMatch(/^local_/);
      expect(mockSubmitAnalysisJob).not.toHaveBeenCalled();
    });

    it('falls back to local stub when cloudEndpointUrl is an empty string', async () => {
      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'cloud',
        cloudEndpointUrl: '',
        apiKey: 'secret',
      };

      const jobId = await routeAnalysis(SAMPLE_PGN, config);

      expect(jobId).toMatch(/^local_/);
      expect(mockSubmitAnalysisJob).not.toHaveBeenCalled();
    });

    it('falls back to local stub when apiKey is absent', async () => {
      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'cloud',
        cloudEndpointUrl: 'https://api.example.com',
        // apiKey intentionally omitted
      };

      const jobId = await routeAnalysis(SAMPLE_PGN, config);

      expect(jobId).toMatch(/^local_/);
      expect(mockSubmitAnalysisJob).not.toHaveBeenCalled();
    });
  });

  // ── 3. cloud mode — network unavailable ─────────────────────────────────────
  describe('mode: cloud — network unavailable', () => {
    it('falls back to local stub when fetch throws (no connectivity)', async () => {
      // cloud mode does NOT perform the network check itself; useCloud becomes
      // true unconditionally, but the guard `config.cloudEndpointUrl &&
      // config.apiKey` determines the final branch.  To test network-failure
      // fallback we set up a valid URL + key and make fetch throw so that
      // isNetworkAvailable (called only for 'auto') would return false.
      // For 'cloud' mode the guard passes, so we rely on submitAnalysisJob
      // being properly gated.  The more meaningful network-failure test is
      // under 'auto' mode below; here we verify the offline auto→local path.
      mockNetworkOffline();

      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'auto',
        cloudEndpointUrl: 'https://api.example.com',
        apiKey: 'secret',
      };

      const jobId = await routeAnalysis(SAMPLE_PGN, config);

      expect(jobId).toMatch(/^local_/);
      expect(mockSubmitAnalysisJob).not.toHaveBeenCalled();
      // isNetworkAvailable must have attempted the connectivity check
      expect(mockFetch).toHaveBeenCalledWith(
        'https://clients3.google.com/generate_204',
        expect.objectContaining({ method: 'HEAD' }),
      );
    });
  });

  // ── 4. auto mode — online, URL + apiKey present ─────────────────────────────
  describe('mode: auto — network available', () => {
    it('calls submitAnalysisJob and returns its result', async () => {
      mockNetworkOnline();

      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'auto',
        cloudEndpointUrl: 'https://api.example.com',
        apiKey: 'secret',
      };

      const jobId = await routeAnalysis(SAMPLE_PGN, config);

      expect(mockSubmitAnalysisJob).toHaveBeenCalledTimes(1);
      expect(mockSubmitAnalysisJob).toHaveBeenCalledWith(SAMPLE_PGN);
      expect(jobId).toBe('cloud_job_123');
    });

    it('performs the connectivity check against the Google 204 endpoint', async () => {
      mockNetworkOnline();

      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'auto',
        cloudEndpointUrl: 'https://api.example.com',
        apiKey: 'secret',
      };

      await routeAnalysis(SAMPLE_PGN, config);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://clients3.google.com/generate_204',
        expect.objectContaining({ method: 'HEAD' }),
      );
    });
  });

  // ── 5. auto mode — no cloudEndpointUrl ──────────────────────────────────────
  describe('mode: auto — no cloudEndpointUrl', () => {
    it('returns local stub without performing a network check', async () => {
      // Network should never be consulted when there is no URL to call
      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'auto',
        // cloudEndpointUrl intentionally omitted
        apiKey: 'secret',
      };

      const jobId = await routeAnalysis(SAMPLE_PGN, config);

      expect(jobId).toMatch(/^local_/);
      expect(mockSubmitAnalysisJob).not.toHaveBeenCalled();
      // isNetworkAvailable is gated behind !!config.cloudEndpointUrl in the
      // short-circuit evaluation, so fetch must not have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns a different local job ID on each invocation', async () => {
      const config: AnalysisConfig = { ...baseConfig, mode: 'auto' };

      const [id1, id2, id3] = await Promise.all([
        routeAnalysis(SAMPLE_PGN, config),
        routeAnalysis(SAMPLE_PGN, config),
        routeAnalysis(SAMPLE_PGN, config),
      ]);

      // IDs are based on Math.random() so collisions are astronomically unlikely
      const ids = new Set([id1, id2, id3]);
      expect(ids.size).toBe(3);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('local_ IDs contain only alphanumeric characters after the prefix', async () => {
      const config: AnalysisConfig = { ...baseConfig, mode: 'device' };

      const jobId = await routeAnalysis(SAMPLE_PGN, config);

      // Math.random().toString(36).slice(2) produces [a-z0-9]
      expect(jobId).toMatch(/^local_[a-z0-9]+$/);
    });

    it('passes the pgn argument verbatim to submitAnalysisJob', async () => {
      mockNetworkOnline();

      const unusualPgn = '[Event "Test"]\n[Site "?"]\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 *';

      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'auto',
        cloudEndpointUrl: 'https://api.example.com',
        apiKey: 'bearer-token',
      };

      await routeAnalysis(unusualPgn, config);

      expect(mockSubmitAnalysisJob).toHaveBeenCalledWith(unusualPgn);
    });

    it('returns the exact value resolved by submitAnalysisJob', async () => {
      mockNetworkOnline();
      mockSubmitAnalysisJob.mockResolvedValueOnce('special_job_abc');

      const config: AnalysisConfig = {
        ...baseConfig,
        mode: 'auto',
        cloudEndpointUrl: 'https://api.example.com',
        apiKey: 'secret',
      };

      const jobId = await routeAnalysis(SAMPLE_PGN, config);

      expect(jobId).toBe('special_job_abc');
    });
  });
});
