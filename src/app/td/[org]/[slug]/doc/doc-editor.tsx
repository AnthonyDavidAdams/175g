"use client";

import { useState } from "react";

type Report = {
  ok: boolean;
  applied: boolean;
  errors: string[];
  warnings: string[];
  changes: string[];
  destructive: string[];
};

export default function DocEditor({
  org,
  slug,
  initial,
}: {
  org: string;
  slug: string;
  initial: string;
}) {
  const [text, setText] = useState(initial);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(dryRun: boolean, allowDestructive = false) {
    setError(null);
    setBusy(true);
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      setBusy(false);
      setError(`Not valid JSON: ${e instanceof Error ? e.message : "parse failed"}`);
      return;
    }
    const res = await fetch(`/api/doc/${org}/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doc, dryRun, allowDestructive }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!data) {
      setError("No response from the server.");
      return;
    }
    setReport(data as Report);
    if ((data as Report).applied) window.location.reload();
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => send(true)}
          disabled={busy}
          className="btn btn-ghost disabled:opacity-40"
        >
          {busy ? "…" : "Check changes"}
        </button>
        <button
          onClick={() => send(false)}
          disabled={busy || !report?.ok}
          title={report?.ok ? "" : "Check changes first"}
          className="btn btn-primary disabled:opacity-30"
        >
          Apply
        </button>
        <a
          href={`/api/doc/${org}/${slug}`}
          download={`${slug}.175g.json`}
          className="btn btn-ghost"
        >
          Download
        </a>
        <a
          href={`/api/doc/${org}/${slug}?contacts=include`}
          download={`${slug}.backup.175g.json`}
          title="Includes captain emails and phone numbers — treat as personal data"
          className="btn btn-ghost"
        >
          Download with contacts
        </a>
        <button
          onClick={() => {
            setText(initial);
            setReport(null);
            setError(null);
          }}
          className="btn btn-ghost"
        >
          Reset
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-[var(--color-alert)]">{error}</p>}

      {report && (
        <div
          className={`panel mt-4 p-5 ${
            report.destructive.length
              ? "border-[var(--color-alert)]/50"
              : report.ok
                ? "border-[var(--color-signal)]/40"
                : "border-[var(--color-warn)]/50"
          }`}
        >
          <p className="mono">
            {report.applied
              ? "Applied"
              : report.ok
                ? "Dry run — nothing changed yet"
                : "Not applied"}
          </p>

          {report.destructive.length > 0 && (
            <>
              <p className="mono mt-4 text-[var(--color-alert)]">Destructive</p>
              <ul className="mt-2 space-y-1 text-sm">
                {report.destructive.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <button
                onClick={() => send(false, true)}
                disabled={busy}
                className="btn btn-ghost mt-3 !py-1.5 !text-xs"
              >
                I mean it — apply anyway
              </button>
            </>
          )}

          {report.errors.length > 0 && (
            <>
              <p className="mono mt-4 text-[var(--color-warn)]">Errors</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-dim)]">
                {report.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          )}

          {report.warnings.length > 0 && (
            <>
              <p className="mono mt-4">Warnings</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-dim)]">
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}

          {report.changes.length > 0 ? (
            <>
              <p className="mono mt-4">Changes</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-dim)]">
                {report.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : (
            report.ok && (
              <p className="mt-3 text-sm text-[var(--color-dim)]">
                No differences from the current state.
              </p>
            )
          )}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setReport(null);
        }}
        spellCheck={false}
        rows={34}
        className="field mt-4 font-mono !text-xs leading-relaxed"
      />
    </>
  );
}
