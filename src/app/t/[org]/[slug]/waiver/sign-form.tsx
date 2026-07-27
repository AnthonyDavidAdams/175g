"use client";

import { useState } from "react";

type Waiver = {
  id: string;
  title: string;
  body: string;
  audience: string;
  required: boolean;
};

export default function SignForm({
  org,
  slug,
  waivers,
  teams,
}: {
  org: string;
  slug: string;
  waivers: Waiver[];
  teams: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState(waivers[0]?.id ?? "");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const waiver = waivers.find((w) => w.id === selected);
  const isMinor = waiver?.audience === "minor";
  const isTeam = waiver?.audience === "team";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!waiver) return;
    setError(null);
    setState("sending");
    const fd = new FormData(e.currentTarget);

    const res = await fetch(`/api/waivers/${org}/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "sign",
        waiverId: waiver.id,
        signedName: fd.get("signedName"),
        signedEmail: fd.get("signedEmail"),
        guardianName: fd.get("guardianName") || undefined,
        dateOfBirth: fd.get("dateOfBirth") || undefined,
        teamId: fd.get("teamId") || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setState("idle");
      return;
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <div className="panel mt-8 p-6">
        <p className="mono text-[var(--color-signal)]">Signed</p>
        <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
          Recorded. Your captain will see it on the roster. If you also need to sign
          another waiver on this page, reload and pick it.
        </p>
      </div>
    );
  }

  return (
    <>
      {waivers.length > 1 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {waivers.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelected(w.id)}
              className={`btn !py-1.5 !text-xs ${
                w.id === selected ? "btn-primary" : "btn-ghost"
              }`}
            >
              {w.title}
            </button>
          ))}
        </div>
      )}

      {waiver && (
        <>
          <div className="panel scroll-y mt-6 max-h-96 overflow-y-auto p-5">
            <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-dim)]">
              {waiver.body}
            </pre>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {isMinor && (
              <label className="block">
                <span className="mono">
                  Parent or guardian full name
                  <span className="text-[var(--color-signal)]"> *</span>
                </span>
                <input name="guardianName" required className="field mt-2" />
              </label>
            )}

            <label className="block">
              <span className="mono">
                {isMinor
                  ? "Participant full name"
                  : isTeam
                    ? "Your full name (captain)"
                    : "Your full name"}
                <span className="text-[var(--color-signal)]"> *</span>
              </span>
              <input name="signedName" required className="field mt-2" />
            </label>

            <label className="block">
              <span className="mono">
                Email<span className="text-[var(--color-signal)]"> *</span>
              </span>
              <input name="signedEmail" type="email" required className="field mt-2" />
            </label>

            {isMinor && (
              <label className="block">
                <span className="mono">Participant date of birth</span>
                <input name="dateOfBirth" type="date" className="field mt-2" />
              </label>
            )}

            {teams.length > 0 && (
              <label className="block">
                <span className="mono">Team</span>
                <select name="teamId" className="field mt-2" defaultValue="">
                  <option value="">Not listed / unattached</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <p className="text-sm leading-relaxed text-[var(--color-faint)]">
              Typing your name is your electronic signature. We record the date, your
              IP address, and a copy of the exact text above.
            </p>

            {error && <p className="text-sm text-[var(--color-alert)]">{error}</p>}

            <button
              type="submit"
              disabled={state === "sending"}
              className="btn btn-primary disabled:opacity-40"
            >
              {state === "sending" ? "Signing…" : "Sign"}
            </button>
          </form>
        </>
      )}
    </>
  );
}
