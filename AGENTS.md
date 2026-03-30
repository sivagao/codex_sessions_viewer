# Codex Sessions Viewer Repo Instructions

## Verification First

- Do not claim a local install, bridge runtime, macOS packaging flow, `launchd` flow, or Pages-to-localhost bridge flow works unless it has been verified on the current machine in the current turn.
- For any bug involving packaged runtime behavior, do not stop at unit tests or local source-tree commands. Verify the packaged artifact itself.

## Required Debugging Flow For Packaging And Local Runtime Issues

When the issue involves any of the following:

- `release/*.tar.gz`
- `install.sh` / `uninstall.sh`
- `launchd`
- localhost bridge startup
- Pages site connecting to `127.0.0.1`
- browser showing `Bridge offline`

You must do all of these before claiming a fix:

1. Reinstall or freshly unpack the current generated package on this machine.
2. Verify the installed or unpacked executable directly, not just source-tree scripts.
3. Check real runtime state:
   - `curl http://127.0.0.1:<port>/bridge/health`
   - `launchctl print gui/$(id -u)/local.codex-sessions-viewer.bridge`
   - `lsof -iTCP:<port> -sTCP:LISTEN -n -P`
   - installed logs under `~/Library/Application Support/CodexSessionsViewerBridge/logs/`
4. If the bug is browser-facing, verify the real request path:
   - exact `Origin`
   - exact response status
   - exact CORS headers
5. If needed, kill old temporary/manual processes so the verification is against the packaged install, not a stray dev process.

## Root-Cause Discipline

- Do not paper over packaged-runtime bugs with frontend retries or UX-only changes before confirming the backend is actually healthy.
- Do not assume an old install will reflect a new packaging fix. If the package changed, reinstall and verify again.
- When a fix depends on GitHub Release or Pages propagation, wait for the relevant workflow to complete before telling the user to retry.

## Documentation Rule

- Any non-obvious packaging/runtime failure mode that costs multiple iterations must be added to `LESSONS.md` in the same change or immediately after.
