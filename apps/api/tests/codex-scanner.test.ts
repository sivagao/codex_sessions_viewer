import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { scanCodexSources } from "../src/scanners/codexScanner";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeCodexFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "csv-codex-"));
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
      sandbox_policy, approval_mode, cli_version, agent_nickname, agent_role, model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workspace-write', 'never', ?, ?, ?, ?)
  `).run(
    "thread-main",
    path.join(sessionsDir, "rollout-main.jsonl"),
    1774438528,
    1774438529,
    "vscode",
    "openai",
    "/Users/siva/projects/siva_context/codex_sessions_viewer",
    "Build session viewer",
    "0.116.0-alpha.10",
    null,
    null,
    "gpt-5.4"
  );

  db.prepare(`
    INSERT INTO threads (
      id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
      sandbox_policy, approval_mode, cli_version, agent_nickname, agent_role, model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workspace-write', 'never', ?, ?, ?, ?)
  `).run(
    "thread-agent",
    path.join(sessionsDir, "rollout-agent.jsonl"),
    1774438530,
    1774438531,
    "{\"subagent\":{\"thread_spawn\":{\"parent_thread_id\":\"thread-main\",\"depth\":1}}}",
    "openai",
    "/Users/siva/projects/siva_context/codex_sessions_viewer",
    "Indexer worker",
    "0.116.0-alpha.10",
    "Archimedes",
    "worker",
    "gpt-5.4-mini"
  );

  db.prepare(`
    INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status)
    VALUES ('thread-main', 'thread-agent', 'completed')
  `).run();
  db.close();

  fs.writeFileSync(
    path.join(codexHome, "session_index.jsonl"),
    [
      JSON.stringify({
        id: "thread-main",
        thread_name: "Build session viewer",
        updated_at: "2026-03-25T02:15:29Z"
      }),
      JSON.stringify({
        id: "thread-agent",
        thread_name: "Indexer worker",
        updated_at: "2026-03-25T02:15:31Z"
      })
    ].join("\n")
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
          originator: "Codex Desktop"
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-25T02:15:29Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Need global session search"
        }
      })
    ].join("\n")
  );

  fs.writeFileSync(
    path.join(sessionsDir, "rollout-agent.jsonl"),
    [
      JSON.stringify({
        timestamp: "2026-03-25T02:15:30Z",
        type: "session_meta",
        payload: {
          id: "thread-agent",
          cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
          originator: "Codex Desktop"
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-25T02:15:31Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Indexed session metadata" }]
        }
      })
    ].join("\n")
  );

  return { codexHome };
}

describe("scanCodexSources", () => {
  it("normalizes threads, events, and relations from a Codex home", async () => {
    const { codexHome } = writeCodexFixture();

    const result = await scanCodexSources({
      codexHome,
      desktopCodexPath: path.join(codexHome, "..", "Library", "Application Support", "Codex")
    });

    expect(result.threads).toHaveLength(2);
    expect(result.threads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "thread-main",
          sourceKind: "app"
        }),
        expect.objectContaining({
          id: "thread-agent",
          sourceKind: "subagent",
          hasAgents: false
        })
      ])
    );
    expect(result.relations).toEqual([
      {
        childThreadId: "thread-agent",
        parentThreadId: "thread-main",
        relationType: "spawn"
      }
    ]);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threadId: "thread-main",
          text: "Need global session search"
        }),
        expect.objectContaining({
          threadId: "thread-agent",
          text: "Indexed session metadata"
        })
      ])
    );
  });
});
