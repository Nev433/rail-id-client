import { RailIdHttpClient } from './client';
import type { RailIdEntity, RailIdRelationship, SyncOptions, SyncResult } from './models';

function normaliseIdentifiers(
  entity: Record<string, unknown>,
  contexts?: string[],
): Record<string, string> {
  const identifiers: Record<string, string> = {};
  const rawIds = (
    Array.isArray(entity['_ids'])
      ? entity['_ids']
      : Array.isArray(entity['identifiers'])
        ? entity['identifiers']
        : []
  ) as Record<string, unknown>[];

  for (const i of rawIds) {
    const type = (i['t'] ?? i['type']) as string | undefined;
    const value = (i['v'] ?? i['value']) as string | undefined;
    const ctx = (i['ctx'] ?? i['context']) as string | undefined;
    if (type && value && !identifiers[type]) {
      if (!ctx || !contexts?.length || contexts.includes(ctx)) {
        identifiers[type] = value;
      }
    }
  }
  return identifiers;
}

/**
 * Hard upper bound on pages fetched in a single sync. Belt-and-braces
 * defence against a misbehaving server (e.g. one that returns the same
 * page repeatedly, or never reports `total`). Each page is bounded by
 * `pageSize`, so the absolute maximum is `MAX_SYNC_PAGES * pageSize`.
 */
const MAX_SYNC_PAGES = 1000;

export async function syncEntities(
  client: RailIdHttpClient,
  options: SyncOptions = {},
): Promise<RailIdEntity[]> {
  const { types, contexts, since, pageSize = 500 } = options;
  const all: Record<string, unknown>[] = [];
  let skip = 0;
  let pages = 0;

  while (true) {
    if (pages++ >= MAX_SYNC_PAGES) {
      throw new Error(
        `syncEntities aborted after ${MAX_SYNC_PAGES} pages (collected ${all.length} entities) — server may not be reporting a finite total or may be returning duplicate pages`,
      );
    }
    const { items, total } = await client.fetchEntityPage({
      limit: pageSize,
      skip,
      status: 'active',
      contexts,
      since,
    });
    all.push(...items);

    // Stop conditions, in order:
    //   1. server returned nothing — definitely done (catches the case
    //      where total is Infinity and the server returns an empty page
    //      to signal end-of-stream)
    //   2. server returned fewer items than requested — last page reached
    //   3. we've collected at least `total` rows — reached the count the
    //      server told us about
    if (items.length === 0) break;
    if (items.length < pageSize) break;
    if (Number.isFinite(total) && all.length >= total) break;

    skip += pageSize;
  }

  const filtered = types?.length
    ? all.filter(e => types.includes(e['type'] as string))
    : all;

  return filtered.map(e => ({
    ...(e as Record<string, unknown>),
    opaqueId: e['opaqueId'] as string,
    type: e['type'] as string,
    _ids: (Array.isArray(e['_ids']) ? e['_ids'] : []) as RailIdEntity['_ids'],
    identifiers: normaliseIdentifiers(e, contexts),
    _parentId: (e['_parentId'] ?? e['parentId'] ?? null) as string | null,
    _parentName: (e['_parentName'] ?? e['parentName'] ?? null) as string | null,
  } as RailIdEntity));
}

export async function syncRelationships(
  client: RailIdHttpClient,
  ids: string[],
): Promise<RailIdRelationship[]> {
  if (!ids.length) return [];
  const batchResult = await client.batchRelationships(ids);
  return client.normaliseRelationships(batchResult);
}

export async function fullSync(
  client: RailIdHttpClient,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const entities = await syncEntities(client, options);
  const ids = entities.map(e => e.opaqueId).filter(Boolean);
  const relationships = await syncRelationships(client, ids);
  return { entities, relationships, syncedAt: new Date().toISOString() };
}
