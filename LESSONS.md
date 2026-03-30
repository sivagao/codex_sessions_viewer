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

## 2026-03-30: Process Failure Lessons

### What went wrong in the debugging process

- Multiple times, fixes were proposed or shipped before the exact live failure path was reproduced end-to-end in the real browser and the real installed runtime.
- Several rounds focused on adjacent causes while the current blocking cause had not yet been revalidated on the user’s machine after each change.
- Browser-facing failures were discussed as if they were generic CORS issues before checking the actual browser console and network errors.
- Export/UI fixes were reasoned about from source and local API inspection before confirming what the live page was actually rendering and requesting.

### What must happen next time

- If the user says the same bug still exists after a claimed fix, immediately switch to live verification on the current machine instead of extending the previous hypothesis.
- For browser bugs, inspect the real browser console/network before proposing the next fix.
- For install/runtime bugs, re-run the packaged install flow again after each meaningful fix, not just once per cluster of fixes.
- For live UI mismatch claims, inspect the deployed page assets and then exercise the real UI path before arguing from source.

### Behavioral rule

- Repeated user frustration is itself evidence that the current debugging loop is not grounded enough. Treat that as a process bug and document it.
