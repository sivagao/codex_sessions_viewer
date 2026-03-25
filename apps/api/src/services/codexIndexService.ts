import fs from "node:fs";
import path from "node:path";
import type { UserMetadata } from "@csv/core";
import {
  createThreadStore,
  type ThreadSearchInput,
  type ThreadSearchRow
} from "../db/threadStore";
import { scanCodexSources } from "../scanners/codexScanner";

export interface TerminalLaunchResult {
  command: string;
  terminal: string;
}

export interface CodexIndexServiceOptions {
  dataDir: string;
  codexHome: string;
  desktopCodexPath: string;
  launchTerminal(command: string): TerminalLaunchResult;
}

export interface ProjectSuggestion {
  key: string;
  label: string;
  prefix: string;
  count: number;
  updatedAt: string;
}

export function createCodexIndexService(options: CodexIndexServiceOptions) {
  fs.mkdirSync(options.dataDir, { recursive: true });
  const store = createThreadStore(path.join(options.dataDir, "viewer.db"));
  const exportsDir = path.join(options.dataDir, "exports");
  fs.mkdirSync(exportsDir, { recursive: true });

  return {
    close() {
      store.close();
    },

    async refresh(mode: "full" | "incremental" = "full") {
      const scanned = await scanCodexSources({
        codexHome: options.codexHome,
        desktopCodexPath: options.desktopCodexPath
      });

      if (mode === "full") {
        store.resetIndex();
      }

      store.upsertThreads(scanned.threads);
      store.upsertThreadEvents(scanned.events);
      store.upsertRelations(scanned.relations);

      return {
        mode,
        stats: store.getStats(),
        findings: scanned.findings
      };
    },

    searchThreads(input: ThreadSearchInput) {
      return store.searchThreads(input);
    },

    getThreadDetail(threadId: string) {
      const thread = store.getThread(threadId);
      if (!thread) {
        return null;
      }

      return {
        thread,
        events: store.getThreadEvents(threadId),
        relations: store.getThreadRelations(threadId)
      };
    },

    saveUserMetadata(threadId: string, metadata: UserMetadata) {
      store.saveUserMetadata(threadId, metadata);
      return store.getThread(threadId);
    },

    resumeThread(threadId: string) {
      const thread = store.getThread(threadId);
      if (!thread) {
        return null;
      }

      const command = `cd ${shellEscape(thread.cwd)} && codex resume ${threadId}`;
      return {
        thread,
        launch: options.launchTerminal(command)
      };
    },

    exportThreads(threadIds?: string[]) {
      const threads = threadIds?.length
        ? threadIds
            .map((id) => this.getThreadDetail(id))
            .filter((value): value is NonNullable<typeof value> => value !== null)
        : store.searchThreads({ includeHidden: true }).map((thread) => ({
            thread: store.getThread(thread.id)!,
            events: store.getThreadEvents(thread.id),
            relations: store.getThreadRelations(thread.id)
          }));

      const filePath = path.join(exportsDir, `threads-export-${Date.now()}.zip`);
      return { threads, filePath };
    },

    listThreadsForExport(): ThreadSearchRow[] {
      return store.searchThreads({ includeHidden: true });
    },

    listProjectSuggestions(): ProjectSuggestion[] {
      const grouped = new Map<string, ProjectSuggestion>();
      const threads = store.searchThreads({ includeHidden: true });

      for (const thread of threads) {
        const label = inferProjectLabel(thread.cwd, thread.projectAlias);
        const existing = grouped.get(label);
        if (!existing) {
          grouped.set(label, {
            key: label,
            label,
            prefix: thread.cwd,
            count: 1,
            updatedAt: thread.updatedAt
          });
          continue;
        }

        existing.count += 1;
        if (thread.updatedAt > existing.updatedAt) {
          existing.updatedAt = thread.updatedAt;
          existing.prefix = thread.cwd;
        }
      }

      return Array.from(grouped.values())
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 8);
    }
  };
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function inferProjectLabel(cwd: string, projectAlias?: string) {
  if (projectAlias?.trim()) {
    return projectAlias.trim();
  }

  const worktreeMatch = cwd.match(/\/\.codex\/worktrees\/[^/]+\/([^/]+)/);
  if (worktreeMatch) {
    return worktreeMatch[1];
  }

  const parts = cwd.split("/").filter(Boolean);
  return parts.at(-1) ?? cwd;
}
