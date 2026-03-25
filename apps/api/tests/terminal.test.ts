import { describe, expect, it } from "vitest";
import { buildTerminalAppleScript } from "../src/utils/terminal";

describe("buildTerminalAppleScript", () => {
  it("wraps a shell command in a Terminal.app AppleScript", () => {
    expect(buildTerminalAppleScript("cd /tmp && codex resume thread-main")).toContain(
      'do script "cd /tmp && codex resume thread-main"'
    );
  });
});
