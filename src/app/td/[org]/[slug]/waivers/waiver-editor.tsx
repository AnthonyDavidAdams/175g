"use client";

import { useState } from "react";

type Waiver = {
  id: string;
  title: string;
  body: string;
  audience: string;
  version: number;
  required: boolean;
  signatureCount: number;
};

export default function WaiverEditor({
  org,
  slug,
  templates,
  waivers,
}: {
  org: string;
  slug: string;
  templates: { key: string; title: string; description: string }[];
  waivers: Waiver[];
}) {
  const [rows, setRows] = useState(waivers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/waivers/${org}/${slug}`, {
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

  const used = new Set(rows.map((r) => r.title));
  const available = templates.filter((t) => !used.has(t.title));

  return (
    <>
      {error && <p className="mt-6 text-sm text-[var(--color-alert)]">{error}</p>}

      <div className="mt-8 space-y-4">
        {rows.map((w) => (
          <WaiverCard
            key={w.id}
            waiver={w}
            busy={busy}
            onSave={async (title, body) => {
              const d = await call({ action: "update", id: w.id, title, body });
              if (d)
                setRows((r) =>
                  r.map((x) =>
                    x.id === w.id ? { ...x, title, body, version: d.version } : x,
                  ),
                );
            }}
            onDelete={async () => {
              const d = await call({ action: "delete", id: w.id });
              if (d) setRows((r) => r.filter((x) => x.id !== w.id));
            }}
          />
        ))}
      </div>

      {available.length > 0 && (
        <section className="mt-10">
          <p className="mono">Add from a template</p>
          <div className="mt-3 space-y-2">
            {available.map((t) => (
              <div
                key={t.key}
                className="panel flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <span>
                  <span className="block text-sm">{t.title}</span>
                  <span className="mono mt-1 block normal-case tracking-normal">
                    {t.description}
                  </span>
                </span>
                <button
                  disabled={busy}
                  onClick={async () => {
                    const d = await call({
                      action: "create_from_template",
                      templateKey: t.key,
                    });
                    if (d) window.location.reload();
                  }}
                  className="btn btn-ghost !py-1.5 !text-xs disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function WaiverCard({
  waiver,
  busy,
  onSave,
  onDelete,
}: {
  waiver: Waiver;
  busy: boolean;
  onSave: (title: string, body: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(waiver.title);
  const [body, setBody] = useState(waiver.body);
  const dirty = title !== waiver.title || body !== waiver.body;

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span>
          <span className="block font-medium">{waiver.title}</span>
          <span className="mono mt-1 block">
            {waiver.audience} · v{waiver.version} ·{" "}
            {waiver.signatureCount} signed
          </span>
        </span>
        <button
          onClick={() => setOpen(!open)}
          className="btn btn-ghost !py-1 !text-xs"
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            className="field font-mono !text-xs leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={busy || !dirty}
              onClick={() => onSave(title, body)}
              className="btn btn-primary !py-1.5 !text-xs disabled:opacity-30"
            >
              {dirty ? "Save (bumps version)" : "Saved"}
            </button>
            <button
              disabled={busy}
              onClick={onDelete}
              className="btn btn-ghost !py-1.5 !text-xs disabled:opacity-30"
            >
              Delete
            </button>
            {waiver.signatureCount > 0 && (
              <span className="mono normal-case tracking-normal">
                Editing won&apos;t change what the {waiver.signatureCount} existing
                signature{waiver.signatureCount === 1 ? "" : "s"} agreed to
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
