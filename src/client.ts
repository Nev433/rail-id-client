import type { RailIdRelationship } from './models';

export interface RailIdClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
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

export class RailIdHttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeout: number;

  constructor(config: RailIdClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['x-api-key'] = this.apiKey;
    return h;
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
    const res = await fetch(url.toString(), {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching entities`);
    const data = await res.json() as Record<string, unknown>;
    const items = (Array.isArray(data) ? data : (data['items'] || data['entities'] || data['data'] || [])) as Record<string, unknown>[];
    const total = (data['total'] ?? data['count'] ?? Infinity) as number;
    return { items, total };
  }

  async batchRelationships(ids: string[]): Promise<BatchRelationshipsResult> {
    if (!ids.length) return {};
    const res = await fetch(`${this.baseUrl}/entities/batch-relationships`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching batch relationships`);
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
