import type { ThreadEventRecord } from "@csv/core";

interface JsonlEnvelope {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isInjectedContextMessage(text: string) {
  return (
    text.startsWith("<permissions instructions>") ||
    text.startsWith("# AGENTS.md instructions") ||
    text.startsWith("<environment_context>") ||
    text.startsWith("<skill>") ||
    text.includes("MEMORY_SUMMARY BEGINS")
  );
}

function extractMessageText(payload: Record<string, unknown>): string[] {
  const content = payload.content;

  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const text = asString((item as { text?: unknown }).text);
      return text ? [text] : [];
    })
    .filter(Boolean);
}

export function extractThreadEventsFromJsonl(
  fileContents: string,
  filePath: string
): ThreadEventRecord[] {
  const events: ThreadEventRecord[] = [];
  let currentThreadId = "";
  const seen = new Set<string>();

  for (const line of fileContents.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    let envelope: JsonlEnvelope;
    try {
      envelope = JSON.parse(line) as JsonlEnvelope;
    } catch {
      continue;
    }

    const timestamp = asString(envelope.timestamp) ?? new Date(0).toISOString();
    const payload = envelope.payload ?? {};

    if (envelope.type === "session_meta") {
      const threadId = asString(payload.id) ?? currentThreadId ?? filePath;
      currentThreadId = threadId;
      const cwd = asString(payload.cwd) ?? filePath;
      events.push({
        threadId,
        timestamp,
        actor: "system",
        eventType: "session_meta",
        text: cwd
      });
      seen.add(`${threadId}|system|session_meta|${cwd}`);
      continue;
    }

    if (envelope.type === "response_item") {
      const text = extractMessageText(payload).join("\n").trim();
      if (!text) {
        continue;
      }

      const actor: ThreadEventRecord["actor"] =
        payload.role === "assistant"
          ? "assistant"
          : isInjectedContextMessage(text)
            ? "system"
            : "user";

      const candidate = {
        threadId: currentThreadId || filePath,
        timestamp,
        actor,
        eventType: asString(payload.type) ?? "message",
        text
      };
      const signature = `${candidate.threadId}|${candidate.actor}|${candidate.eventType}|${candidate.text}`;
      if (!seen.has(signature)) {
        events.push(candidate);
        seen.add(signature);
      }
      continue;
    }

    if (envelope.type === "event_msg") {
      const text = asString(payload.message);
      if (!text) {
        continue;
      }

      const actor: ThreadEventRecord["actor"] =
        payload.type === "agent_message"
          ? "assistant"
          : isInjectedContextMessage(text)
            ? "system"
            : "user";

      const candidate = {
        threadId: currentThreadId || filePath,
        timestamp,
        actor,
        eventType: "message",
        text
      };
      const signature = `${candidate.threadId}|${candidate.actor}|${candidate.eventType}|${candidate.text}`;
      if (!seen.has(signature)) {
        events.push(candidate);
        seen.add(signature);
      }
    }
  }

  return events;
}
