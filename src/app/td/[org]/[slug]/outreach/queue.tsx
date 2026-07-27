"use client";

import { useState } from "react";

type Draft = {
  id: string;
  kind: string;
  toName: string | null;
  toEmail: string;
  subject: string;
  body: string;
  status: string;
};

export default function Queue({ drafts }: { drafts: Draft[] }) {
  const [rows, setRows] = useState(drafts);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, action: "send" | "discard") {
    setBusy(id);
    const res = await fetch(`/api/outreach/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setRows((r) =>
      r.map((x) => (x.id === id ? { ...x, status: data.status ?? x.status } : x)),
    );
    setBusy(null);
  }

  const pending = rows.filter((r) => r.status === "draft");

  if (!pending.length) {
    return (
      <p className="mt-8 text-[var(--color-dim)]">
        Nothing waiting for approval. Ask the agent to draft outreach.
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {pending.map((d) => (
        <div key={d.id} className="panel p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="mono">{d.kind}</span>
            <span className="mono">{d.toName ? `${d.toName} · ` : ""}{d.toEmail}</span>
          </div>
          <h2 className="mt-3 font-medium">{d.subject}</h2>
          <pre className="mt-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-dim)]">
            {d.body}
          </pre>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => act(d.id, "send")}
              disabled={busy === d.id}
              className="btn btn-primary !py-1.5 !text-xs disabled:opacity-40"
            >
              {busy === d.id ? "Sending…" : "Approve and send"}
            </button>
            <button
              onClick={() => act(d.id, "discard")}
              disabled={busy === d.id}
              className="btn btn-ghost !py-1.5 !text-xs disabled:opacity-40"
            >
              Discard
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
