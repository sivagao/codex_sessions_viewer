import { describe, expect, it } from "vitest";
import {
  INSTALL_ROOT_DIRNAME,
  LAUNCH_AGENT_LABEL,
  renderInstallScript,
  renderLaunchAgentPlist,
  renderUninstallScript
} from "../src/installer";

describe("installer rendering", () => {
  it("renders launchd plist and install scripts for packaged daemon", () => {
    expect(INSTALL_ROOT_DIRNAME).toBe("CodexSessionsViewerBridge");
    expect(LAUNCH_AGENT_LABEL).toBe("local.codex-sessions-viewer.bridge");

    const plist = renderLaunchAgentPlist("/Users/siva/Library/Application Support/CodexSessionsViewerBridge");
    expect(plist).toContain("local.codex-sessions-viewer.bridge");
    expect(plist).toContain("codex-sessions-viewer-daemon");

    const installScript = renderInstallScript();
    expect(installScript).toContain("launchctl bootstrap");
    expect(installScript).toContain("Library/Application Support/CodexSessionsViewerBridge");

    const uninstallScript = renderUninstallScript();
    expect(uninstallScript).toContain("launchctl bootout");
    expect(uninstallScript).toContain("CodexSessionsViewerBridge");
  });
});
