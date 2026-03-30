import { createApp } from "./app.js";
import { DEFAULT_BRIDGE_PORT } from "@csv/core";

export function startBridgeServer() {
  const port = Number(process.env.PORT ?? DEFAULT_BRIDGE_PORT);
  const app = createApp({ bridgePort: port });

  return new Promise<void>((resolve) => {
    app.listen(port, "127.0.0.1", () => {
      console.log(`Codex Sessions Viewer API listening on http://127.0.0.1:${port}`);
      resolve();
    });
  });
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  void startBridgeServer();
}
