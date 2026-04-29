/**
 * Unit tests for src/api/client.ts (ApiClient + singleton helpers).
 *
 * `fetch` is mocked via jest.fn() — no real network requests.
 */

import { ApiClient, ApiError } from '../../src/api/client';

// ---------------------------------------------------------------------------
// Minimal fetch mock helpers
// ---------------------------------------------------------------------------

function makeFetchResponse(body: unknown, status = 200, ok = true): Partial<Response> {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

beforeEach(() => {
  // Reset the module-level singleton before each test.
  jest.resetModules();
  // Provide a clean fetch mock
  (globalThis as unknown as Record<string, unknown>).fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// ApiClient.request — happy path
// ---------------------------------------------------------------------------

describe('ApiClient.request() — happy path', () => {
  it('makes a GET request to the correct URL', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(makeFetchResponse({ ok: true }));

    const client = new ApiClient('https://api.example.com');
    await client.request('/health');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = (fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/health');
  });

  it('strips trailing slash from baseUrl', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(makeFetchResponse({}));

    const client = new ApiClient('https://api.example.com/');
    await client.request('/v1/data');

    const [url] = (fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/data');
  });

  it('sends POST with JSON body', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(makeFetchResponse({ id: 'job-1' }));

    const client = new ApiClient('https://api.example.com');
    const result = await client.request<{ id: string }>('/jobs', {
      method: 'POST',
      body: { pgn: '1. e4', depth: 18 },
    });

    expect(result.id).toBe('job-1');
    const [, init] = (fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ pgn: '1. e4', depth: 18 });
  });

  it('includes Content-Type: application/json header', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(makeFetchResponse({}));

    const client = new ApiClient('https://api.example.com');
    await client.request('/ping');

    const [, init] = (fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('attaches X-API-Key header when apiKey is non-empty', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(makeFetchResponse({}));

    const client = new ApiClient('https://api.example.com', 'my-secret-key');
    await client.request('/secure');

    const [, init] = (fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('my-secret-key');
  });

  it('omits X-API-Key header when apiKey is empty', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(makeFetchResponse({}));

    const client = new ApiClient('https://api.example.com', '');
    await client.request('/open');

    const [, init] = (fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-API-Key']).toBeUndefined();
  });

  it('returns undefined for 204 No Content', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: jest.fn(),
    });

    const client = new ApiClient('https://api.example.com');
    const result = await client.request('/delete');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ApiClient.request — error handling
// ---------------------------------------------------------------------------

describe('ApiClient.request() — errors', () => {
  it('throws ApiError with the response status on non-2xx', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      makeFetchResponse({ detail: 'Not found' }, 404, false),
    );

    const client = new ApiClient('https://api.example.com');
    await expect(client.request('/missing')).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
  });

  it('throws ApiError with fallback message when error body has no detail/message', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(makeFetchResponse({}, 500, false));

    const client = new ApiClient('https://api.example.com');
    await expect(client.request('/error')).rejects.toMatchObject({
      status: 500,
      message: 'HTTP 500',
    });
  });

  it('ApiError has the correct .name property', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      makeFetchResponse({ detail: 'Unauthorized' }, 401, false),
    );

    const client = new ApiClient('https://api.example.com');
    try {
      await client.request('/auth');
    } catch (err) {
      expect((err as ApiError).name).toBe('ApiError');
    }
  });
});

// ---------------------------------------------------------------------------
// setApiKey
// ---------------------------------------------------------------------------

describe('ApiClient.setApiKey()', () => {
  it('updates the key used in subsequent requests', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce(makeFetchResponse({})) // first request
      .mockResolvedValueOnce(makeFetchResponse({})); // second request

    const client = new ApiClient('https://api.example.com', 'old-key');
    await client.request('/a');

    client.setApiKey('new-key');
    await client.request('/b');

    const firstHeaders = (fetch as jest.Mock).mock.calls[0]![1].headers as Record<string, string>;
    const secondHeaders = (fetch as jest.Mock).mock.calls[1]![1].headers as Record<string, string>;
    expect(firstHeaders['X-API-Key']).toBe('old-key');
    expect(secondHeaders['X-API-Key']).toBe('new-key');
  });
});

// ---------------------------------------------------------------------------
// Singleton helpers
// ---------------------------------------------------------------------------

describe('initApiClient / getApiClient', () => {
  it('getApiClient throws before initialization', () => {
    // Reset the singleton by re-importing with jest.isolateModules
    jest.isolateModules(() => {
      const { getApiClient: getC } =
        require('../../src/api/client') as typeof import('../../src/api/client');
      expect(() => getC()).toThrow('API client not initialized');
    });
  });

  it('getApiClient returns the client after initApiClient', () => {
    jest.isolateModules(() => {
      const { initApiClient: init, getApiClient: getC } =
        require('../../src/api/client') as typeof import('../../src/api/client');

      init('https://api.example.com', 'key-123');
      const client = getC();
      expect(client).toBeDefined();
    });
  });
});
