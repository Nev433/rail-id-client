import type { RailIdRelationship } from './models';

export interface RailIdClientConfig {
  baseUrl: string;
  apiKey?: string;
  /** Per-attempt timeout in ms. Default: 30 000. */
  timeout?: number;
  /**
   * Number of HTTP attempts per request before giving up.
   * Default: 3. Use 1 to disable retries.
   */
  maxAttempts?: number;
  /**
   * Base delay in ms for the exponential-backoff schedule between
   * retries. Default: 500. Attempts wait `backoffBaseMs * 2^n` (with a
   * small jitter) before retrying.
   */
  backoffBaseMs?: number;
}

interface RawRelationship {
  rt: string;
  tid: string;
  tOpaqueId?: string;
  tn?: string | null;
  tt?: string | null;
  ts?: string | null;
  isOutgoing: boolean;
  vf?: string | null;
  vt?: string | null;
}

export type BatchRelationshipsResult = Record<string, RawRelationship[]>;

/**
 * Thrown when an HTTP attempt fails. Wraps the upstream status and
 * a short message so callers can `instanceof` check vs a generic Error.
 */
export class RailIdHttpError extends Error {
  readonly status: number;
  readonly attempts: number;
  constructor(message: string, status: number, attempts: number) {
    super(message);
    this.name = 'RailIdHttpError';
    this.status = status;
    this.attempts = attempts;
  }
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RailIdHttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;

  constructor(config: RailIdClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30_000;
    this.maxAttempts = Math.max(1, config.maxAttempts ?? 3);
    this.backoffBaseMs = Math.max(0, config.backoffBaseMs ?? 500);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['x-api-key'] = this.apiKey;
    return h;
  }

  /**
   * Send a generic GET-by-default request to a path under `baseUrl` and
   * decode the JSON body as `T`. Consumers reach for this when the
   * target endpoint isn't covered by one of the higher-level helpers
   * (`fetchEntityPage`, `batchRelationships`). Gets the same retry,
   * timeout and error-shape behaviour as the typed methods.
   *
   * @example
   *   const types = await client.request<RawType[]>('/types', undefined, 'types');
   *   const health = await client.request<{ status: string }>('/health');
   *
   * @param path  path relative to `baseUrl`, starting with `/`
   * @param init  optional fetch init (method, body, etc.) — headers are
   *              merged with the client's defaults; do not pass headers
   *              here unless you specifically need to override.
   * @param label short description for log/error messages (default: path)
   */
  async request<T>(path: string, init?: RequestInit, label?: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const tag = label ?? path;
    const res = await this.requestRaw(
      url,
      {
        method: init?.method ?? 'GET',
        ...init,
        headers: { ...this.headers(), ...(init?.headers ?? {}) },
      },
      tag,
    );
    const text = await res.text();
    if (!text) return [] as unknown as T;
    return JSON.parse(text) as T;
  }

  /**
   * Internal `fetch` wrapper that retries on transient failures
   * (network errors, AbortSignal timeouts, and HTTP 408/425/429/5xx).
   * 4xx responses are returned without retry — the caller's request
   * is the problem, retrying won't help.
   *
   * Backoff is exponential with light jitter:
   *   wait = backoffBaseMs * 2^(attempt-1) * (0.5 + Math.random())
   *
   * Throws `RailIdHttpError` on final failure, with the last upstream
   * status and the number of attempts made.
   */
  private async requestRaw(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<Response> {
    let lastStatus = 0;
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(this.timeout),
        });
        if (res.ok) return res;
        lastStatus = res.status;
        // Non-transient response: 4xx (other than 408/425/429) — don't retry.
        if (!TRANSIENT_STATUSES.has(res.status)) {
          throw new RailIdHttpError(
            `HTTP ${res.status} ${label}`,
            res.status,
            attempt,
          );
        }
        lastError = new RailIdHttpError(
          `HTTP ${res.status} ${label} (attempt ${attempt}/${this.maxAttempts})`,
          res.status,
          attempt,
        );
      } catch (err) {
        if (err instanceof RailIdHttpError && !TRANSIENT_STATUSES.has(err.status)) {
          throw err;
        }
        lastError = err;
        // Network errors and AbortSignal timeouts fall through to the retry path.
      }
      if (attempt < this.maxAttempts) {
        const base = this.backoffBaseMs * 2 ** (attempt - 1);
        const jittered = base * (0.5 + Math.random());
        await sleep(jittered);
      }
    }
    if (lastError instanceof RailIdHttpError) throw lastError;
    const message =
      lastError instanceof Error
        ? `network error ${label} after ${this.maxAttempts} attempts: ${lastError.message}`
        : `${label} failed after ${this.maxAttempts} attempts`;
    throw new RailIdHttpError(message, lastStatus || 0, this.maxAttempts);
  }

  async fetchEntityPage(params: {
    limit: number;
    skip: number;
    status?: string;
    contexts?: string[];
    since?: string;
  }): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const url = new URL(`${this.baseUrl}/entities`);
    url.searchParams.set('limit', String(params.limit));
    url.searchParams.set('skip', String(params.skip));
    if (params.status) url.searchParams.set('status', params.status);
    if (params.since) url.searchParams.set('since', params.since);
    if (params.contexts?.length) {
      for (const c of params.contexts) url.searchParams.append('context', c);
    }
    const res = await this.requestRaw(
      url.toString(),
      { headers: this.headers() },
      'fetching entities',
    );
    const data = (await res.json()) as Record<string, unknown>;
    const items = (
      Array.isArray(data)
        ? data
        : data['items'] || data['entities'] || data['data'] || []
    ) as Record<string, unknown>[];
    const total = (data['total'] ?? data['count'] ?? Infinity) as number;
    return { items, total };
  }

  async batchRelationships(ids: string[]): Promise<BatchRelationshipsResult> {
    if (!ids.length) return {};
    const res = await this.requestRaw(
      `${this.baseUrl}/entities/batch-relationships`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ ids }),
      },
      'fetching batch relationships',
    );
    return res.json() as Promise<BatchRelationshipsResult>;
  }

  normaliseRelationships(batchResult: BatchRelationshipsResult): RailIdRelationship[] {
    const seen = new Set<string>();
    const results: RailIdRelationship[] = [];
    for (const [entityId, rawRels] of Object.entries(batchResult)) {
      for (const r of rawRels) {
        const fromId = r.isOutgoing ? entityId : r.tid;
        const toId = r.isOutgoing ? r.tid : entityId;
        const key = `${fromId}|${r.rt}|${toId}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            fromId,
            toId,
            relType: r.rt,
            toName: r.tn ?? null,
            toType: r.tt ?? null,
            toSemanticId: r.ts ?? null,
          });
        }
      }
    }
    return results;
  }
}
