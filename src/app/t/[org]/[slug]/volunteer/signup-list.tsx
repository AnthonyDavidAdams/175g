"use client";

import { useState } from "react";

type Shift = {
  id: string;
  day: string | null;
  role: string;
  startTime: string | null;
  endTime: string | null;
  taken: boolean;
};

export default function SignupList({
  org,
  slug,
  shifts,
}: {
  org: string;
  slug: string;
  shifts: Shift[];
}) {
  const [rows, setRows] = useState(shifts);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>, shiftId: string) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/volunteer/${org}/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shiftId,
        name: fd.get("name"),
        email: fd.get("email"),
        phone: fd.get("phone"),
        marketingConsent: fd.get("consent") === "on",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setRows((r) => r.map((s) => (s.id === shiftId ? { ...s, taken: true } : s)));
    setOpen(null);
  }

  const byDay = new Map<string, Shift[]>();
  for (const s of rows) {
    const k = s.day ?? "Event";
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  return (
    <div className="mt-10 space-y-8">
      {[...byDay.entries()].map(([day, dayShifts]) => (
        <section key={day}>
          <p className="mono">
            {day} · {dayShifts.filter((s) => !s.taken).length} open
          </p>
          <div className="mt-3 space-y-2">
            {dayShifts.map((s) => (
              <div key={s.id} className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm">{s.role}</span>
                    <span className="mono mt-1 block">
                      {[s.startTime, s.endTime].filter(Boolean).join("–")}
                    </span>
                  </span>
                  {s.taken ? (
                    <span className="mono">Filled</span>
                  ) : (
                    <button
                      onClick={() => setOpen(open === s.id ? null : s.id)}
                      className="btn btn-ghost !py-1.5 !text-xs"
                    >
                      {open === s.id ? "Cancel" : "Take this shift"}
                    </button>
                  )}
                </div>

                {open === s.id && (
                  <form onSubmit={(e) => submit(e, s.id)} className="mt-4 space-y-3">
                    <input name="name" required placeholder="Your name" className="field" />
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="Email"
                      className="field"
                    />
                    <input name="phone" type="tel" placeholder="Phone" className="field" />
                    <label className="flex items-start gap-2 text-xs text-[var(--color-dim)]">
                      <input type="checkbox" name="consent" className="mt-0.5" />
                      <span>
                        Email me about future tournaments. Unsubscribe any time.
                      </span>
                    </label>
                    {error && (
                      <p className="text-sm text-[var(--color-alert)]">{error}</p>
                    )}
                    <button
                      type="submit"
                      disabled={busy}
                      className="btn btn-primary !py-1.5 !text-xs disabled:opacity-40"
                    >
                      {busy ? "Signing up…" : "Confirm"}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
