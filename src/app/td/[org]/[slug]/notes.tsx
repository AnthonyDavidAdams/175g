"use client";

import { useState } from "react";

export type Note = {
  id: string;
  body: string;
  author: string;
  role: string;
  createdAt: number;
  resolvedAt: number | null;
};

/**
 * Notes between the people around a tournament. Advisors, who can change
 * nothing, use this to be heard; the TD resolves them. Staff use it from the
 * field. Open notes also reach the agent through get_status.
 */
export default function Notes({
  org,
  slug,
  initial,
  canResolve,
  meLabel,
  compose,
}: {
  org: string;
  slug: string;
  initial: Note[];
  /** Organisers can resolve any note; everyone can resolve their own. */
  canResolve: boolean;
  meLabel: string;
  /** Show the composer prominently (advisors) or tucked away (TDs). */
  compose: "prominent" | "quiet";
}) {
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(compose === "prominent");
  const [showResolved, setShowResolved] = useState(false);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/notes/${org}/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return null;
    }
    return data;
  }

  async function add() {
    if (!text.trim()) return;
    const data = await call({ action: "add", body: text.trim() });
    if (!data) return;
    setNotes((n) => [data.note as Note, ...n]);
    setText("");
    if (compose === "quiet") setShowComposer(false);
  }

  async function resolve(id: string, reopen = false) {
    const data = await call({ action: reopen ? "reopen" : "resolve", id });
    if (!data) return;
    setNotes((n) =>
      n.map((x) =>
        x.id === id
          ? { ...x, resolvedAt: reopen ? null : Math.floor(Date.now() / 1000) }
          : x,
      ),
    );
  }

  const open = notes.filter((n) => !n.resolvedAt);
  const resolved = notes.filter((n) => n.resolvedAt);

  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="mono">
          Notes{open.length > 0 && ` · ${open.length} open`}
        </p>
        {compose === "quiet" && !showComposer && (
          <button
            onClick={() => setShowComposer(true)}
            className="mono hover:text-[var(--color-signal)]"
          >
            Add
          </button>
        )}
      </div>

      {showComposer && (
        <div className="mt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={
              compose === "prominent"
                ? "Something the TD should see. Specific beats general."
                : "A note for the team"
            }
            className="field !text-sm"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={add}
              disabled={busy || !text.trim()}
              className="btn btn-primary !py-1.5 !text-xs disabled:opacity-40"
            >
              Leave note
            </button>
            {compose === "quiet" && (
              <button
                onClick={() => setShowComposer(false)}
                className="mono hover:text-[var(--color-signal)]"
              >
                Cancel
              </button>
            )}
            <span className="mono">as {meLabel}</span>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-[var(--color-alert)]">{error}</p>}

      {open.length === 0 && !showComposer && (
        <p className="mt-3 text-sm text-[var(--color-dim)]">Nothing open.</p>
      )}

      <ul className="mt-3 space-y-3">
        {open.map((n) => (
          <li key={n.id} className="text-sm">
            <p className="leading-relaxed">{n.body}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="mono">
                {n.author} · {n.role} · {new Date(n.createdAt * 1000).toLocaleDateString()}
              </span>
              {(canResolve || n.author === meLabel) && (
                <button
                  onClick={() => resolve(n.id)}
                  disabled={busy}
                  className="mono hover:text-[var(--color-signal)]"
                >
                  Resolve
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {resolved.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="mono hover:text-[var(--color-signal)]"
          >
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved
          </button>
          {showResolved && (
            <ul className="mt-2 space-y-2 opacity-60">
              {resolved.map((n) => (
                <li key={n.id} className="text-sm">
                  <p className="line-through">{n.body}</p>
                  <div className="mt-1 flex gap-2">
                    <span className="mono">{n.author}</span>
                    {canResolve && (
                      <button
                        onClick={() => resolve(n.id, true)}
                        className="mono hover:text-[var(--color-signal)]"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
