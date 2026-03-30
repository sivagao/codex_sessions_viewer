import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_BRIDGE_PORT, DEFAULT_HOSTED_SITE_URL } from "@csv/core";

const execFileAsync = promisify(execFile);

export interface DaemonCommandResult {
  mode: "start" | "open" | "doctor";
  message: string;
}

export interface RunDaemonCommandOptions {
  hostedSiteUrl?: string;
  bridgePort?: number;
  checkHealth?(port: number): Promise<boolean | null>;
  spawnDetachedBridge?(command: string): void;
  openBrowser?(url: string): void;
}

export async function runDaemonCommand(
  args: string[],
  options: RunDaemonCommandOptions = {}
): Promise<DaemonCommandResult> {
  const command = args[0] ?? "start";
  const hostedSiteUrl = options.hostedSiteUrl ?? process.env.CSV_HOSTED_SITE_URL ?? DEFAULT_HOSTED_SITE_URL;
  const bridgePort = options.bridgePort ?? DEFAULT_BRIDGE_PORT;

  if (command === "open") {
    const healthy = await (options.checkHealth ?? checkHealth)(bridgePort);
    if (!healthy) {
      (options.spawnDetachedBridge ?? spawnDetachedBridge)("start");
    }
    (options.openBrowser ?? openBrowser)(hostedSiteUrl);
    return { mode: "open", message: `Opened ${hostedSiteUrl}` };
  }

  if (command === "doctor") {
    const codexHome = path.join(os.homedir(), ".codex");
    const hostedReachable = await fetch(hostedSiteUrl, { method: "HEAD" })
      .then(() => true)
      .catch(() => false);
    return {
      mode: "doctor",
      message: JSON.stringify({
        codexHome,
        bridgePort,
        hostedSiteUrl,
        hostedReachable
      })
    };
  }

  return { mode: "start", message: `Bridge ready on http://127.0.0.1:${bridgePort}` };
}

async function checkHealth(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/bridge/health`);
    return response.ok;
  } catch {
    return null;
  }
}

function spawnDetachedBridge(command: string) {
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "@csv/api",
      "daemon",
      command
    ],
    {
      detached: true,
      stdio: "ignore",
      cwd: path.resolve(process.cwd(), "../..")
    }
  );
  child.unref();
}

function openBrowser(url: string) {
  void execFileAsync("open", [url]);
}

if (process.argv[1]?.endsWith("daemon.ts") || process.argv[1]?.endsWith("daemon.js")) {
  const args = process.argv.slice(2);
  const result = await runDaemonCommand(args);
  if (args[0] === "start" || !args[0]) {
    const { startBridgeServer } = await import("./server.js");
    await startBridgeServer();
  } else {
    console.log(result.message);
  }
}
