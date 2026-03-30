import fs from "node:fs";
import path from "node:path";
import type { UserMetadata } from "@csv/core";
import {
  createThreadStore,
  type ThreadDetailRow,
  type ThreadSearchInput,
  type ThreadSearchRow
} from "../db/threadStore.js";
import { scanCodexSources } from "../scanners/codexScanner.js";

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

export type ExportContentScope = "all" | "user";

export interface ThreadSearchView extends ThreadSearchRow {
  projectKey: string;
  projectLabel: string;
}

export interface ThreadDetailView {
  thread: ThreadDetailRow & {
    projectKey: string;
    projectLabel: string;
  };
  events: ReturnType<ReturnType<typeof createThreadStore>["getThreadEvents"]>;
  relations: ReturnType<ReturnType<typeof createThreadStore>["getThreadRelations"]>;
}

export interface ThreadSearchFilters extends ThreadSearchInput {
  projectKey?: string;
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

    getStats() {
      return store.getStats();
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

    searchThreads(input: ThreadSearchFilters): ThreadSearchView[] {
      return store
        .searchThreads(input)
        .filter((thread) => !input.projectKey || inferProjectKey(thread.cwd) === input.projectKey)
        .map(attachProjectFields);
    },

    getThreadDetail(threadId: string): ThreadDetailView | null {
      const thread = store.getThread(threadId);
      if (!thread) {
        return null;
      }

      return {
        thread: {
          ...thread,
          ...projectFieldsForThread(thread)
        },
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

    exportThreads(input?: {
      threadIds?: string[];
      projectKey?: string;
      contentScope?: ExportContentScope;
    }) {
      const contentScope = input?.contentScope ?? "all";
      const selectedThreads = input?.threadIds?.length
        ? input.threadIds
            .map((id) => this.getThreadDetail(id))
            .filter((value): value is NonNullable<typeof value> => value !== null)
        : this.searchThreads({
            includeHidden: true,
            projectKey: input?.projectKey
          }).map((thread) => ({
            thread: store.getThread(thread.id)!,
            events: store.getThreadEvents(thread.id),
            relations: store.getThreadRelations(thread.id)
          }));

      const threads = selectedThreads.map((bundle) => ({
        ...bundle,
        events:
          contentScope === "user"
            ? bundle.events.filter((event) => event.actor === "user")
            : bundle.events
      }));

      const exportPrefix = input?.projectKey ? `${input.projectKey}-` : "threads-";
      const scopeSuffix = contentScope === "user" ? "-user-prompts" : "";
      const filePath = path.join(
        exportsDir,
        `${exportPrefix}export-${Date.now()}${scopeSuffix}.zip`
      );
      return { threads, filePath };
    },

    listThreadsForExport(): ThreadSearchRow[] {
      return store.searchThreads({ includeHidden: true });
    },

    listProjectSuggestions(): ProjectSuggestion[] {
      const grouped = new Map<string, ProjectSuggestion>();
      const threads = store.searchThreads({ includeHidden: true });

      for (const thread of threads) {
        const projectKey = inferProjectKey(thread.cwd);
        const projectLabel = inferProjectLabel(thread.cwd, thread.projectAlias);
        const existing = grouped.get(projectKey);
        if (!existing) {
          grouped.set(projectKey, {
            key: projectKey,
            label: projectLabel,
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

export function inferProjectKey(cwd: string) {
  const worktreeMatch = cwd.match(/\/\.codex\/worktrees\/[^/]+\/([^/]+)/);
  if (worktreeMatch) {
    return worktreeMatch[1];
  }

  const parts = cwd.split("/").filter(Boolean);
  return parts.at(-1) ?? cwd;
}

function attachProjectFields(thread: ThreadSearchRow): ThreadSearchView {
  return {
    ...thread,
    ...projectFieldsForThread(thread)
  };
}

function projectFieldsForThread(thread: { cwd: string; projectAlias: string }) {
  return {
    projectKey: inferProjectKey(thread.cwd),
    projectLabel: inferProjectLabel(thread.cwd, thread.projectAlias)
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
