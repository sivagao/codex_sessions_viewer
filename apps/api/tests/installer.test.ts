import { describe, expect, it } from "vitest";
import {
  INSTALL_ROOT_DIRNAME,
  LAUNCH_AGENT_LABEL,
  USER_BIN_DIRNAME,
  renderInstallScript,
  renderLaunchAgentPlist,
  renderUninstallScript
} from "../src/installer";

describe("installer rendering", () => {
  it("renders launchd plist and install scripts for packaged daemon", () => {
    expect(INSTALL_ROOT_DIRNAME).toBe("CodexSessionsViewerBridge");
    expect(LAUNCH_AGENT_LABEL).toBe("local.codex-sessions-viewer.bridge");
    expect(USER_BIN_DIRNAME).toBe(".local/bin");

    const plist = renderLaunchAgentPlist("/Users/siva/Library/Application Support/CodexSessionsViewerBridge");
    expect(plist).toContain("local.codex-sessions-viewer.bridge");
    expect(plist).toContain("codex-sessions-viewer-daemon");
    expect(plist).not.toContain("/bin/zsh");

    const installScript = renderInstallScript();
    expect(installScript).toContain("launchctl bootstrap");
    expect(installScript).toContain("launchctl kickstart");
    expect(installScript).toContain("Library/Application Support/CodexSessionsViewerBridge");
    expect(installScript).toContain(".local/bin");
    expect(installScript).toContain("Opening viewer...");

    const uninstallScript = renderUninstallScript();
    expect(uninstallScript).toContain("launchctl bootout");
    expect(uninstallScript).toContain("CodexSessionsViewerBridge");
    expect(uninstallScript).toContain("codex-sessions-viewer-open");
  });
});
