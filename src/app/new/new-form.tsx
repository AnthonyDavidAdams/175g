"use client";

import { useState } from "react";

export default function NewTournamentForm({
  orgs,
}: {
  orgs: { slug: string; name: string }[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useExisting, setUseExisting] = useState(orgs.length > 0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgSlug: useExisting ? String(fd.get("orgSlug") || "") || null : null,
        orgName: useExisting ? null : String(fd.get("orgName") ?? ""),
        tournamentName: String(fd.get("tournamentName") ?? ""),
        school: String(fd.get("school") ?? "") || null,
        city: String(fd.get("city") ?? "") || null,
        startDate: String(fd.get("startDate") ?? "") || null,
        endDate: String(fd.get("endDate") ?? "") || null,
        division: String(fd.get("division") ?? "") || null,
        teamTarget: Number(fd.get("teamTarget")) || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not create it.");
      setBusy(false);
      return;
    }
    window.location.href = data.url;
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-6">
      <section>
        <p className="mono">Who&apos;s running it</p>
        {orgs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setUseExisting(true)}
              className={`btn !py-1.5 !text-xs ${useExisting ? "btn-primary" : "btn-ghost"}`}
            >
              An existing program
            </button>
            <button
              type="button"
              onClick={() => setUseExisting(false)}
              className={`btn !py-1.5 !text-xs ${useExisting ? "btn-ghost" : "btn-primary"}`}
            >
              A new one
            </button>
          </div>
        )}

        {useExisting && orgs.length > 0 ? (
          <label className="mt-3 block">
            <span className="mono">Program</span>
            <select name="orgSlug" className="field mt-2" defaultValue={orgs[0].slug}>
              {orgs.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="mt-3 block">
              <span className="mono">
                Program or club name<span className="text-[var(--color-signal)]"> *</span>
              </span>
              <input
                name="orgName"
                required={!useExisting}
                placeholder="Demo University Ultimate"
                className="field mt-2"
              />
            </label>
            <p className="mono mt-2 normal-case tracking-normal">
              This is the durable thing that runs an event every year. Next year&apos;s
              edition sits under it, and inherits your contacts and vendor notes.
            </p>
          </>
        )}
      </section>

      <section>
        <p className="mono">The tournament</p>
        <label className="mt-3 block">
          <span className="mono">
            Name<span className="text-[var(--color-signal)]"> *</span>
          </span>
          <input
            name="tournamentName"
            required
            placeholder="Midwest Throwdown"
            className="field mt-2"
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mono">School</span>
            <input name="school" className="field mt-2" />
          </label>
          <label className="block">
            <span className="mono">City</span>
            <input name="city" className="field mt-2" />
          </label>
          <label className="block">
            <span className="mono">Start date</span>
            <input name="startDate" type="date" className="field mt-2" />
          </label>
          <label className="block">
            <span className="mono">End date</span>
            <input name="endDate" type="date" className="field mt-2" />
          </label>
          <label className="block">
            <span className="mono">Division</span>
            <select name="division" className="field mt-2" defaultValue="">
              <option value="">Not decided</option>
              <option value="mens">Men&apos;s</option>
              <option value="womens">Women&apos;s</option>
              <option value="mixed">Mixed</option>
              <option value="multiple">Multiple</option>
            </select>
          </label>
          <label className="block">
            <span className="mono">Teams you want</span>
            <input
              name="teamTarget"
              type="number"
              min={2}
              max={64}
              placeholder="16"
              className="field mt-2"
            />
          </label>
        </div>
        <p className="mono mt-3 normal-case tracking-normal">
          Everything except the two names can wait — leave them blank and the agent
          will work through them with you.
        </p>
      </section>

      {error && <p className="text-sm text-[var(--color-alert)]">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-40">
          {busy ? "Creating…" : "Create and open the console"}
        </button>
        <span className="mono">
          Starts unpublished — nothing is public until you say so
        </span>
      </div>
    </form>
  );
}
