import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_HOSTED_SITE_URL } from "@csv/core";
import {
  LAUNCH_AGENT_LABEL,
  renderInstallScript,
  renderLaunchAgentPlist,
  renderUninstallScript
} from "../../apps/api/src/installer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const releaseName = "codex-sessions-viewer-bridge-macos";
const releaseRoot = path.join(repoRoot, "release", releaseName);
const runtimeDir = path.join(releaseRoot, "runtime");
const supportDir = path.join(releaseRoot, "support");
const archivePath = path.join(repoRoot, "release", `${releaseName}.tar.gz`);

fs.rmSync(releaseRoot, { recursive: true, force: true });
fs.rmSync(archivePath, { force: true });
fs.mkdirSync(releaseRoot, { recursive: true });
fs.mkdirSync(supportDir, { recursive: true });

execFileSync(
  "pnpm",
  ["--filter", "@csv/api", "deploy", "--legacy", "--prod", runtimeDir],
  {
    cwd: repoRoot,
    stdio: "inherit"
  }
);

for (const removable of [
  path.join(runtimeDir, "src"),
  path.join(runtimeDir, "tests"),
  path.join(runtimeDir, "data"),
  path.join(runtimeDir, "tsconfig.json")
]) {
  fs.rmSync(removable, { recursive: true, force: true });
}

const runtimeBinDir = path.join(runtimeDir, "bin");
fs.mkdirSync(runtimeBinDir, { recursive: true });

writeExecutable(
  path.join(runtimeBinDir, "codex-sessions-viewer-daemon"),
  `#!/bin/zsh
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$DIR/dist/daemon.js" "$@"
`
);

writeExecutable(
  path.join(runtimeBinDir, "codex-sessions-viewer-open"),
  `#!/bin/zsh
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$DIR/dist/daemon.js" open
`
);

writeExecutable(
  path.join(runtimeBinDir, "codex-sessions-viewer-doctor"),
  `#!/bin/zsh
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$DIR/dist/daemon.js" doctor
`
);

writeExecutable(path.join(releaseRoot, "install.sh"), renderInstallScript());
writeExecutable(path.join(releaseRoot, "uninstall.sh"), renderUninstallScript());

fs.writeFileSync(
  path.join(supportDir, `${LAUNCH_AGENT_LABEL}.plist.template`),
  renderLaunchAgentPlist("__INSTALL_DIR__"),
  "utf8"
);

fs.writeFileSync(
  path.join(releaseRoot, "README.txt"),
  [
    "Codex Sessions Viewer Bridge (macOS)",
    "",
    "1. Run ./install.sh",
    "2. The installer starts the local bridge and opens the hosted viewer automatically.",
    "3. If you need direct commands later, use:",
    "   \"$HOME/Library/Application Support/CodexSessionsViewerBridge/bin/codex-sessions-viewer-doctor\"",
    "   \"$HOME/Library/Application Support/CodexSessionsViewerBridge/bin/codex-sessions-viewer-open\"",
    `4. Hosted viewer URL: ${DEFAULT_HOSTED_SITE_URL}`,
    "",
    "Use ./uninstall.sh to remove the bridge and launch agent."
  ].join("\n"),
  "utf8"
);

execFileSync(
  "tar",
  ["-czf", archivePath, "-C", path.dirname(releaseRoot), releaseName],
  { stdio: "inherit" }
);

console.log(`Packaged bridge archive: ${archivePath}`);

function writeExecutable(filePath: string, contents: string) {
  fs.writeFileSync(filePath, contents, "utf8");
  fs.chmodSync(filePath, 0o755);
}
