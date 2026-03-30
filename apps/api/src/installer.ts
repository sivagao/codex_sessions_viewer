import path from "node:path";

export const INSTALL_ROOT_DIRNAME = "CodexSessionsViewerBridge";
export const LAUNCH_AGENT_LABEL = "local.codex-sessions-viewer.bridge";

export function installRoot(homeDir = "$HOME") {
  return path.join(homeDir, "Library", "Application Support", INSTALL_ROOT_DIRNAME);
}

export function renderLaunchAgentPlist(installDir: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCH_AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>${installDir}/bin/codex-sessions-viewer-daemon start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${installDir}/logs/bridge.out.log</string>
    <key>StandardErrorPath</key>
    <string>${installDir}/logs/bridge.err.log</string>
  </dict>
</plist>
`;
}

export function renderInstallScript() {
  return `#!/bin/zsh
set -euo pipefail

INSTALL_DIR="$HOME/Library/Application Support/${INSTALL_ROOT_DIRNAME}"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$LAUNCH_AGENTS_DIR/${LAUNCH_AGENT_LABEL}.plist"

mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/logs"
mkdir -p "$LAUNCH_AGENTS_DIR"

cp -R runtime/* "$INSTALL_DIR/"
sed "s|__INSTALL_DIR__|$INSTALL_DIR|g" support/${LAUNCH_AGENT_LABEL}.plist.template > "$PLIST_PATH"
chmod +x "$INSTALL_DIR/bin/codex-sessions-viewer-daemon"
chmod +x "$INSTALL_DIR/bin/codex-sessions-viewer-open"
chmod +x "$INSTALL_DIR/bin/codex-sessions-viewer-doctor"

launchctl bootout gui/"$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap gui/"$(id -u)" "$PLIST_PATH"

echo "Installed Codex Sessions Viewer Bridge to $INSTALL_DIR"
echo "Use: $INSTALL_DIR/bin/codex-sessions-viewer-open"
`;
}

export function renderUninstallScript() {
  return `#!/bin/zsh
set -euo pipefail

INSTALL_DIR="$HOME/Library/Application Support/${INSTALL_ROOT_DIRNAME}"
PLIST_PATH="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"

launchctl bootout gui/"$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"
rm -rf "$INSTALL_DIR"

echo "Removed ${INSTALL_ROOT_DIRNAME}"
`;
}
