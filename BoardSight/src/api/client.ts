export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export class ApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /** Update the API key at runtime (e.g. after the user saves settings). */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {}, timeoutMs = 30_000 } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Only attach X-API-Key when a non-empty key is configured.
    const authHeader: Record<string, string> =
      this.apiKey ? { 'X-API-Key': this.apiKey } : {};

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          message = err.detail ?? err.message ?? message;
        } catch { /* ignore parse error */ }
        throw new ApiError(res.status, message);
      }

      if (res.status === 204) {
        return undefined as unknown as T;
      }
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------
let _client: ApiClient | null = null;

export function initApiClient(baseUrl: string, apiKey: string): void {
  _client = new ApiClient(baseUrl, apiKey);
}

export function getApiClient(): ApiClient {
  if (!_client) {
    throw new Error('API client not initialized. Call initApiClient() first.');
  }
  return _client;
}
