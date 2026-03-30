import fs from "node:fs";
import path from "node:path";
import type { ThreadRelationRow } from "../db/threadStore.js";
import type { IndexedThreadEventRecord } from "../db/threadStore.js";
import type { ThreadDetailRow } from "../db/threadStore.js";
import yazl from "yazl";

export interface ThreadExportBundle {
  thread: ThreadDetailRow;
  events: IndexedThreadEventRecord[];
  relations: ThreadRelationRow[];
}

export interface ExportArchiveOptions {
  contentScope?: "all" | "user";
  projectKey?: string;
}

export async function writeExportArchive(
  filePath: string,
  bundles: ThreadExportBundle[],
  options: ExportArchiveOptions = {}
): Promise<string> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const zip = new yazl.ZipFile();
  const contentScope = options.contentScope ?? "all";

  zip.addBuffer(
    Buffer.from(
      bundles.map((bundle) => JSON.stringify(bundle.thread)).join("\n"),
      "utf8"
    ),
    "threads.jsonl"
  );

  zip.addBuffer(
    Buffer.from(
      [
        "id,title,sourceKind,cwd,updatedAt,favorite,tags",
        ...bundles.map((bundle) =>
          [
            csv(bundle.thread.id),
            csv(bundle.thread.title),
            csv(bundle.thread.sourceKind),
            csv(bundle.thread.cwd),
            csv(bundle.thread.updatedAt),
            csv(String(bundle.thread.favorite)),
            csv(bundle.thread.tags.join("|"))
          ].join(",")
        )
      ].join("\n"),
      "utf8"
    ),
    "threads.csv"
  );

  if (contentScope === "user") {
    const promptDigest = dedupePromptDigest(
      bundles
      .flatMap((bundle) =>
        bundle.events.map((event, index) => ({
          ...event,
          index,
          threadId: bundle.thread.id,
          title: bundle.thread.title,
          projectKey: options.projectKey ?? inferProjectKey(bundle.thread.cwd),
          cwd: bundle.thread.cwd
        }))
      )
      .filter((event) => event.actor === "user")
      .filter((event) => isMeaningfulUserPrompt(event.text))
    );

    zip.addBuffer(
      Buffer.from(
        promptDigest
          .map((event) =>
            [
              `## [${event.projectKey}] ${event.title}`,
              `- session: ${event.threadId}`,
              `- cwd: ${event.cwd}`,
              `- timestamp: ${event.timestamp}`,
              "",
              event.text.trim(),
              ""
            ].join("\n")
          )
          .join("\n"),
        "utf8"
      ),
      "user-prompts.md"
    );

    zip.addBuffer(
      Buffer.from(
        promptDigest
          .map((event) =>
            JSON.stringify({
              projectKey: event.projectKey,
              threadId: event.threadId,
              title: event.title,
              cwd: event.cwd,
              timestamp: event.timestamp,
              text: event.text
            })
          )
          .join("\n"),
        "utf8"
      ),
      "user-prompts.jsonl"
    );
  } else {
    for (const bundle of bundles) {
      const transcript = [
        `# ${bundle.thread.title}`,
        "",
        `- Thread ID: ${bundle.thread.id}`,
        `- Project: ${options.projectKey ?? inferProjectKey(bundle.thread.cwd)}`,
        `- Source: ${bundle.thread.sourceKind}`,
        `- CWD: ${bundle.thread.cwd}`,
        "",
        "## Events",
        ...bundle.events.map(
          (event) => `- [${event.timestamp}] ${event.actor}: ${event.text.replace(/\n/g, " ")}`
        )
      ].join("\n");

      zip.addBuffer(Buffer.from(transcript, "utf8"), `threads/${bundle.thread.id}.md`);
    }
  }

  await new Promise<void>((resolve, reject) => {
    zip.outputStream
      .pipe(fs.createWriteStream(filePath))
      .on("close", () => resolve())
      .on("error", reject);
    zip.end();
  });

  return filePath;
}

function csv(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function inferProjectKey(cwd: string) {
  const worktreeMatch = cwd.match(/\/\.codex\/worktrees\/[^/]+\/([^/]+)/);
  if (worktreeMatch) {
    return worktreeMatch[1];
  }

  const parts = cwd.split("/").filter(Boolean);
  return parts.at(-1) ?? cwd;
}

function dedupePromptDigest<T extends { threadId: string; timestamp: string; text: string }>(
  rows: T[]
) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    const normalizedText = normalizePromptText(row.text);
    const key = `${row.threadId}::${normalizedText}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({
      ...row,
      text: normalizedText
    });
  }

  return deduped;
}

function normalizePromptText(text: string) {
  const trimmed = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
  const noisyMarkers = [
    "\n<collaboration_mode>",
    "\n## Mode rules (strict)",
    "\n## Execution vs. mutation in Plan Mode",
    "\nYou are in **Plan Mode**"
  ];

  const cutIndex = noisyMarkers
    .map((marker) => trimmed.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  const cleaned = cutIndex === undefined ? trimmed : trimmed.slice(0, cutIndex);
  return cleaned.trim();
}

function isMeaningfulUserPrompt(text: string) {
  const normalized = normalizePromptText(text);

  if (!normalized) {
    return false;
  }

  const noisyMarkers = [
    "<collaboration_mode>",
    "## Mode rules (strict)",
    "## Execution vs. mutation in Plan Mode",
    "You are in **Plan Mode**",
    "::automation-update{",
    "::code-comment{"
  ];

  return !noisyMarkers.some((marker) => normalized.includes(marker));
}
