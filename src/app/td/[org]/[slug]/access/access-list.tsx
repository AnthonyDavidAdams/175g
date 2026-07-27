"use client";

import { useState } from "react";

type Member = { email: string; name: string | null; role: string };

export default function AccessList({
  org,
  tournamentPath,
  currentEmail,
  members,
}: {
  org: string;
  tournamentPath: string;
  currentEmail: string;
  members: Member[];
}) {
  const [rows, setRows] = useState(members);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fetch(`/api/access/${org}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, notifyPath: tournamentPath }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return null;
    }
    return data;
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const role = String(fd.get("role") ?? "td");
    if (!email) return;
    const data = await call({ action: "add", email, role });
    if (!data) return;
    setRows((r) =>
      r.some((x) => x.email === email) ? r : [...r, { email, name: null, role }],
    );
    setNote(
      data.notified === false
        ? `${email} was added, but the notification email failed to send. Tell them directly.`
        : `${email} was added and emailed.`,
    );
    e.currentTarget.reset();
  }

  async function remove(email: string) {
    const data = await call({ action: "remove", email });
    if (!data) return;
    setRows((r) => r.filter((x) => x.email !== email));
  }

  return (
    <>
      <ul className="mt-8 divide-y divide-[var(--color-line)]">
        {rows.map((m) => (
          <li key={m.email} className="flex items-center justify-between gap-4 py-3">
            <span>
              <span className="block text-sm">
                {m.email}
                {m.email === currentEmail && (
                  <span className="mono ml-2">you</span>
                )}
              </span>
              <span className="mono mt-0.5 block">{m.role}</span>
            </span>
            <button
              onClick={() => remove(m.email)}
              disabled={busy}
              className="btn btn-ghost !py-1 !text-xs disabled:opacity-30"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="mt-8 space-y-3">
        <p className="mono">Add someone</p>
        <div className="flex flex-wrap gap-2">
          <input
            name="email"
            type="email"
            required
            placeholder="captain@school.edu"
            className="field flex-1"
          />
          <select name="role" className="field !w-auto" defaultValue="td">
            <option value="owner">owner</option>
            <option value="td">td</option>
            <option value="staff">staff</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="btn btn-primary disabled:opacity-40"
          >
            {busy ? "…" : "Add"}
          </button>
        </div>
      </form>

      {error && <p className="mt-4 text-sm text-[var(--color-alert)]">{error}</p>}
      {note && <p className="mt-4 text-sm text-[var(--color-signal)]">{note}</p>}
    </>
  );
}
