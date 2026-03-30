import { describe, expect, it, vi } from "vitest";
import { runDaemonCommand } from "../src/daemon";

describe("runDaemonCommand", () => {
  it("starts bridge if needed and opens hosted site", async () => {
    const opened: string[] = [];
    const started: string[] = [];
    const checkHealth = vi
      .fn<(_: number) => Promise<boolean | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(true);

    const result = await runDaemonCommand(["open"], {
      checkHealth,
      spawnDetachedBridge(command) {
        started.push(command);
      },
      waitForHealth: async () => true,
      openBrowser(url) {
        opened.push(url);
      },
      hostedSiteUrl: "https://viewer.example.com"
    });

    expect(result.mode).toBe("open");
    expect(started[0]).toContain("start");
    expect(opened[0]).toBe("https://viewer.example.com");
    expect(checkHealth).toHaveBeenCalled();
  });
});
