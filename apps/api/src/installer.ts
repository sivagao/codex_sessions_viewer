import path from "node:path";

export const INSTALL_ROOT_DIRNAME = "CodexSessionsViewerBridge";
export const LAUNCH_AGENT_LABEL = "local.codex-sessions-viewer.bridge";
export const USER_BIN_DIRNAME = ".local/bin";

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
      <string>${installDir}/bin/codex-sessions-viewer-daemon</string>
      <string>start</string>
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
USER_BIN_DIR="$HOME/${USER_BIN_DIRNAME}"

mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/logs"
mkdir -p "$LAUNCH_AGENTS_DIR"
mkdir -p "$USER_BIN_DIR"

cp -R runtime/* "$INSTALL_DIR/"
sed "s|__INSTALL_DIR__|$INSTALL_DIR|g" support/${LAUNCH_AGENT_LABEL}.plist.template > "$PLIST_PATH"
chmod +x "$INSTALL_DIR/bin/codex-sessions-viewer-daemon"
chmod +x "$INSTALL_DIR/bin/codex-sessions-viewer-open"
chmod +x "$INSTALL_DIR/bin/codex-sessions-viewer-doctor"

ln -sf "$INSTALL_DIR/bin/codex-sessions-viewer-daemon" "$USER_BIN_DIR/codex-sessions-viewer-daemon"
ln -sf "$INSTALL_DIR/bin/codex-sessions-viewer-open" "$USER_BIN_DIR/codex-sessions-viewer-open"
ln -sf "$INSTALL_DIR/bin/codex-sessions-viewer-doctor" "$USER_BIN_DIR/codex-sessions-viewer-doctor"

launchctl bootout gui/"$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap gui/"$(id -u)" "$PLIST_PATH"
launchctl kickstart -k gui/"$(id -u)"/${LAUNCH_AGENT_LABEL} >/dev/null 2>&1 || true

echo "Installed Codex Sessions Viewer Bridge to $INSTALL_DIR"
echo "Installed shell links in $USER_BIN_DIR"
echo "Health:"
"$INSTALL_DIR/bin/codex-sessions-viewer-doctor" || true
echo "Opening viewer..."
"$INSTALL_DIR/bin/codex-sessions-viewer-open" || true
`;
}

export function renderUninstallScript() {
  return `#!/bin/zsh
set -euo pipefail

INSTALL_DIR="$HOME/Library/Application Support/${INSTALL_ROOT_DIRNAME}"
PLIST_PATH="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"
USER_BIN_DIR="$HOME/${USER_BIN_DIRNAME}"

launchctl bootout gui/"$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"
rm -f "$USER_BIN_DIR/codex-sessions-viewer-daemon"
rm -f "$USER_BIN_DIR/codex-sessions-viewer-open"
rm -f "$USER_BIN_DIR/codex-sessions-viewer-doctor"
rm -rf "$INSTALL_DIR"

echo "Removed ${INSTALL_ROOT_DIRNAME}"
`;
}
