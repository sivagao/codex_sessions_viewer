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

export async function writeExportArchive(
  filePath: string,
  bundles: ThreadExportBundle[]
): Promise<string> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const zip = new yazl.ZipFile();

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

  for (const bundle of bundles) {
    const transcript = [
      `# ${bundle.thread.title}`,
      "",
      `- Thread ID: ${bundle.thread.id}`,
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
