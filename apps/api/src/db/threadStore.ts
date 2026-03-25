import Database from "better-sqlite3";
import type { ThreadSourceKind, UserMetadata } from "@csv/core";

export interface IndexedThreadRecord {
  id: string;
  title: string;
  sourceKind: ThreadSourceKind;
  rawSource: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  modelProvider: string;
  modelName: string;
  cliVersion: string;
  rawThreadPath: string;
  rawIndexSource: string;
  summaryText: string;
  hasAgents: boolean;
  metadata: UserMetadata;
}

export interface IndexedThreadEventRecord {
  threadId: string;
  timestamp: string;
  actor: "system" | "user" | "assistant";
  eventType: string;
  text: string;
}

export interface ThreadSearchInput {
  query?: string;
  sourceKinds?: ThreadSourceKind[];
  cwdPrefix?: string;
  favoritesOnly?: boolean;
  includeHidden?: boolean;
  textScope?: "user" | "all";
}

export interface ThreadSearchRow {
  id: string;
  title: string;
  sourceKind: ThreadSourceKind;
  cwd: string;
  updatedAt: string;
  favorite: boolean;
  hidden: boolean;
  tags: string[];
  note: string;
  projectAlias: string;
  hasAgents: boolean;
}

export interface ThreadDetailRow extends ThreadSearchRow {
  rawSource: string;
  createdAt: string;
  archived: boolean;
  modelProvider: string;
  modelName: string;
  cliVersion: string;
  rawThreadPath: string;
  rawIndexSource: string;
  summaryText: string;
}

export interface ThreadRelationRow {
  childThreadId: string;
  parentThreadId: string;
  relationType: "spawn";
}

const DEFAULT_METADATA: UserMetadata = {
  favorite: false,
  hidden: false,
  tags: [],
  note: "",
  projectAlias: ""
};

