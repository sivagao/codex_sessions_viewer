import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeCodexHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "csv-app-"));
  tempDirs.push(root);
  const codexHome = path.join(root, ".codex");
  const sessionsDir = path.join(codexHome, "sessions", "2026", "03", "25");
  fs.mkdirSync(sessionsDir, { recursive: true });

  const db = new Database(path.join(codexHome, "state_5.sqlite"));
  db.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      rollout_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      model_provider TEXT NOT NULL,
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      sandbox_policy TEXT NOT NULL,
      approval_mode TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      has_user_event INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at INTEGER,
      git_sha TEXT,
      git_branch TEXT,
      git_origin_url TEXT,
      cli_version TEXT NOT NULL DEFAULT '',
      first_user_message TEXT NOT NULL DEFAULT '',
      agent_nickname TEXT,
      agent_role TEXT,
      memory_mode TEXT NOT NULL DEFAULT 'enabled',
      model TEXT,
      reasoning_effort TEXT,
      agent_path TEXT
    );
    CREATE TABLE thread_spawn_edges (
      parent_thread_id TEXT NOT NULL,
      child_thread_id TEXT NOT NULL PRIMARY KEY,
      status TEXT NOT NULL
    );
  `);
  db.prepare(`
    INSERT INTO threads (
      id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
      sandbox_policy, approval_mode, cli_version, model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workspace-write', 'never', ?, ?)
  `).run(
    "thread-main",
    path.join(sessionsDir, "rollout-main.jsonl"),
    1774438528,
    1774438529,
    "cli",
    "openai",
    "/Users/siva/projects/siva_context/codex_sessions_viewer",
    "Resume my thread",
    "0.116.0-alpha.10",
    "gpt-5.4"
  );
  db.close();

  fs.writeFileSync(
    path.join(codexHome, "session_index.jsonl"),
    JSON.stringify({
      id: "thread-main",
      thread_name: "Resume my thread",
      updated_at: "2026-03-25T02:15:29Z"
    })
  );

  fs.writeFileSync(
    path.join(sessionsDir, "rollout-main.jsonl"),
    [
      JSON.stringify({
        timestamp: "2026-03-25T02:15:28Z",
        type: "session_meta",
        payload: {
          id: "thread-main",
          cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
          originator: "Codex CLI"
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-25T02:15:29Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Resume from Terminal"
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-25T02:15:30Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Ready to resume" }]
        }
      })
    ].join("\n")
  );

  return {
    codexHome,
    dataDir: path.join(root, "data")
  };
}

describe("createApp", () => {
  it("refreshes, searches, updates metadata, returns detail, and prepares resume/export actions", async () => {
    const { codexHome, dataDir } = makeCodexHome();
    const launched: string[] = [];
    const app = createApp({
      dataDir,
      codexHome,
      desktopCodexPath: path.join(codexHome, "..", "Library", "Application Support", "Codex"),
      launchTerminal(command) {
        launched.push(command);
        return { command, terminal: "Terminal.app" };
      }
    });

    const refresh = await request(app)
      .post("/api/index/refresh")
      .send({ mode: "full" })
      .expect(200);

    expect(refresh.body.stats.threads).toBe(1);

    const search = await request(app)
      .get("/api/threads")
      .query({
        q: "Terminal",
        cwdPrefix: "/Users/siva/projects/siva_context",
        favoritesOnly: "false",
        textScope: "user"
      })
      .expect(200);

    expect(search.body.items).toEqual([
      expect.objectContaining({
        id: "thread-main",
        title: "Resume my thread"
      })
    ]);

    await request(app)
      .patch("/api/threads/thread-main/user-metadata")
      .send({
        favorite: true,
        hidden: false,
        tags: ["important"],
        note: "revisit",
        projectAlias: "viewer"
      })
      .expect(200);

    const favoritesOnly = await request(app)
      .get("/api/threads")
      .query({ favoritesOnly: "true" })
      .expect(200);

    expect(favoritesOnly.body.items).toHaveLength(1);

    const projects = await request(app).get("/api/projects").expect(200);
    expect(projects.body.items[0]).toEqual(
      expect.objectContaining({
        label: "viewer"
      })
    );

    const detail = await request(app).get("/api/threads/thread-main").expect(200);
    expect(detail.body.thread).toEqual(
      expect.objectContaining({
        id: "thread-main",
        favorite: true,
        tags: ["important"]
      })
    );
    expect(detail.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Resume from Terminal"
        })
      ])
    );

    const resume = await request(app).post("/api/threads/thread-main/resume").expect(200);
    expect(resume.body.launch.command).toContain("codex resume thread-main");
    expect(launched[0]).toContain("codex resume thread-main");

    const exported = await request(app)
      .post("/api/exports")
      .send({ threadIds: ["thread-main"] })
      .expect(200);

    expect(exported.body.filePath).toMatch(/\.zip$/);
    expect(fs.existsSync(exported.body.filePath)).toBe(true);
  });
});
