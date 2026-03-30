import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import fg from "fast-glob";
import {
  classifyThreadSource,
  deriveThreadRelations,
  summarizeThreadText,
  type ThreadEventRecord
} from "@csv/core";
import { extractThreadEventsFromJsonl } from "./codexJsonl.js";
import type {
  IndexedThreadEventRecord,
  IndexedThreadRecord,
  ThreadRelationRow
} from "../db/threadStore.js";

interface ThreadRow {
  id: string;
  rollout_path: string;
  created_at: number;
  updated_at: number;
  source: string;
  model_provider: string;
  cwd: string;
  title: string;
  archived: number;
  cli_version: string;
  agent_nickname: string | null;
  agent_role: string | null;
  model: string | null;
}

interface SpawnEdgeRow {
  parent_thread_id: string;
  child_thread_id: string;
}

interface SessionIndexEntry {
  id: string;
  thread_name?: string;
  updated_at?: string;
}

export interface ScanCodexSourcesInput {
  codexHome: string;
  desktopCodexPath: string;
}

export interface ScanCodexSourcesOutput {
  threads: IndexedThreadRecord[];
  events: IndexedThreadEventRecord[];
  relations: ThreadRelationRow[];
  findings: {
    codexHomeExists: boolean;
    desktopCodexPathExists: boolean;
    sessionFiles: number;
  };
}

function timestampFromEpoch(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

async function readSessionIndexMap(sessionIndexPath: string) {
  try {
    const contents = await fs.readFile(sessionIndexPath, "utf8");
    const entries = new Map<string, SessionIndexEntry>();

    for (const line of contents.split("\n")) {
      if (!line.trim()) {
        continue;
      }

      try {
        const parsed = JSON.parse(line) as SessionIndexEntry;
        if (parsed.id) {
          entries.set(parsed.id, parsed);
        }
      } catch {
        continue;
      }
    }

    return entries;
  } catch {
    return new Map<string, SessionIndexEntry>();
  }
}

async function readSessionEvents(sessionRoot: string) {
  const files = await fg("**/*.jsonl", {
    cwd: sessionRoot,
    absolute: true,
    onlyFiles: true
  });
  const events = new Map<string, ThreadEventRecord[]>();

  for (const file of files) {
    try {
      const contents = await fs.readFile(file, "utf8");
      const extracted = extractThreadEventsFromJsonl(contents, file);

      for (const event of extracted) {
        const existing = events.get(event.threadId) ?? [];
        existing.push(event);
        events.set(event.threadId, existing);
      }
    } catch {
      continue;
    }
  }

  return { files, events };
}

export async function scanCodexSources(
  input: ScanCodexSourcesInput
): Promise<ScanCodexSourcesOutput> {
  const codexHomeExists = await fs
    .stat(input.codexHome)
    .then(() => true)
    .catch(() => false);
  const desktopCodexPathExists = await fs
    .stat(input.desktopCodexPath)
    .then(() => true)
    .catch(() => false);

  if (!codexHomeExists) {
    return {
      threads: [],
      events: [],
      relations: [],
      findings: {
        codexHomeExists,
        desktopCodexPathExists,
        sessionFiles: 0
      }
    };
  }

  const stateDbPath = path.join(input.codexHome, "state_5.sqlite");
  const sessionIndexPath = path.join(input.codexHome, "session_index.jsonl");
  const sessionsRoot = path.join(input.codexHome, "sessions");

  const db = new Database(stateDbPath, { readonly: true });
  const threadRows = db
    .prepare(
      `
      SELECT
        id, rollout_path, created_at, updated_at, source, model_provider,
        cwd, title, archived, cli_version, agent_nickname, agent_role, model
      FROM threads
    `
    )
    .all() as ThreadRow[];
  const explicitEdges = db
    .prepare(
      `
      SELECT parent_thread_id, child_thread_id
      FROM thread_spawn_edges
    `
    )
    .all() as SpawnEdgeRow[];
  db.close();

  const sessionIndexEntries = await readSessionIndexMap(sessionIndexPath);
  const sessionData = await readSessionEvents(sessionsRoot);

  const indexedThreads: IndexedThreadRecord[] = threadRows.map((row) => {
    const eventTexts = (sessionData.events.get(row.id) ?? []).map((event) => event.text);
    const sessionIndexEntry = sessionIndexEntries.get(row.id);
    const sourceKind = classifyThreadSource({
      source: row.source,
      agentRole: row.agent_role,
      agentNickname: row.agent_nickname
    });

    return {
      id: row.id,
      title: sessionIndexEntry?.thread_name ?? row.title,
      sourceKind,
      rawSource: row.source,
      cwd: row.cwd,
      createdAt: timestampFromEpoch(row.created_at),
      updatedAt: sessionIndexEntry?.updated_at ?? timestampFromEpoch(row.updated_at),
      archived: Boolean(row.archived),
      modelProvider: row.model_provider,
      modelName: row.model ?? "",
      cliVersion: row.cli_version,
      rawThreadPath: row.rollout_path,
      rawIndexSource: sessionIndexPath,
      summaryText: summarizeThreadText({
        title: sessionIndexEntry?.thread_name ?? row.title,
        cwd: row.cwd,
        eventTexts
      }),
      hasAgents: explicitEdges.some((edge) => edge.parent_thread_id === row.id),
      metadata: {
        favorite: false,
        hidden: false,
        tags: [],
        note: "",
        projectAlias: ""
      }
    };
  });

  const relations = deriveThreadRelations(
    threadRows.map((row) => ({
      threadId: row.id,
      explicitParentThreadId:
        explicitEdges.find((edge) => edge.child_thread_id === row.id)?.parent_thread_id ?? null,
      source: row.source
    }))
  );

  return {
    threads: indexedThreads,
    events: Array.from(sessionData.events.values()).flat(),
    relations,
    findings: {
      codexHomeExists,
      desktopCodexPathExists,
      sessionFiles: sessionData.files.length
    }
  };
}
