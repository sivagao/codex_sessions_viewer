import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState({}, "", "/");
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1320
  });
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("App", () => {
  it("shows onboarding when local bridge is unavailable and retries into viewer mode", async () => {
    let healthy = false;

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/bridge/health")) {
        if (!healthy) {
          return new Response(JSON.stringify({ error: "offline" }), { status: 503 });
        }

        return new Response(
          JSON.stringify({
            status: "ok",
            mode: "local-bridge",
            bridgeBaseUrl: "http://127.0.0.1:4318",
            hostedSiteUrl: "https://viewer.example.com"
          }),
          { status: 200 }
        );
      }

      if (url.includes("/api/projects")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      if (url.includes("/api/index/refresh")) {
        return new Response(JSON.stringify({ stats: { threads: 0 } }), { status: 200 });
      }

      if (url.includes("/api/threads")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      return new Response("Not found", { status: 404 });
    });

    render(<App />);

    await screen.findByText(/Local Bridge Required/i);
    healthy = true;
    fireEvent.click(screen.getByRole("button", { name: /retry bridge/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Local Bridge Required/i)).not.toBeInTheDocument();
    });
    await screen.findByText(/Recent Projects/i);
  });

  it("renders a dedicated install route with install and doctor guidance", async () => {
    window.history.replaceState({}, "", "/#/install");
    fetchMock.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          status: "ok",
          mode: "local-bridge",
          bridgeBaseUrl: "http://127.0.0.1:4318",
          hostedSiteUrl: "https://sivagao.github.io/codex_sessions_viewer/"
        }),
        { status: 200 }
      )
    );

    render(<App />);

    await screen.findByRole("heading", { level: 1, name: /install the local bridge/i });
    expect(screen.getAllByText(/install\.sh/i)).toHaveLength(2);
    expect(screen.getAllByText(/codex-sessions-viewer-doctor/i)).toHaveLength(2);
    expect(screen.getByRole("link", { name: /open viewer/i })).toHaveAttribute(
      "href",
      "#/viewer"
    );
    expect(screen.getByRole("link", { name: /download bridge/i })).toHaveAttribute(
      "href",
      "https://github.com/sivagao/codex_sessions_viewer/releases/download/bridge-latest/codex-sessions-viewer-bridge-macos.tar.gz"
    );
  });

  it("renders threads, applies filters, shows detail, and triggers refresh", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/bridge/health")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            mode: "local-bridge",
            bridgeBaseUrl: "http://127.0.0.1:4318",
            hostedSiteUrl: "https://viewer.example.com"
          }),
          { status: 200 }
        );
      }

      if (url.includes("127.0.0.1:4318/api/index/refresh")) {
        return new Response(JSON.stringify({ stats: { threads: 1, events: 2 } }), {
          status: 200
        });
      }

      if (url.includes("127.0.0.1:4318/api/threads/thread-main")) {
        return new Response(
          JSON.stringify({
            thread: {
              id: "thread-main",
              title: "Resume my thread",
              sourceKind: "cli",
              cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
              projectKey: "codex_sessions_viewer",
              projectLabel: "viewer",
              favorite: true,
              tags: ["important"],
              note: "revisit"
            },
            relations: [],
            events: [
              { text: "Resume from Terminal", actor: "user" },
              {
                text:
                  "System prompt that is intentionally very long and should stay folded until requested by the user.",
                actor: "system"
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (url.includes("127.0.0.1:4318/api/projects")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                key: "codex_sessions_viewer",
                label: "codex_sessions_viewer",
                prefix: "/Users/siva/projects/siva_context/codex_sessions_viewer",
                count: 4
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (url.includes("127.0.0.1:4318/api/threads")) {
        const query = new URL(url, "http://localhost");
        const source = query.searchParams.get("sourceKind");
        const items =
          source === "app"
            ? []
            : [
                {
                  id: "thread-main",
                  title: "Resume my thread",
                  sourceKind: "cli",
                  cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
                  projectKey: "codex_sessions_viewer",
                  projectLabel: "viewer",
                  updatedAt: "2026-03-25T02:15:29Z",
                  favorite: true,
                  hidden: false,
                  tags: ["important"],
                  note: "revisit",
                  projectAlias: "viewer",
                  hasAgents: false
                }
              ];

        const queryText = query.searchParams.get("q");
        const cwdPrefix = query.searchParams.get("cwdPrefix");
        const projectKey = query.searchParams.get("projectKey");
        const favoritesOnly = query.searchParams.get("favoritesOnly");

        const filtered = items.filter((item) => {
          if (favoritesOnly === "true" && !item.favorite) {
            return false;
          }
          if (cwdPrefix && !item.cwd.startsWith(cwdPrefix)) {
            return false;
          }
          if (projectKey && item.projectKey !== projectKey) {
            return false;
          }
          if (queryText && !`${item.title} ${item.cwd}`.includes(queryText)) {
            return false;
          }
          return true;
        });

        return new Response(JSON.stringify({ items: filtered }), { status: 200 });
      }

      if (url.includes("127.0.0.1:4318/api/threads/thread-main/resume")) {
        return new Response(
          JSON.stringify({
            launch: { command: "cd /tmp && codex resume thread-main" }
          }),
          { status: 200 }
        );
      }

      if (url.includes("127.0.0.1:4318/api/exports")) {
        return new Response(JSON.stringify({ filePath: "/tmp/export.zip" }), {
          status: 200
        });
      }

      if (init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            thread: {
              id: "thread-main",
              title: "Resume my thread",
              sourceKind: "cli",
              cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
              projectKey: "codex_sessions_viewer",
              projectLabel: "viewer",
              favorite: false,
              hidden: false,
              tags: ["important"],
              note: "updated note",
              projectAlias: "viewer",
              hasAgents: false
            }
          }),
          { status: 200 }
        );
      }

      return new Response("Not found", { status: 404 });
    });

    render(<App />);

    await screen.findByRole("link", { name: /install bridge/i });
    await screen.findByText("Resume my thread");
    await screen.findByRole("button", { name: /codex_sessions_viewer/i });

    fireEvent.click(screen.getAllByRole("button", { name: /refresh index/i }).at(-1)!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:4318/api/index/refresh",
        expect.objectContaining({ method: "POST" })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /app/i }));

    await waitFor(() => {
      expect(screen.queryByText("Resume my thread")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /all sources/i }));
    await screen.findByText("Resume my thread");

    fireEvent.click(screen.getByText("Resume my thread"));
    await screen.findByText("Resume from Terminal");
    expect(document.querySelector(".workspace")?.className).toContain("detail-focus");
    expect(document.querySelector(".results-panel")?.className).toContain("compact");
    expect(screen.getByRole("button", { name: /show list/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/System prompt that is intentionally very long/)
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show system/i }));
    await screen.findByText(/System prompt that is intentionally very long/);

    fireEvent.click(screen.getByRole("button", { name: /show list/i }));
    await screen.findByText("Resume my thread");

    fireEvent.click(screen.getByRole("button", { name: /codex_sessions_viewer/i }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes("projectKey=codex_sessions_viewer")
        )
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: /export project/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:4318/api/exports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ projectKey: "codex_sessions_viewer", contentScope: "all" })
        })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /export user prompts/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:4318/api/exports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ projectKey: "codex_sessions_viewer", contentScope: "user" })
        })
      );
    });

    fireEvent.change(screen.getByLabelText(/project path prefix/i), {
      target: { value: "/Users/siva/projects/siva_context" }
    });

    await screen.findByText("Resume my thread");

    fireEvent.click(screen.getByRole("button", { name: /star session/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:4318/api/threads/thread-main/user-metadata",
        expect.objectContaining({ method: "PATCH" })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:4318/api/threads/thread-main/resume",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("auto-refreshes the index once when the bridge connects but the initial list is empty", async () => {
    let refreshCount = 0;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/bridge/health")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            mode: "local-bridge",
            bridgeBaseUrl: "http://127.0.0.1:4318",
            hostedSiteUrl: "https://viewer.example.com"
          }),
          { status: 200 }
        );
      }

      if (url.includes("127.0.0.1:4318/api/projects")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }

      if (url.includes("127.0.0.1:4318/api/index/refresh")) {
        refreshCount += 1;
        return new Response(JSON.stringify({ stats: { threads: 1 } }), { status: 200 });
      }

      if (url.includes("127.0.0.1:4318/api/threads")) {
        if (refreshCount === 0) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }

        return new Response(
          JSON.stringify({
            items: [
              {
                id: "thread-bootstrap",
                title: "Recovered thread",
                sourceKind: "cli",
                cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
                projectKey: "codex_sessions_viewer",
                projectLabel: "codex_sessions_viewer",
                updatedAt: "2026-03-30T06:00:00Z",
                favorite: false,
                hidden: false,
                tags: [],
                note: "",
                projectAlias: "",
                hasAgents: false
              }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response("Not found", { status: 404 });
    });

    render(<App />);

    await screen.findByText(/Recovered thread/i);
    expect(refreshCount).toBe(1);
  });
});
