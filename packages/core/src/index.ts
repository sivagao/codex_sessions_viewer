export type ThreadSourceKind = "app" | "cli" | "subagent";
export const DEFAULT_BRIDGE_PORT = 4318;
export const DEFAULT_BRIDGE_PORT_FALLBACK = 4319;
export const DEFAULT_HOSTED_SITE_URL = "https://sivagao.github.io/codex_sessions_viewer/";

export interface BridgeHealthPayload {
  status: "ok";
  mode: "local-bridge";
  bridgeBaseUrl: string;
  hostedSiteUrl: string;
}

export interface ThreadClassificationInput {
  source: string;
  agentRole: string | null;
  agentNickname: string | null;
}

export interface ThreadRelationCandidate {
  threadId: string;
  explicitParentThreadId: string | null;
  source: string;
}

export interface ThreadRelation {
  childThreadId: string;
  parentThreadId: string;
  relationType: "spawn";
}

export interface UserMetadata {
  favorite: boolean;
  hidden: boolean;
  tags: string[];
  note: string;
  projectAlias: string;
}

export interface ThreadEventRecord {
  threadId: string;
  timestamp: string;
  actor: "system" | "user" | "assistant";
  eventType: string;
  text: string;
}

function parseSourcePayload(source: string): unknown {
  if (!source.trim().startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function extractParentThreadId(source: string): string | null {
  const parsed = parseSourcePayload(source) as
    | { subagent?: { thread_spawn?: { parent_thread_id?: string } } }
    | null;

  return parsed?.subagent?.thread_spawn?.parent_thread_id ?? null;
}

export function classifyThreadSource(
  input: ThreadClassificationInput
): ThreadSourceKind {
  if (input.source === "cli") {
    return "cli";
  }

  if (input.source === "vscode") {
    return "app";
  }

  if (extractParentThreadId(input.source) || input.agentRole || input.agentNickname) {
    return "subagent";
  }

  return "app";
}

export function deriveThreadRelations(
  candidates: ThreadRelationCandidate[]
): ThreadRelation[] {
  return candidates
    .map((candidate) => {
      const parentThreadId =
        candidate.explicitParentThreadId ?? extractParentThreadId(candidate.source);

      if (!parentThreadId) {
        return null;
      }

      return {
        childThreadId: candidate.threadId,
        parentThreadId,
        relationType: "spawn" as const
      };
    })
    .filter((value): value is ThreadRelation => value !== null);
}

export function summarizeThreadText(input: {
  title: string;
  cwd: string;
  eventTexts: string[];
}): string {
  return [input.title, input.cwd, ...input.eventTexts]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

export function buildBridgeBaseUrls(host = "127.0.0.1"): string[] {
  return [
    `http://${host}:${DEFAULT_BRIDGE_PORT}`,
    `http://${host}:${DEFAULT_BRIDGE_PORT_FALLBACK}`
  ];
}