export function createThreadStore(databasePath: string) {
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      raw_source TEXT NOT NULL,
      cwd TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL,
      model_provider TEXT NOT NULL,
      model_name TEXT NOT NULL,
      cli_version TEXT NOT NULL,
      raw_thread_path TEXT NOT NULL,
      raw_index_source TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      has_agents INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_metadata (
      thread_id TEXT PRIMARY KEY,
      favorite INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      project_alias TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS thread_events (
      thread_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      event_type TEXT NOT NULL,
      text TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thread_relations (
      child_thread_id TEXT PRIMARY KEY,
      parent_thread_id TEXT NOT NULL,
      relation_type TEXT NOT NULL
    );

    DROP TABLE IF EXISTS thread_search;
    CREATE VIRTUAL TABLE thread_search USING fts5(
      thread_id UNINDEXED,
      actor UNINDEXED,
      text
    );
  `);

  const upsertThread = db.prepare(`
    INSERT INTO threads (
      id, title, source_kind, raw_source, cwd, created_at, updated_at,
      archived, model_provider, model_name, cli_version, raw_thread_path,
      raw_index_source, summary_text, has_agents
    ) VALUES (
      @id, @title, @sourceKind, @rawSource, @cwd, @createdAt, @updatedAt,
      @archived, @modelProvider, @modelName, @cliVersion, @rawThreadPath,
      @rawIndexSource, @summaryText, @hasAgents
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      source_kind = excluded.source_kind,
      raw_source = excluded.raw_source,
      cwd = excluded.cwd,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      archived = excluded.archived,
      model_provider = excluded.model_provider,
      model_name = excluded.model_name,
      cli_version = excluded.cli_version,
      raw_thread_path = excluded.raw_thread_path,
      raw_index_source = excluded.raw_index_source,
      summary_text = excluded.summary_text,
      has_agents = excluded.has_agents
  `);

  const replaceMetadata = db.prepare(`
    INSERT INTO user_metadata (
      thread_id, favorite, hidden, tags_json, note, project_alias
    ) VALUES (
      @threadId, @favorite, @hidden, @tagsJson, @note, @projectAlias
    )
    ON CONFLICT(thread_id) DO UPDATE SET
      favorite = excluded.favorite,
      hidden = excluded.hidden,
      tags_json = excluded.tags_json,
      note = excluded.note,
      project_alias = excluded.project_alias
  `);

  const insertEvent = db.prepare(`
    INSERT INTO thread_events (thread_id, timestamp, actor, event_type, text)
    VALUES (@threadId, @timestamp, @actor, @eventType, @text)
  `);
  const replaceRelation = db.prepare(`
    INSERT INTO thread_relations (child_thread_id, parent_thread_id, relation_type)
    VALUES (@childThreadId, @parentThreadId, @relationType)
    ON CONFLICT(child_thread_id) DO UPDATE SET
      parent_thread_id = excluded.parent_thread_id,
      relation_type = excluded.relation_type
  `);

  const deleteSearchRows = db.prepare(`DELETE FROM thread_search WHERE thread_id = ?`);
  const insertSearchRow = db.prepare(`
    INSERT INTO thread_search (thread_id, actor, text) VALUES (?, ?, ?)
  `);

  function metadataFor(threadId: string, metadata?: Partial<UserMetadata>) {
    const merged = { ...DEFAULT_METADATA, ...metadata };
    replaceMetadata.run({
      threadId,
      favorite: merged.favorite ? 1 : 0,
      hidden: merged.hidden ? 1 : 0,
      tagsJson: JSON.stringify(merged.tags),
      note: merged.note,
      projectAlias: merged.projectAlias
    });
  }

  return {
    close() {
      db.close();
    },

    resetIndex() {
      db.exec(`
        DELETE FROM thread_relations;
        DELETE FROM thread_events;
        DELETE FROM thread_search;
        DELETE FROM user_metadata;
        DELETE FROM threads;
      `);
    },

    upsertThreads(threads: IndexedThreadRecord[]) {
      const transaction = db.transaction((rows: IndexedThreadRecord[]) => {
        for (const row of rows) {
          upsertThread.run({
            ...row,
            archived: row.archived ? 1 : 0,
            hasAgents: row.hasAgents ? 1 : 0
          });
          metadataFor(row.id, row.metadata);
          deleteSearchRows.run(row.id);
          insertSearchRow.run(row.id, "thread", [row.title, row.cwd, row.summaryText].join(" "));
        }
      });

      transaction(threads);
    },

    upsertThreadEvents(events: IndexedThreadEventRecord[]) {
      const transaction = db.transaction((rows: IndexedThreadEventRecord[]) => {
        for (const row of rows) {
          insertEvent.run(row);
          insertSearchRow.run(row.threadId, row.actor, row.text);
        }
      });

      transaction(events);
    },

    upsertRelations(relations: ThreadRelationRow[]) {
      const transaction = db.transaction((rows: ThreadRelationRow[]) => {
        for (const row of rows) {
          replaceRelation.run(row);
        }
      });

      transaction(relations);
    },

    saveUserMetadata(threadId: string, metadata: UserMetadata) {
      metadataFor(threadId, metadata);
    },

    searchThreads(input: ThreadSearchInput): ThreadSearchRow[] {
      const where: string[] = [];
      const params: Record<string, unknown> = {};

      if (!input.includeHidden) {
        where.push("COALESCE(um.hidden, 0) = 0");
      }

      if (input.favoritesOnly) {
        where.push("COALESCE(um.favorite, 0) = 1");
      }

      if (input.sourceKinds?.length) {
        const placeholders = input.sourceKinds.map((_, index) => `@sourceKind${index}`);
        input.sourceKinds.forEach((kind, index) => {
          params[`sourceKind${index}`] = kind;
        });
        where.push(`t.source_kind IN (${placeholders.join(", ")})`);
      }

      if (input.cwdPrefix?.trim()) {
        where.push("t.cwd LIKE @cwdPrefix");
        params.cwdPrefix = `${input.cwdPrefix.trim()}%`;
      }

      if (input.query?.trim()) {
        const actorPredicate =
          input.textScope === "user"
            ? "AND actor IN ('user', 'thread')"
            : "";
        where.push(
          `t.id IN (
            SELECT thread_id FROM thread_search
            WHERE thread_search MATCH @query
            ${actorPredicate}
          )`
        );
        params.query = input.query.trim();
      }

      const statement = db.prepare(`
        SELECT
          t.id,
          t.title,
          t.source_kind AS sourceKind,
          t.cwd,
          t.updated_at AS updatedAt,
          COALESCE(um.favorite, 0) AS favorite,
          COALESCE(um.hidden, 0) AS hidden,
          COALESCE(um.tags_json, '[]') AS tagsJson,
          COALESCE(um.note, '') AS note,
          COALESCE(um.project_alias, '') AS projectAlias,
          t.has_agents AS hasAgents
        FROM threads t
        LEFT JOIN user_metadata um ON um.thread_id = t.id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY t.updated_at DESC
      `);

      return statement.all(params).map((row: unknown) => {
        const typedRow = row as {
          id: string;
          title: string;
          sourceKind: ThreadSourceKind;
          cwd: string;
          updatedAt: string;
          favorite: number;
          hidden: number;
          tagsJson: string;
          note: string;
          projectAlias: string;
          hasAgents: number;
        };

        return {
          id: typedRow.id,
          title: typedRow.title,
          sourceKind: typedRow.sourceKind,
          cwd: typedRow.cwd,
          updatedAt: typedRow.updatedAt,
          favorite: Boolean(typedRow.favorite),
          hidden: Boolean(typedRow.hidden),
          tags: JSON.parse(typedRow.tagsJson) as string[],
          note: typedRow.note,
          projectAlias: typedRow.projectAlias,
          hasAgents: Boolean(typedRow.hasAgents)
        };
      });
    },

    getThread(threadId: string): ThreadDetailRow | null {
      const row = db
        .prepare(`
          SELECT
            t.id,
            t.title,
            t.source_kind AS sourceKind,
            t.raw_source AS rawSource,
            t.cwd,
            t.created_at AS createdAt,
            t.updated_at AS updatedAt,
            t.archived,
            t.model_provider AS modelProvider,
            t.model_name AS modelName,
            t.cli_version AS cliVersion,
            t.raw_thread_path AS rawThreadPath,
            t.raw_index_source AS rawIndexSource,
            t.summary_text AS summaryText,
            t.has_agents AS hasAgents,
            COALESCE(um.favorite, 0) AS favorite,
            COALESCE(um.hidden, 0) AS hidden,
            COALESCE(um.tags_json, '[]') AS tagsJson,
            COALESCE(um.note, '') AS note,
            COALESCE(um.project_alias, '') AS projectAlias
          FROM threads t
          LEFT JOIN user_metadata um ON um.thread_id = t.id
          WHERE t.id = ?
        `)
        .get(threadId) as
        | {
            id: string;
            title: string;
            sourceKind: ThreadSourceKind;
            rawSource: string;
            cwd: string;
            createdAt: string;
            updatedAt: string;
            archived: number;
            modelProvider: string;
            modelName: string;
            cliVersion: string;
            rawThreadPath: string;
            rawIndexSource: string;
            summaryText: string;
            hasAgents: number;
            favorite: number;
            hidden: number;
            tagsJson: string;
            note: string;
            projectAlias: string;
          }
        | undefined;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        title: row.title,
        sourceKind: row.sourceKind,
        rawSource: row.rawSource,
        cwd: row.cwd,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        archived: Boolean(row.archived),
        modelProvider: row.modelProvider,
        modelName: row.modelName,
        cliVersion: row.cliVersion,
        rawThreadPath: row.rawThreadPath,
        rawIndexSource: row.rawIndexSource,
        summaryText: row.summaryText,
        hasAgents: Boolean(row.hasAgents),
        favorite: Boolean(row.favorite),
        hidden: Boolean(row.hidden),
        tags: JSON.parse(row.tagsJson) as string[],
        note: row.note,
        projectAlias: row.projectAlias
      };
    },

    getThreadEvents(threadId: string): IndexedThreadEventRecord[] {
      return db
        .prepare(`
          SELECT thread_id AS threadId, timestamp, actor, event_type AS eventType, text
          FROM thread_events
          WHERE thread_id = ?
          ORDER BY timestamp ASC
        `)
        .all(threadId) as IndexedThreadEventRecord[];
    },

    getThreadRelations(threadId: string): ThreadRelationRow[] {
      return db
        .prepare(`
          SELECT child_thread_id AS childThreadId, parent_thread_id AS parentThreadId, relation_type AS relationType
          FROM thread_relations
          WHERE child_thread_id = ? OR parent_thread_id = ?
          ORDER BY child_thread_id ASC
        `)
        .all(threadId, threadId) as ThreadRelationRow[];
    },

    getStats() {
      const threads = db.prepare(`SELECT COUNT(*) AS count FROM threads`).get() as {
        count: number;
      };
      const events = db.prepare(`SELECT COUNT(*) AS count FROM thread_events`).get() as {
        count: number;
      };
      const relations = db.prepare(`SELECT COUNT(*) AS count FROM thread_relations`).get() as {
        count: number;
      };

      return {
        threads: threads.count,
        events: events.count,
        relations: relations.count
      };
    }
  };
}
