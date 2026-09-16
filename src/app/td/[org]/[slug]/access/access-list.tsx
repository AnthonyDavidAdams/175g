"use client";

import { useState } from "react";

type Member = { email: string; name: string | null; role: string };
type Role = "owner" | "td" | "staff" | "advisor";

const LABEL: Record<string, string> = {
  owner: "owner",
  td: "tournament director",
  staff: "staff",
  advisor: "advisor",
};

export default function AccessList({
  org,
  tournamentPath,
  currentEmail,
  actorRole,
  members,
}: {
  org: string;
  tournamentPath: string;
  currentEmail: string;
  actorRole: Role;
  members: Member[];
}) {
  const [rows, setRows] = useState(members);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const canEdit = actorRole === "owner" || actorRole === "td";
  // TDs manage everyone below owner; owners manage everyone.
  const grantable: Role[] =
    actorRole === "owner"
      ? ["owner", "td", "staff", "advisor"]
      : ["td", "staff", "advisor"];
  const mayTouch = (role: string) => actorRole === "owner" || role !== "owner";

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
    const form = e.currentTarget;
    const fd = new FormData(form);
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
        ? `${email} was added as ${LABEL[role]}, but the notification email failed to send. Tell them directly.`
        : `${email} was added as ${LABEL[role]} and emailed.`,
    );
    form.reset();
  }

  async function remove(email: string) {
    const data = await call({ action: "remove", email });
    if (!data) return;
    setRows((r) => r.filter((x) => x.email !== email));
  }

  async function setRole(email: string, role: string) {
    const data = await call({ action: "set_role", email, role });
    if (!data) return;
    setRows((r) => r.map((x) => (x.email === email ? { ...x, role } : x)));
  }

  return (
    <>
      <ul className="mt-6 divide-y divide-[var(--color-line)]">
        {rows.map((m) => (
          <li key={m.email} className="flex flex-wrap items-center justify-between gap-4 py-3">
            <span>
              <span className="block text-sm">
                {m.name ? `${m.name} · ` : ""}
                {m.email}
                {m.email === currentEmail && <span className="mono ml-2">you</span>}
              </span>
              {!(canEdit && mayTouch(m.role)) && (
                <span className="mono mt-0.5 block">{LABEL[m.role] ?? m.role}</span>
              )}
            </span>
            {canEdit && mayTouch(m.role) && (
              <span className="flex items-center gap-2">
                <select
                  value={m.role}
                  disabled={busy}
                  onChange={(e) => setRole(m.email, e.target.value)}
                  className="field !w-auto !py-1 !text-xs"
                >
                  {grantable.map((r) => (
                    <option key={r} value={r}>
                      {LABEL[r]}
                    </option>
                  ))}
                  {!grantable.includes(m.role as Role) && (
                    <option value={m.role}>{LABEL[m.role] ?? m.role}</option>
                  )}
                </select>
                <button
                  onClick={() => remove(m.email)}
                  disabled={busy}
                  className="btn btn-ghost !py-1 !text-xs disabled:opacity-30"
                >
                  Remove
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
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
              {grantable.map((r) => (
                <option key={r} value={r}>
                  {LABEL[r]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary disabled:opacity-40"
            >
              {busy ? "…" : "Add"}
            </button>
          </div>
          <p className="mono normal-case tracking-normal">
            Advisors are the alumni who ran this before, a faculty sponsor, or a
            mentor from another program. They see everything and change nothing.
          </p>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-[var(--color-alert)]">{error}</p>}
      {note && <p className="mt-4 text-sm text-[var(--color-signal)]">{note}</p>}
    </>
  );
}
