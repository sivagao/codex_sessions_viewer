import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1320
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("App", () => {
  it("renders threads, applies filters, shows detail, and triggers refresh", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/index/refresh")) {
        return new Response(JSON.stringify({ stats: { threads: 1, events: 2 } }), {
          status: 200
        });
      }

      if (url.includes("/api/threads/thread-main")) {
        return new Response(
          JSON.stringify({
            thread: {
              id: "thread-main",
              title: "Resume my thread",
              sourceKind: "cli",
              cwd: "/Users/siva/projects/siva_context/codex_sessions_viewer",
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

      if (url.includes("/api/projects")) {
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

      if (url.includes("/api/threads")) {
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
        const favoritesOnly = query.searchParams.get("favoritesOnly");

        const filtered = items.filter((item) => {
          if (favoritesOnly === "true" && !item.favorite) {
            return false;
          }
          if (cwdPrefix && !item.cwd.startsWith(cwdPrefix)) {
            return false;
          }
          if (queryText && !`${item.title} ${item.cwd}`.includes(queryText)) {
            return false;
          }
          return true;
        });

        return new Response(JSON.stringify({ items: filtered }), { status: 200 });
      }

      if (url.includes("/api/threads/thread-main/resume")) {
        return new Response(
          JSON.stringify({
            launch: { command: "cd /tmp && codex resume thread-main" }
          }),
          { status: 200 }
        );
      }

      if (url.includes("/api/exports")) {
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

    await screen.findByText("Resume my thread");
    await screen.findByRole("button", { name: /codex_sessions_viewer/i });

    fireEvent.click(screen.getByRole("button", { name: /refresh index/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/index/refresh",
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
          String(url).includes(
            "cwdPrefix=%2FUsers%2Fsiva%2Fprojects%2Fsiva_context%2Fcodex_sessions_viewer"
          )
        )
      ).toBe(true);
    });

    fireEvent.change(screen.getByLabelText(/project path prefix/i), {
      target: { value: "/Users/siva/projects/siva_context" }
    });

    await screen.findByText("Resume my thread");

    fireEvent.click(screen.getByRole("button", { name: /star session/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/threads/thread-main/user-metadata",
        expect.objectContaining({ method: "PATCH" })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/threads/thread-main/resume",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
