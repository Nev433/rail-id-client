# rail-id-client — Claude Code guide

A small TypeScript library that wraps the [Rail-ID-Service](https://github.com/Nev433/Rail-ID-Service)
HTTP API and exposes typed models other workspace projects can consume.

The workspace convention is for any project that touches Rail-ID-Service data
to depend on this package rather than redefining `RailIdEntity` /
`RailIdRelationship` shapes locally. See the workspace
[CLAUDE.md](https://github.com/Nev433/rail-projects/blob/main/CLAUDE.md) "Shared types" and "Cross-service integration"
sections for the bigger picture.

## What this is

A pure-TypeScript package (no framework deps) with three concerns:

- **Models** — typed shapes for Rail-ID entities, identifiers, relationships,
  and sync payloads ([`src/models.ts`](src/models.ts)).
- **HTTP client** — `RailIdHttpClient`, a thin `fetch`-based client with API
  key support and abort-timeout handling ([`src/client.ts`](src/client.ts)).
- **Sync helpers** — `syncEntities`, `syncRelationships`, `fullSync` that
  paginate, filter, and normalise Rail-ID-Service responses
  ([`src/sync.ts`](src/sync.ts)).

Everything is re-exported from [`src/index.ts`](src/index.ts).

## Repo layout

```
rail-id-client/
├── package.json         # name: "rail-id-client", version: 0.1.0
├── tsconfig.json
├── src/
│   ├── index.ts         # barrel — re-exports models, client, sync
│   ├── models.ts        # RailIdEntity, RailIdIdentifier, RailIdRelationship,
│   │                    #   SyncResult, SyncOptions
│   ├── client.ts        # RailIdHttpClient + RailIdClientConfig +
│   │                    #   BatchRelationshipsResult
│   └── sync.ts          # syncEntities(), syncRelationships(), fullSync()
└── dist/                # tsc output — gitignored, regenerated on build
```

## Build

```bash
npm install
npm run build           # tsc → dist/
```

No tests today (see "Known gaps" below).

## Public API surface

| Export | Source | Purpose |
|---|---|---|
| `RailIdEntity` | `models.ts` | Canonical entity shape: `opaqueId`, `type`, `name`, identifiers, optional parent context, dynamic props via index signature |
| `RailIdIdentifier` | `models.ts` | `{ t, v, ctx?, pref? }` shorthand used in entity `_ids` arrays |
| `RailIdRelationship` | `models.ts` | `{ fromId, toId, relType, toName?, toType?, toSemanticId?, validFrom?, validTo? }` |
| `SyncResult` / `SyncOptions` | `models.ts` | Inputs and outputs for `fullSync` |
| `RailIdHttpClient` | `client.ts` | Class wrapping `fetch` against the Rail-ID-Service API |
| `RailIdClientConfig` | `client.ts` | `{ baseUrl, apiKey?, timeout? }` |
| `BatchRelationshipsResult` | `client.ts` | Raw shape returned by `/entities/batch-relationships` |
| `syncEntities(client, options)` | `sync.ts` | Paginated entity fetch with status/contexts/since filters, identifier normalisation |
| `syncRelationships(client, ids)` | `sync.ts` | Batched relationship fetch + deduplication |
| `fullSync(client, options)` | `sync.ts` | `syncEntities` + `syncRelationships` in one call, returning a `SyncResult` |

## How consumers should depend on it

Today this isn't published to npm. Consumers reference it via a `file:` path
in their own `package.json`:

```jsonc
// in <consumer>/api/package.json
"dependencies": {
  "rail-id-client": "file:../../rail-id-client"
}
```

This works when both repos are checked out as siblings under the same parent
folder (the standard `~/Developer/` layout). It does **not** work for clones
that don't have the sibling — a real follow-up.

Current consumers:
- [railML-Infrastructure](https://github.com/Nev433/railML-Infrastructure) — uses it in `RailIdController`.

The workspace audit recommends adopting it across **railML-Crew**,
**railML-Timetable**, **railML-RollingStock**, and **railML-StockCrewPlan**,
which currently redefine the same `RailIdEntity` shape locally.

## Conventions

- **Pure TypeScript, no framework deps.** Don't add NestJS, Angular, Express,
  or anything else. This package must remain usable from both Nest backends
  and Angular frontends.
- **Use `fetch` + `AbortSignal.timeout`.** No `axios`, no `node-fetch` — keep
  the dependency footprint at zero.
- **Models are interfaces, never classes.** No runtime cost.
- **Sync helpers do client-side filtering by `type` and `context`.** The
  Rail-ID-Service `type=` query param is not reliable — pull active entities
  in pages, then filter. See [`src/sync.ts`](src/sync.ts).

## Known gaps

- **No tests.** Pick Vitest (matches the workspace frontend convention) and
  cover at least `syncEntities` paging and `normaliseRelationships` dedup.
- **No npm publish flow.** Either publish to GitHub Packages under `@nev433/`
  or commit to the `file:` ref pattern long-term.
- **No CHANGELOG / version bumping.** Manual edits to `package.json` only.
- **`version: 0.1.0`** has stayed put since project inception — not
  authoritative.

## Related

- [Rail-ID-Service](https://github.com/Nev433/Rail-ID-Service) — the API this
  client talks to.
- Workspace [CLAUDE.md](https://github.com/Nev433/rail-projects/blob/main/CLAUDE.md) — Shared types, Cross-service integration.
