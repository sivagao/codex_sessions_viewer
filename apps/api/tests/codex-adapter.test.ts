import { describe, expect, it } from "vitest";
import { extractThreadEventsFromJsonl } from "../src/scanners/codexJsonl";

describe("extractThreadEventsFromJsonl", () => {
  it("extracts searchable text from session meta and assistant/user messages", () => {
    const lines = [
      JSON.stringify({
        timestamp: "2026-03-24T16:15:52.761Z",
        type: "session_meta",
        payload: {
          id: "thread-1",
          cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
          originator: "Codex Desktop"
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-24T16:16:26.001Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "I indexed the sessions." }]
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-24T16:16:27.001Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Search and resume my session"
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-24T16:16:27.002Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "<permissions instructions>\nFilesystem sandboxing defines which files can be read."
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-24T16:16:27.003Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "I indexed the sessions." }]
        }
      }),
      JSON.stringify({
        timestamp: "2026-03-24T16:16:27.004Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "output_text", text: "<skill>\n<name>using-superpowers</name>" }]
        }
      })
    ].join("\n");

    expect(extractThreadEventsFromJsonl(lines, "/tmp/thread-1.jsonl")).toEqual([
      expect.objectContaining({
        threadId: "thread-1",
        actor: "system",
        eventType: "session_meta",
        text: "/Users/siva/projects/siva_context/codex_sessions_viewer"
      }),
      expect.objectContaining({
        actor: "assistant",
        eventType: "message",
        text: "I indexed the sessions."
      }),
      expect.objectContaining({
        actor: "user",
        eventType: "message",
        text: "Search and resume my session"
      }),
      expect.objectContaining({
        actor: "system",
        eventType: "message",
        text: "<permissions instructions>\nFilesystem sandboxing defines which files can be read."
      }),
      expect.objectContaining({
        actor: "system",
        eventType: "message",
        text: "<skill>\n<name>using-superpowers</name>"
      })
    ]);
  });
});
