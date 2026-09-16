"use client";

import { useState } from "react";

export default function SaveTemplateForm({
  org,
  slug,
  defaultName,
  canPublish,
}: {
  org: string;
  slug: string;
  defaultName: string;
  /** Owners, TDs and advisors can share beyond the program. Staff save privately. */
  canPublish: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        org,
        slug,
        name: String(fd.get("name") ?? ""),
        description: String(fd.get("description") ?? "") || null,
        includeVenue: fd.get("includeVenue") === "on",
        visibility: String(fd.get("visibility") ?? "org"),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not save the template.");
      setBusy(false);
      return;
    }
    window.location.href = data.shareUrl ?? data.url;
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <label className="block">
        <span className="mono">
          Name<span className="text-[var(--color-signal)]"> *</span>
        </span>
        <input name="name" required defaultValue={defaultName} className="field mt-2" />
      </label>
      <label className="block">
        <span className="mono">Who it&apos;s for</span>
        <textarea
          name="description"
          rows={3}
          className="field mt-2"
          placeholder="Two-day mixed college weekend on eight grass fields. Assumes a parks-department venue and a sanctioned event. The refund policy has been through one weather cancellation."
        />
      </label>

      <label className="flex items-start gap-3">
        <input name="includeVenue" type="checkbox" className="mt-1" />
        <span>
          <span className="block text-sm">Include the venue and field layout</span>
          <span className="mono block normal-case tracking-normal">
            Yes for next year at the same fields. No if you&apos;re sharing with
            another program — their fields are elsewhere.
          </span>
        </span>
      </label>

      <fieldset>
        <legend className="mono">Who can use it</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Radio value="org" label="Program only" blurb="Members of this program." defaultChecked />
          <Radio
            value="link"
            label="Anyone with the link"
            blurb="Hand the link to another TD."
            disabled={!canPublish}
          />
          <Radio
            value="public"
            label="Public gallery"
            blurb="Any program on 175g can start from it."
            disabled={!canPublish}
          />
        </div>
      </fieldset>

      {error && <p className="text-sm text-[var(--color-alert)]">{error}</p>}

      <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-40">
        {busy ? "Saving…" : "Save template"}
      </button>
    </form>
  );
}

function Radio({
  value,
  label,
  blurb,
  defaultChecked,
  disabled,
}: {
  value: string;
  label: string;
  blurb: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={`panel flex cursor-pointer gap-3 p-3 ${disabled ? "opacity-40" : "panel-hover"}`}>
      <input
        type="radio"
        name="visibility"
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-1"
      />
      <span>
        <span className="block text-sm">{label}</span>
        <span className="mono block normal-case tracking-normal">{blurb}</span>
      </span>
    </label>
  );
}
