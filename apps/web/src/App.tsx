import { useEffect, useState } from "react";

interface ThreadListItem {
  id: string;
  title: string;
  sourceKind: "app" | "cli" | "subagent";
  cwd: string;
  updatedAt: string;
  favorite: boolean;
  hidden: boolean;
  tags: string[];
  note: string;
  projectAlias: string;
  hasAgents: boolean;
}

interface ThreadDetail {
  thread: ThreadListItem & {
    createdAt?: string;
    rawThreadPath?: string;
  };
  relations: Array<{
    childThreadId: string;
    parentThreadId: string;
    relationType: string;
  }>;
  events: Array<{
    actor: string;
    text: string;
  }>;
}

interface ProjectSuggestion {
  key: string;
  label: string;
  prefix: string;
  count: number;
}

const sourceOptions = [
  { label: "All Sources", value: "all" },
  { label: "App", value: "app" },
  { label: "CLI", value: "cli" },
  { label: "Subagent", value: "subagent" }
] as const;

const DETAIL_FOCUS_BREAKPOINT = 1480;

export function App() {
  const [query, setQuery] = useState("");
  const [cwdPrefix, setCwdPrefix] = useState("");
  const [sourceKind, setSourceKind] = useState<(typeof sourceOptions)[number]["value"]>("all");
  const [textScope, setTextScope] = useState<"user" | "all">("user");
  const [projects, setProjects] = useState<ProjectSuggestion[]>([]);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [status, setStatus] = useState("Index ready.");
  const [listCollapsed, setListCollapsed] = useState(false);
  const [showSystemMessages, setShowSystemMessages] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});
  const [autoFocusDetail, setAutoFocusDetail] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < DETAIL_FOCUS_BREAKPOINT : false
  );

  async function loadThreads() {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (sourceKind !== "all") {
      params.set("sourceKind", sourceKind);
    }
    if (cwdPrefix.trim()) {
      params.set("cwdPrefix", cwdPrefix.trim());
    }
    params.set("textScope", textScope);

    const response = await fetch(`/api/threads?${params.toString()}`);
    const data = (await response.json()) as { items: ThreadListItem[] };
    setThreads(data.items);

    if (selectedThreadId && !data.items.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(null);
      setDetail(null);
    }
  }

  async function loadDetail(threadId: string) {
    const response = await fetch(`/api/threads/${threadId}`);
    const data = (await response.json()) as ThreadDetail;
    setDetail(data);
  }

  useEffect(() => {
    void loadThreads();
  }, [query, sourceKind, cwdPrefix, textScope]);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/projects");
      const data = (await response.json()) as { items: ProjectSuggestion[] };
      setProjects(data.items);
    })();
  }, []);

  useEffect(() => {
    if (selectedThreadId) {
      void loadDetail(selectedThreadId);
    }
  }, [selectedThreadId]);

  useEffect(() => {
    function syncLayoutMode() {
      setAutoFocusDetail(window.innerWidth < DETAIL_FOCUS_BREAKPOINT);
    }

    syncLayoutMode();
    window.addEventListener("resize", syncLayoutMode);
    return () => window.removeEventListener("resize", syncLayoutMode);
  }, []);

  async function refreshIndex() {
    setStatus("Refreshing index...");
    const response = await fetch("/api/index/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "full" })
    });
    const data = (await response.json()) as { stats?: { threads: number } };
    setStatus(`Indexed ${data.stats?.threads ?? 0} threads.`);
    await loadThreads();
    const projectsResponse = await fetch("/api/projects");
    const projectsData = (await projectsResponse.json()) as { items: ProjectSuggestion[] };
    setProjects(projectsData.items);
  }

  async function resumeSelectedThread() {
    if (!selectedThreadId) {
      return;
    }

    const response = await fetch(`/api/threads/${selectedThreadId}/resume`, {
      method: "POST"
    });
    const data = (await response.json()) as { launch?: { command?: string } };
    setStatus(
      data.launch?.command ? `Resume launched: ${data.launch.command}` : "Resume launched."
    );
  }

  async function exportSelectedThread() {
    if (!selectedThreadId) {
      return;
    }

    const response = await fetch("/api/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadIds: [selectedThreadId] })
    });
    const data = (await response.json()) as { filePath?: string };
    setStatus(data.filePath ? `Exported to ${data.filePath}` : "Export complete.");
  }

  async function toggleFavorite() {
    if (!detail) {
      return;
    }

    const response = await fetch(`/api/threads/${detail.thread.id}/user-metadata`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        favorite: !detail.thread.favorite,
        hidden: detail.thread.hidden,
        tags: detail.thread.tags,
        note: detail.thread.note,
        projectAlias: detail.thread.projectAlias
      })
    });
    const data = (await response.json()) as { thread?: ThreadListItem };
    if (data.thread) {
      setDetail((current) =>
        current
          ? {
              ...current,
              thread: {
                ...current.thread,
                ...data.thread
              }
            }
          : current
      );
      setStatus(data.thread.favorite ? "Session starred." : "Session unstarred.");
      await loadThreads();
    }
  }

  function toggleMessageExpansion(messageKey: string) {
    setExpandedMessages((current) => ({
      ...current,
      [messageKey]: !current[messageKey]
    }));
  }

  const visibleEvents =
    detail?.events.filter((event) => showSystemMessages || event.actor !== "system") ?? [];
  const detailFocus = Boolean(selectedThreadId) && (listCollapsed || autoFocusDetail);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Mac-first session ops</p>
          <h1>Codex Sessions Viewer</h1>
          <p className="hero-copy">
            Search every Codex thread, recover the exact working directory, inspect spawned agents,
            and jump back into resume without hunting through disk.
          </p>
        </div>
        <button className="primary-button" onClick={() => void refreshIndex()}>
          Refresh Index
        </button>
      </header>

      <section className={detailFocus ? "workspace detail-focus" : "workspace"}>
        <aside className="filters-panel">
          <label className="search-label" htmlFor="thread-search">
            Global Search
          </label>
          <input
            id="thread-search"
            className="search-input"
            placeholder="Search threads, paths, and event text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <label className="search-label secondary-label" htmlFor="cwd-prefix">
            Project Path Prefix
          </label>
          <input
            id="cwd-prefix"
            className="search-input"
            placeholder="/Users/siva/projects/..."
            value={cwdPrefix}
            onChange={(event) => setCwdPrefix(event.target.value)}
          />

          <div className="filter-group">
            {sourceOptions.map((option) => (
              <button
                key={option.value}
                className={option.value === sourceKind ? "filter-chip active" : "filter-chip"}
                onClick={() => setSourceKind(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="filter-group">
            <button
              className={textScope === "user" ? "filter-chip active" : "filter-chip"}
              onClick={() => setTextScope("user")}
            >
              User Focus
            </button>
            <button
              className={textScope === "all" ? "filter-chip active" : "filter-chip"}
              onClick={() => setTextScope("all")}
            >
              All Messages
            </button>
          </div>

          <div className="project-suggestions">
            <p className="section-label">Recent Projects</p>
            <div className="project-chip-list">
              {projects.map((project) => (
                <button
                  key={project.key}
                  className="project-chip"
                  onClick={() => setCwdPrefix(project.prefix)}
                >
                  {project.label}
                </button>
              ))}
            </div>
          </div>

          <p className="status-line">{status}</p>
        </aside>

        <main className={detailFocus ? "results-panel compact" : "results-panel"}>
          <div className="results-toolbar">
            <button onClick={() => setListCollapsed((value) => !value)}>
              {listCollapsed ? "Show List" : "Hide List"}
            </button>
          </div>
          {!listCollapsed
            ? threads.map((thread) => (
                <button
                  key={thread.id}
                  className={thread.id === selectedThreadId ? "thread-card selected" : "thread-card"}
                  aria-label={`Open thread ${thread.id}`}
                  onClick={() => setSelectedThreadId(thread.id)}
                >
                  <div className="thread-card-header">
                    <span className={`badge badge-${thread.sourceKind}`}>{thread.sourceKind}</span>
                    {thread.favorite ? <span className="favorite-marker">Starred</span> : null}
                  </div>
                  <strong className="thread-title">{thread.title}</strong>
                  <span className="thread-cwd">{thread.cwd}</span>
                  <span className="thread-updated">{thread.updatedAt}</span>
                </button>
              ))
            : null}
        </main>

        <aside className="detail-panel">
          {detail ? (
            <>
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Session Detail</p>
                  <h2>Session: {detail.thread.title}</h2>
                </div>
                <div className="detail-actions">
                  {detailFocus ? (
                    <button onClick={() => setListCollapsed(false)}>Show List</button>
                  ) : null}
                  <button aria-label="Star session" onClick={() => void toggleFavorite()}>
                    {detail.thread.favorite ? "Unstar" : "Star"}
                  </button>
                  <button onClick={() => void resumeSelectedThread()}>Resume</button>
                  <button onClick={() => void exportSelectedThread()}>Export</button>
                </div>
              </div>

              <dl className="detail-meta">
                <div>
                  <dt>Source</dt>
                  <dd>{detail.thread.sourceKind}</dd>
                </div>
                <div>
                  <dt>CWD</dt>
                  <dd>{detail.thread.cwd}</dd>
                </div>
                <div>
                  <dt>Tags</dt>
                  <dd>{detail.thread.tags.join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt>Raw Path</dt>
                  <dd>{detail.thread.rawThreadPath ?? "Unavailable"}</dd>
                </div>
              </dl>

              <section className="timeline">
                <div className="timeline-header">
                  <h3>Timeline</h3>
                  <button onClick={() => setShowSystemMessages((value) => !value)}>
                    {showSystemMessages ? "Hide System" : "Show System"}
                  </button>
                </div>
                {visibleEvents.map((event, index) => {
                  const messageKey = `${event.actor}-${index}`;
                  const expanded = expandedMessages[messageKey] ?? false;
                  const longMessage = event.text.length > 220;
                  const displayedText =
                    longMessage && !expanded ? `${event.text.slice(0, 220)}…` : event.text;

                  return (
                    <article key={messageKey} className={`timeline-item actor-${event.actor}`}>
                      <span className="timeline-actor">{event.actor}</span>
                      <p>{displayedText}</p>
                      {longMessage ? (
                        <button
                          className="inline-action"
                          onClick={() => toggleMessageExpansion(messageKey)}
                        >
                          {expanded ? "Collapse" : "Expand"}
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </section>
            </>
          ) : (
            <p className="empty-state">Pick a thread to inspect its cwd, events, and resume target.</p>
          )}
        </aside>
      </section>
    </div>
  );
}
