import { execFileSync } from "node:child_process";
import type { TerminalLaunchResult } from "../services/codexIndexService";

export function buildTerminalAppleScript(command: string) {
  const escapedCommand = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    'tell application "Terminal"',
    "activate",
    `do script "${escapedCommand}"`,
    "end tell"
  ].join("\n");
}

export function launchInTerminal(command: string): TerminalLaunchResult {
  if (process.platform === "darwin") {
    execFileSync("osascript", ["-e", buildTerminalAppleScript(command)]);
  }

  return {
    command,
    terminal: "Terminal.app"
  };
}
