import { useEffect, useState } from "react";
import { bridgeFetch, probeBridge } from "./lib/bridgeClient";

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
const BRIDGE_DOWNLOAD_URL =
  "https://github.com/sivagao/codex_sessions_viewer/releases/download/bridge-latest/codex-sessions-viewer-bridge-macos.tar.gz";

function currentRoute() {
  if (typeof window === "undefined") {
    return "viewer";
  }

  return window.location.hash === "#/install" ? "install" : "viewer";
}

function currentHostedSiteUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export function App() {
  const [route, setRoute] = useState<"viewer" | "install">(currentRoute);
  const [bridgeBaseUrl, setBridgeBaseUrl] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [hostedSiteUrl, setHostedSiteUrl] = useState<string>(currentHostedSiteUrl);
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

  async function connectBridge() {
    setConnectionState("connecting");
    const health = await probeBridge();
    if (!health) {
      setConnectionState("disconnected");
      setBridgeBaseUrl(null);
      return;
    }

    setBridgeBaseUrl(health.bridgeBaseUrl);
    setHostedSiteUrl(health.hostedSiteUrl);
    setConnectionState("connected");
  }

  async function loadThreads() {
    if (!bridgeBaseUrl) {
      return;
    }
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

    const data = await bridgeFetch<{ items: ThreadListItem[] }>(
      bridgeBaseUrl,
      `/api/threads?${params.toString()}`
    );
    setThreads(data.items);

    if (selectedThreadId && !data.items.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(null);
      setDetail(null);
    }
  }

  async function loadDetail(threadId: string) {
    if (!bridgeBaseUrl) {
      return;
    }
    const data = await bridgeFetch<ThreadDetail>(bridgeBaseUrl, `/api/threads/${threadId}`);
    setDetail(data);
  }

  useEffect(() => {
    function syncRoute() {
      setRoute(currentRoute());
    }

    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    void connectBridge();
  }, []);

  useEffect(() => {
    if (connectionState === "connected" && route === "viewer") {
      void loadThreads();
      void (async () => {
        if (!bridgeBaseUrl) {
          return;
        }
        const data = await bridgeFetch<{ items: ProjectSuggestion[] }>(bridgeBaseUrl, "/api/projects");
        setProjects(data.items);
      })();
    }
  }, [connectionState, bridgeBaseUrl, query, sourceKind, cwdPrefix, textScope, route]);

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
    if (!bridgeBaseUrl) {
      return;
    }
    const data = await bridgeFetch<{ stats?: { threads: number } }>(bridgeBaseUrl, "/api/index/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "full" })
    });
    setStatus(`Indexed ${data.stats?.threads ?? 0} threads.`);
    await loadThreads();
    const projectsData = await bridgeFetch<{ items: ProjectSuggestion[] }>(bridgeBaseUrl, "/api/projects");
    setProjects(projectsData.items);
  }

  async function resumeSelectedThread() {
    if (!selectedThreadId || !bridgeBaseUrl) {
      return;
    }

    const data = await bridgeFetch<{ launch?: { command?: string } }>(bridgeBaseUrl, `/api/threads/${selectedThreadId}/resume`, {
      method: "POST"
    });
    setStatus(
      data.launch?.command ? `Resume launched: ${data.launch.command}` : "Resume launched."
    );
  }

  async function exportSelectedThread() {
    if (!selectedThreadId || !bridgeBaseUrl) {
      return;
    }

    const data = await bridgeFetch<{ filePath?: string }>(bridgeBaseUrl, "/api/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadIds: [selectedThreadId] })
    });
    setStatus(data.filePath ? `Exported to ${data.filePath}` : "Export complete.");
  }

  async function toggleFavorite() {
    if (!detail || !bridgeBaseUrl) {
      return;
    }

    const data = await bridgeFetch<{ thread?: ThreadListItem }>(bridgeBaseUrl, `/api/threads/${detail.thread.id}/user-metadata`, {
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
  const resolvedHostedSiteUrl = hostedSiteUrl || currentHostedSiteUrl() || "configured by deploy";

  if (route === "install") {
    return (
      <div className="app-shell">
        <header className="hero">
          <div>
            <p className="eyebrow">Bridge Install</p>
            <h1>Install the Local Bridge</h1>
            <p className="hero-copy">
              Download the bridge package on each Mac, install it once, and then use the hosted
              viewer against your own localhost session index.
            </p>
          </div>
          <div className="detail-actions">
            <a className="primary-button link-button" href={BRIDGE_DOWNLOAD_URL}>
              Download Bridge
            </a>
            <a className="link-button inline-link-button" href="#/viewer">
              Open Viewer
            </a>
          </div>
        </header>
        <section className="workspace onboarding-shell">
          <aside className="detail-panel onboarding-panel">
            <p className="eyebrow">New Mac Setup</p>
            <h2>Install the Local Bridge</h2>
            <ol className="install-steps">
              <li>Download the packaged bridge tarball from GitHub Releases.</li>
              <li>Extract it and run <code>./install.sh</code>.</li>
              <li>The installer starts the local bridge and opens the hosted viewer automatically.</li>
              <li>If needed later, run <code>codex-sessions-viewer-doctor</code> manually.</li>
            </ol>
            <p>
              Stable download URL:{" "}
              <a className="inline-link-button" href={BRIDGE_DOWNLOAD_URL}>
                bridge-latest
              </a>
            </p>
            <pre className="doctor-block">
{`./install.sh
codex-sessions-viewer-doctor
codex-sessions-viewer-open`}
            </pre>
            <p className="status-line">
              Hosted viewer URL: {resolvedHostedSiteUrl}
            </p>
          </aside>
        </section>
      </div>
    );
  }

  if (connectionState !== "connected") {
    return (
      <div className="app-shell">
        <header className="hero">
          <div>
            <p className="eyebrow">Hosted Site Shell</p>
            <h1>Codex Sessions Viewer</h1>
            <p className="hero-copy">
              This site needs a local bridge daemon on your Mac to read local Codex sessions.
            </p>
          </div>
        </header>
        <section className="workspace onboarding-shell">
          <aside className="detail-panel onboarding-panel">
            <p className="eyebrow">Bridge Status</p>
            <h2>Local Bridge Required</h2>
            <p>
              Start the local daemon on this machine, then retry. The hosted site stays generic;
              your session data remains on localhost.
            </p>
            <div className="detail-actions">
              <button onClick={() => void connectBridge()}>Retry Bridge</button>
              <a className="link-button inline-link-button" href={BRIDGE_DOWNLOAD_URL}>
                Download Bridge
              </a>
              <a className="link-button inline-link-button" href="#/install">
                Install Bridge
              </a>
            </div>
            <pre className="doctor-block">
{`pnpm bridge:start
pnpm bridge:open
pnpm bridge:doctor`}
            </pre>
            <p className="status-line">
              {connectionState === "connecting"
                ? "Checking localhost bridge…"
                : `Bridge offline. Hosted URL: ${resolvedHostedSiteUrl}`}
            </p>
          </aside>
        </section>
      </div>
    );
  }

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
        <div className="detail-actions">
          <a className="link-button inline-link-button" href="#/install">
            Install Bridge
          </a>
          <button className="primary-button" onClick={() => void refreshIndex()}>
            Refresh Index
          </button>
        </div>
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
