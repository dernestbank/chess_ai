/**
 * Unit tests for src/domain/commentator.ts
 */

import { getComment } from '../../src/domain/commentator';

// ── Mock settings ─────────────────────────────────────────────────────────────

const mockGetSettings = jest.fn();

jest.mock('../../src/domain/settings', () => ({
  getSettings: () => mockGetSettings(),
}));

// ── Mock fetch ────────────────────────────────────────────────────────────────

let mockFetch: jest.Mock;
beforeAll(() => {
  mockFetch = jest.fn();
  (globalThis as unknown as Record<string, unknown>).fetch = mockFetch;
});
afterAll(() => {
  // Restore
  (globalThis as unknown as Record<string, unknown>).fetch = undefined;
});
beforeEach(() => {
  mockFetch.mockReset();
  mockGetSettings.mockReset();
});

const SAMPLE_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

describe('getComment', () => {
  it('returns null when LLM explanations are disabled', async () => {
    mockGetSettings.mockResolvedValue({ enableLLMExplanations: false });
    const result = await getComment(SAMPLE_FEN, 'e4');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns a canned comment when LLM enabled but no URL configured', async () => {
    mockGetSettings.mockResolvedValue({
      enableLLMExplanations: true,
      cloudEndpointUrl: '',
      apiKey: '',
    });
    const result = await getComment(SAMPLE_FEN, 'e4');
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls the cloud endpoint when URL is configured', async () => {
    mockGetSettings.mockResolvedValue({
      enableLLMExplanations: true,
      cloudEndpointUrl: 'http://localhost:8000',
      apiKey: 'test-key',
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ comment: 'A sharp central move.' }),
    });
    const result = await getComment(SAMPLE_FEN, 'e4');
    expect(result).toBe('A sharp central move.');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/v1/commentary',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to canned comment when API returns non-ok', async () => {
    mockGetSettings.mockResolvedValue({
      enableLLMExplanations: true,
      cloudEndpointUrl: 'http://localhost:8000',
      apiKey: '',
    });
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const result = await getComment(SAMPLE_FEN, 'Nf3');
    expect(typeof result).toBe('string');
  });

  it('falls back to canned comment on network error', async () => {
    mockGetSettings.mockResolvedValue({
      enableLLMExplanations: true,
      cloudEndpointUrl: 'http://localhost:8000',
      apiKey: '',
    });
    mockFetch.mockRejectedValue(new Error('Network error'));
    const result = await getComment(SAMPLE_FEN, 'Nc3');
    expect(typeof result).toBe('string');
  });

  it('includes X-Api-Key header when apiKey is set', async () => {
    mockGetSettings.mockResolvedValue({
      enableLLMExplanations: true,
      cloudEndpointUrl: 'http://localhost:8000',
      apiKey: 'secret',
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ comment: 'Solid.' }),
    });
    await getComment(SAMPLE_FEN, 'Nf3');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['X-Api-Key']).toBe('secret');
  });

  it('does not include X-Api-Key when apiKey is empty', async () => {
    mockGetSettings.mockResolvedValue({
      enableLLMExplanations: true,
      cloudEndpointUrl: 'http://localhost:8000',
      apiKey: '',
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ comment: 'Solid.' }),
    });
    await getComment(SAMPLE_FEN, 'Nf3');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['X-Api-Key']).toBeUndefined();
  });
});
