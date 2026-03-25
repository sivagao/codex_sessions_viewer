# Codex Sessions Viewer

Mac-first local viewer for Codex sessions. It scans `~/.codex`, normalizes threads into a local SQLite index, exposes a local HTTP API, and serves a search-first web UI for search, filtering, review, export, and resume.

## Workspace

- `packages/core`: shared types and normalization helpers
- `apps/api`: local scanner, SQLite index, HTTP API, export, Terminal resume
- `apps/web`: local web UI

## Commands

```bash
pnpm install
pnpm test
pnpm check
pnpm build
pnpm dev
```

`pnpm dev` starts:

- API: `http://127.0.0.1:4318`
- Web: `http://127.0.0.1:4173`

## Notes

- The API stores app-owned state under `apps/api/data/` by default.
- Resume launches use Terminal.app on macOS via `osascript`.
- Raw Codex session files are never mutated.

## Using It On Another Computer

If the other machine is also a Mac with Codex installed, the current version already works there:

```bash
git clone <your-repo-url> codex_sessions_viewer
cd codex_sessions_viewer
pnpm install
pnpm dev
```

The app reads that machine's own `~/.codex` automatically, so each computer indexes its own local sessions.

Current behavior:

- code syncs through git
- session indexes stay local per machine
- app-owned metadata stays local because `apps/api/data/` is ignored

If you want the same favorites/tags/notes across machines later, that should be a separate feature:

- add `machine_id` to the local index
- export/import app metadata bundles
- or add a small sync backend for metadata only
