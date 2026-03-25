import os from "node:os";
import path from "node:path";
import express from "express";
import cors from "cors";
import { z } from "zod";
import type { UserMetadata } from "@csv/core";
import { createCodexIndexService, type TerminalLaunchResult } from "./services/codexIndexService";
import { writeExportArchive } from "./utils/exporter";
import { launchInTerminal } from "./utils/terminal";

const refreshSchema = z.object({
  mode: z.enum(["full", "incremental"]).default("full")
});

const metadataSchema = z.object({
  favorite: z.boolean(),
  hidden: z.boolean(),
  tags: z.array(z.string()),
  note: z.string(),
  projectAlias: z.string()
});

const exportSchema = z.object({
  threadIds: z.array(z.string()).optional()
});

export interface AppOptions {
  dataDir?: string;
  codexHome?: string;
  desktopCodexPath?: string;
  launchTerminal?: (command: string) => TerminalLaunchResult;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const codexHome = options.codexHome ?? path.join(os.homedir(), ".codex");
  const service = createCodexIndexService({
    dataDir: options.dataDir ?? path.join(process.cwd(), "data"),
    codexHome,
    desktopCodexPath:
      options.desktopCodexPath ??
      path.join(os.homedir(), "Library", "Application Support", "Codex"),
    launchTerminal: options.launchTerminal ?? launchInTerminal
  });

  app.post("/api/index/refresh", async (req, res, next) => {
    try {
      const { mode } = refreshSchema.parse(req.body ?? {});
      res.json(await service.refresh(mode));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/threads", (req, res, next) => {
    try {
      const sourceKind = req.query.sourceKind;
      res.json({
        items: service.searchThreads({
          query: typeof req.query.q === "string" ? req.query.q : undefined,
          sourceKinds: typeof sourceKind === "string" && sourceKind !== "all" ? [sourceKind as "app" | "cli" | "subagent"] : undefined,
          cwdPrefix: typeof req.query.cwdPrefix === "string" ? req.query.cwdPrefix : undefined,
          favoritesOnly: req.query.favoritesOnly === "true",
          includeHidden: req.query.includeHidden === "true",
          textScope: req.query.textScope === "all" ? "all" : "user"
        })
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects", (_req, res) => {
    res.json({
      items: service.listProjectSuggestions()
    });
  });

  app.get("/api/threads/:threadId", (req, res) => {
    const detail = service.getThreadDetail(req.params.threadId);
    if (!detail) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    res.json(detail);
  });

  app.patch("/api/threads/:threadId/user-metadata", (req, res, next) => {
    try {
      const metadata = metadataSchema.parse(req.body) as UserMetadata;
      const updated = service.saveUserMetadata(req.params.threadId, metadata);
      if (!updated) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }
      res.json({ thread: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/threads/:threadId/resume", (req, res) => {
    const result = service.resumeThread(req.params.threadId);
    if (!result) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    res.json(result);
  });

  app.post("/api/exports", async (req, res, next) => {
    try {
      const { threadIds } = exportSchema.parse(req.body ?? {});
      const result = service.exportThreads(threadIds);
      await writeExportArchive(result.filePath, result.threads);
      res.json({ filePath: result.filePath, count: result.threads.length });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  });

  return app;
}
