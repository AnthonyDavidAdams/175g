"use client";

import { useState } from "react";

type Visibility = "org" | "link" | "public";

const VIS: { value: Visibility; label: string; blurb: string }[] = [
  { value: "org", label: "Program only", blurb: "Members of the program that made it." },
  { value: "link", label: "Anyone with the link", blurb: "Share the link with another program's TD or an advisor." },
  { value: "public", label: "Public gallery", blurb: "Listed for any program on 175g to start from." },
];

export default function TemplateActions({
  id,
  name: initialName,
  description: initialDescription,
  visibility: initialVisibility,
  shareToken,
  canManage,
  startHref,
  signedIn,
}: {
  id: string;
  name: string;
  description: string;
  visibility: Visibility;
  shareToken: string;
  canManage: boolean;
  startHref: string;
  signedIn: boolean;
}) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [token, setToken] = useState(shareToken);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl =
    visibility === "link"
      ? `${origin}/templates/${id}?token=${token}`
      : `${origin}/templates/${id}`;

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fetch(`/api/templates/${id}`, {
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

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNote("Link copied.");
    } catch {
      setNote(shareUrl);
    }
  }

  return (
    <div className="panel p-5">
      <p className="mono">Share</p>
      <p className="mt-2 text-sm text-[var(--color-dim)]">
        {visibility === "org"
          ? "Only members of the program can open this template."
          : visibility === "link"
            ? "Anyone with the link below can open it and start a tournament from it."
            : "Listed in the public gallery."}
      </p>

      {visibility !== "org" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="field flex-1 truncate !py-1.5 font-mono !text-xs">{shareUrl}</code>
          <button onClick={copy} className="btn btn-ghost !py-1.5 !text-xs">
            Copy link
          </button>
          {canManage && visibility === "link" && (
            <button
              onClick={async () => {
                const data = await call({ action: "rotate_link" });
                if (data?.shareUrl) {
                  setToken(String(data.shareUrl).split("token=")[1] ?? token);
                  setNote("New link made. The old one no longer works.");
                }
              }}
              disabled={busy}
              className="mono hover:text-[var(--color-signal)]"
            >
              New link
            </button>
          )}
        </div>
      )}

      {canManage && (
        <>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {VIS.map((v) => (
              <button
                key={v.value}
                onClick={async () => {
                  const data = await call({ action: "update", visibility: v.value });
                  if (data) setVisibility(v.value);
                }}
                disabled={busy}
                className={`panel panel-hover p-3 text-left ${
                  visibility === v.value ? "border-[var(--color-signal)]/60" : ""
                }`}
              >
                <span className="block text-sm">{v.label}</span>
                <span className="mono mt-1 block normal-case tracking-normal">{v.blurb}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => setEditing(!editing)}
              className="btn btn-ghost !py-1.5 !text-xs"
            >
              {editing ? "Close" : "Rename or describe"}
            </button>
            <button
              onClick={async () => {
                if (!window.confirm("Delete this template? Tournaments already started from it are unaffected.")) return;
                const data = await call({ action: "delete" });
                if (data) window.location.href = "/templates";
              }}
              disabled={busy}
              className="btn btn-ghost !py-1.5 !text-xs"
            >
              Delete
            </button>
          </div>

          {editing && (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mono">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="field mt-2" />
              </label>
              <label className="block">
                <span className="mono">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="field mt-2"
                  placeholder="Who this is for and what it assumes."
                />
              </label>
              <button
                onClick={async () => {
                  const data = await call({ action: "update", name, description });
                  if (data) {
                    setNote("Saved.");
                    setEditing(false);
                    window.location.reload();
                  }
                }}
                disabled={busy || name.trim().length < 2}
                className="btn btn-primary !py-1.5 !text-xs disabled:opacity-40"
              >
                Save
              </button>
            </div>
          )}
        </>
      )}

      {!signedIn && (
        <p className="mt-4 text-sm text-[var(--color-dim)]">
          <a href={`/login?next=${encodeURIComponent(startHref)}`} className="underline hover:text-[var(--color-signal)]">
            Sign in
          </a>{" "}
          to start a tournament from this template.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-[var(--color-alert)]">{error}</p>}
      {note && <p className="mt-4 break-all text-sm text-[var(--color-signal)]">{note}</p>}
    </div>
  );
}
