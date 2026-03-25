import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createThreadStore,
  type IndexedThreadRecord
} from "../src/db/threadStore";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-store-"));
  tempDirs.push(tempDir);
  return createThreadStore(path.join(tempDir, "viewer.db"));
}

function sampleThread(overrides: Partial<IndexedThreadRecord> = {}): IndexedThreadRecord {
  return {
    id: "thread-1",
    title: "Build Codex Sessions Viewer",
    sourceKind: "app",
    rawSource: "vscode",
    cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
    createdAt: "2026-03-24T16:15:52.761Z",
    updatedAt: "2026-03-24T16:16:26.001Z",
    archived: false,
    modelProvider: "openai",
    modelName: "gpt-5.4",
    cliVersion: "0.116.0-alpha.10",
    rawThreadPath: "/Users/siva/.codex/sessions/2026/03/24/thread-1.jsonl",
    rawIndexSource: "/Users/siva/.codex/session_index.jsonl",
    summaryText: "Search all sessions fast Resume from terminal",
    hasAgents: true,
    metadata: {
      favorite: false,
      hidden: false,
      tags: [],
      note: "",
      projectAlias: ""
    }
  };
}

describe("thread store", () => {
  it("supports full-text search and favorite filter", () => {
    const store = makeStore();

    store.upsertThreads([sampleThread()]);
    store.upsertThreadEvents([
      {
        threadId: "thread-1",
        timestamp: "2026-03-24T16:16:26.001Z",
        actor: "assistant",
        eventType: "message",
        text: "Resume from terminal with one click"
      },
      {
        threadId: "thread-1",
        timestamp: "2026-03-24T16:16:27.001Z",
        actor: "user",
        eventType: "message",
        text: "Find my session in terminal"
      }
    ]);
    store.saveUserMetadata("thread-1", {
      favorite: true,
      hidden: false,
      tags: ["viewer"],
      note: "ship first",
      projectAlias: "codex-viewer"
    });

    expect(
      store.searchThreads({
        query: "terminal",
        favoritesOnly: true,
        includeHidden: false
      })
    ).toEqual([
      expect.objectContaining({
        id: "thread-1",
        favorite: true,
        tags: ["viewer"]
      })
    ]);

    expect(
      store.searchThreads({
        query: "session",
        textScope: "user",
        includeHidden: true
      })
    ).toHaveLength(1);
  });
});
