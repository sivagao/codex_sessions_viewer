import { createApp } from "./app.js";
import { DEFAULT_BRIDGE_PORT } from "@csv/core";
import type { createCodexIndexService } from "./services/codexIndexService.js";

type CodexIndexService = ReturnType<typeof createCodexIndexService>;

export async function startBridgeServer() {
  const port = Number(process.env.PORT ?? DEFAULT_BRIDGE_PORT);
  const app = createApp({ bridgePort: port });
  const service = app.get("codexIndexService") as CodexIndexService;
  const stats = service.getStats();

  if (stats.threads === 0) {
    console.log("Codex Sessions Viewer: index empty, running initial full refresh...");
    await service.refresh("full");
  } else {
    console.log("Codex Sessions Viewer: running incremental refresh on startup...");
    await service.refresh("incremental");
  }

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
