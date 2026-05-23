# rail-id-client

Shared TypeScript client for the [Rail-ID-Service](https://github.com/Nev433/Rail-ID-Service) HTTP API.

Exports typed models (`RailIdEntity`, `RailIdRelationship`, etc.), an `RailIdHttpClient` class wrapping `fetch` with API-key and timeout support, and sync helpers (`syncEntities`, `syncRelationships`, `fullSync`) that paginate and normalise responses from Rail-ID-Service.

## Install

```bash
npm install
npm run build         # tsc → dist/
```

## Use from another workspace project

```jsonc
// in <consumer>/api/package.json
"dependencies": {
  "rail-id-client": "file:../../rail-id-client"
}
```

Requires both repos to be checked out as siblings under the same parent folder.

## Docs

- [`CLAUDE.md`](./CLAUDE.md) — full developer guide, export surface, conventions.
- [Workspace conventions](https://github.com/Nev433/rail-projects/blob/main/CLAUDE.md) — cross-cutting stack, shared types, cross-service integration.

## Part of the rail-projects family

One of nine repos in the [Nev433 rail-projects](https://github.com/Nev433?tab=repositories) workspace. See [rail-projects](https://github.com/Nev433/rail-projects) for the workspace docs and data standards.
