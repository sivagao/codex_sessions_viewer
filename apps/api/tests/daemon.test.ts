import { describe, expect, it, vi } from "vitest";
import { runDaemonCommand } from "../src/daemon";

describe("runDaemonCommand", () => {
  it("starts bridge if needed and opens hosted site", async () => {
    const opened: string[] = [];
    const started: string[] = [];

    const result = await runDaemonCommand(["open"], {
      checkHealth: vi.fn().mockResolvedValue(null),
      spawnDetachedBridge(command) {
        started.push(command);
      },
      openBrowser(url) {
        opened.push(url);
      },
      hostedSiteUrl: "https://viewer.example.com"
    });

    expect(result.mode).toBe("open");
    expect(started[0]).toContain("start");
    expect(opened[0]).toBe("https://viewer.example.com");
  });
});
