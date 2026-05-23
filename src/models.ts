export interface RailIdIdentifier {
  t: string;
  v: string;
  ctx?: string;
  pref?: boolean | null;
}

export interface RailIdEntity {
  opaqueId: string;
  semanticId?: string | null;
  name?: string | null;
  brandName?: string | null;
  tradingName?: string | null;
  type: string;
  status?: string;
  country?: string;
  lat?: number | null;
  lon?: number | null;
  notes?: string | null;
  updatedAt?: string;
  version?: number;
  _displayName?: string | null;
  _isInherited?: boolean;
  _parentId?: string | null;
  _parentName?: string | null;
  _isSubLoc?: boolean;
  _ids: RailIdIdentifier[];
  identifiers: Record<string, string>;
  [key: string]: unknown;
}

export interface RailIdRelationship {
  fromId: string;
  toId: string;
  relType: string;
  toName?: string | null;
  toType?: string | null;
  toSemanticId?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface SyncResult {
  entities: RailIdEntity[];
  relationships: RailIdRelationship[];
  syncedAt: string;
}

export interface SyncOptions {
  types?: string[];
  contexts?: string[];
  since?: string;
  pageSize?: number;
  timeout?: number;
}
