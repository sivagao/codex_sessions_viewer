import { describe, expect, it } from "vitest";
import {
  classifyThreadSource,
  deriveThreadRelations,
  summarizeThreadText
} from "../src/index";

describe("classifyThreadSource", () => {
  it("classifies vscode-backed threads as app", () => {
    expect(
      classifyThreadSource({
        source: "vscode",
        agentRole: null,
        agentNickname: null
      })
    ).toBe("app");
  });

  it("classifies cli-backed threads as cli", () => {
    expect(
      classifyThreadSource({
        source: "cli",
        agentRole: null,
        agentNickname: null
      })
    ).toBe("cli");
  });

  it("classifies spawned agents as subagent", () => {
    expect(
      classifyThreadSource({
        source: "{\"subagent\":{\"thread_spawn\":{\"parent_thread_id\":\"parent-1\"}}}",
        agentRole: "worker",
        agentNickname: "Archimedes"
      })
    ).toBe("subagent");
  });
});

describe("deriveThreadRelations", () => {
  it("prefers explicit spawn edges and falls back to source payloads", () => {
    expect(
      deriveThreadRelations([
        {
          threadId: "child-1",
          explicitParentThreadId: "parent-1",
          source: "cli"
        },
        {
          threadId: "child-2",
          explicitParentThreadId: null,
          source:
            "{\"subagent\":{\"thread_spawn\":{\"parent_thread_id\":\"parent-2\",\"depth\":1}}}"
        }
      ])
    ).toEqual([
      {
        childThreadId: "child-1",
        parentThreadId: "parent-1",
        relationType: "spawn"
      },
      {
        childThreadId: "child-2",
        parentThreadId: "parent-2",
        relationType: "spawn"
      }
    ]);
  });
});

describe("summarizeThreadText", () => {
  it("builds a search summary from title cwd and extracted event text", () => {
    expect(
      summarizeThreadText({
        title: "Build Codex Sessions Viewer",
        cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
        eventTexts: ["Search all sessions fast", "Resume from terminal"]
      })
    ).toContain("Search all sessions fast");
  });
});
