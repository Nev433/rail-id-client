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

export async function syncEntities(
  client: RailIdHttpClient,
  options: SyncOptions = {},
): Promise<RailIdEntity[]> {
  const { types, contexts, since, pageSize = 500 } = options;
  const all: Record<string, unknown>[] = [];
  let skip = 0;

  while (true) {
    const { items, total } = await client.fetchEntityPage({
      limit: pageSize,
      skip,
      status: 'active',
      contexts,
      since,
    });
    all.push(...items);
    if (items.length < pageSize || all.length >= total) break;
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
