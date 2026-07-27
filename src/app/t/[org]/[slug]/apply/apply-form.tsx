"use client";

import { useState } from "react";

export default function ApplyForm({
  org,
  slug,
  bidFee,
  applyDeadline,
}: {
  org: string;
  slug: string;
  bidFee?: number | null;
  applyDeadline?: string | null;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState("sending");

    const fd = new FormData(e.currentTarget);
    const payload = {
      teamName: String(fd.get("teamName") ?? ""),
      school: String(fd.get("school") ?? ""),
      division: String(fd.get("division") ?? ""),
      captainName: String(fd.get("captainName") ?? ""),
      captainEmail: String(fd.get("captainEmail") ?? ""),
      captainPhone: String(fd.get("captainPhone") ?? ""),
      notes: String(fd.get("notes") ?? ""),
      captainMarketingConsent: fd.get("consent") === "on",
    };

    const res = await fetch(`/api/apply/${org}/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
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
        <p className="mono text-[var(--color-signal)]">Application received</p>
        <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
          You&apos;ll hear back about your bid by the acceptance date. Watch for an
          email — payment and roster deadlines will be in it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="teamName" label="Team name" required />
        <Field name="school" label="School" />
        <Field name="division" label="Division" placeholder="mens / womens / mixed" />
        <Field name="captainName" label="Captain name" required />
        <Field
          name="captainEmail"
          label="Captain email"
          type="email"
          required
        />
        <Field name="captainPhone" label="Captain phone" type="tel" />
      </div>

      <label className="block">
        <span className="mono">Anything we should know</span>
        <textarea name="notes" rows={3} className="field mt-2" />
      </label>

      <label className="flex items-start gap-3 text-sm text-[var(--color-dim)]">
        <input type="checkbox" name="consent" className="mt-1" />
        <span>
          Email me about future tournaments I might want to play. You can
          unsubscribe at any time, and we won&apos;t use your address for anything
          else.
        </span>
      </label>

      {error && <p className="text-sm text-[var(--color-alert)]">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={state === "sending"}
          className="btn btn-primary disabled:opacity-40"
        >
          {state === "sending" ? "Submitting…" : "Submit application"}
        </button>
        <span className="mono">
          {bidFee ? `$${(bidFee / 100).toFixed(0)} per team` : ""}
          {bidFee && applyDeadline ? " · " : ""}
          {applyDeadline ? `apply by ${applyDeadline}` : ""}
        </span>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mono">
        {label}
        {required && <span className="text-[var(--color-signal)]"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="field mt-2"
      />
    </label>
  );
}
