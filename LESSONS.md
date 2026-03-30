# Lessons

## 2026-03-30: Packaged Bridge Debugging Rules

### What went wrong

- Several fixes were pushed before the packaged install flow was truly validated on the same machine.
- Source-tree checks passed while the installed runtime still failed.
- Old manual processes and old installs could mask whether the packaged bridge itself was actually healthy.

### Required practice from now on

- If the issue touches packaged bridge install/startup, always re-download or freshly rebuild the package and test that artifact directly.
- If the issue touches installed macOS behavior, test the installed binary under:
  - `~/Library/Application Support/CodexSessionsViewerBridge/bin/`
- If the issue touches browser-to-bridge connectivity, test both:
  - raw localhost health
  - the same request shape the browser uses, especially `Origin`

### Minimum command checklist

Use these before claiming a fix:

```bash
curl -sv http://127.0.0.1:4318/bridge/health
curl -si -H 'Origin: https://sivagao.github.io' http://127.0.0.1:4318/bridge/health
launchctl print gui/$(id -u)/local.codex-sessions-viewer.bridge | sed -n '1,180p'
lsof -iTCP:4318 -sTCP:LISTEN -n -P
```

For installed-runtime failures, also inspect:

```bash
sed -n '1,200p' "$HOME/Library/Application Support/CodexSessionsViewerBridge/logs/bridge.err.log"
sed -n '1,200p' "$HOME/Library/Application Support/CodexSessionsViewerBridge/logs/bridge.out.log"
```

### Failure modes already seen

- Wrapper pointed at the wrong `daemon.js` path.
- Workspace package metadata still pointed runtime imports at TypeScript source.
- Node ESM imports in packaged runtime were missing `.js` suffixes.
- GitHub Pages browser `Origin` was host-only, while bridge CORS allowlist incorrectly expected a full URL with path.
- Installed bridge used `process.cwd()/data`, which became `/data` under `launchd` and caused startup failure.

### Rule of thumb

- If the user says “still offline” or “still broken”, stop assuming and inspect the real installed process and the real request path on that machine.
