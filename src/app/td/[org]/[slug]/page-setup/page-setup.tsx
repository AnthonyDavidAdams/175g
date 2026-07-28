"use client";

import { useRef, useState } from "react";

type Photo = { id: string; kind: string; caption: string; url: string };
type Option = { method: string; handle?: string | null; note?: string | null };

export default function PageSetup({
  org,
  slug,
  directions: initialDirections,
  venueLat,
  venueLng,
  paymentNote: initialNote,
  paymentOptions,
  methods,
  photos: initialPhotos,
}: {
  org: string;
  slug: string;
  directions: string;
  venueLat: number | null;
  venueLng: number | null;
  paymentNote: string;
  paymentOptions: Option[];
  methods: { key: string; label: string; handlePrompt: string }[];
  photos: Photo[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [directions, setDirections] = useState(initialDirections);
  const [lat, setLat] = useState(venueLat?.toString() ?? "");
  const [lng, setLng] = useState(venueLng?.toString() ?? "");
  const [note, setNote] = useState(initialNote);
  const [options, setOptions] = useState<Option[]>(paymentOptions);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File, kind: string) {
    setBusy(true);
    setStatus(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    const res = await fetch(`/api/media/${org}/${slug}`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(data.error ?? "Upload failed.");
      return;
    }
    setPhotos((p) => [
      ...(kind === "hero" ? p.map((x) => ({ ...x, kind: "gallery" })) : p),
      { id: data.id, kind, caption: "", url: data.url },
    ]);
  }

  async function removePhoto(id: string) {
    setBusy(true);
    await fetch(`/api/media/${org}/${slug}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPhotos((p) => p.filter((x) => x.id !== id));
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    const res = await fetch(`/api/page-setup/${org}/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        directions,
        venueLat: lat ? Number(lat) : null,
        venueLng: lng ? Number(lng) : null,
        paymentNote: note,
        paymentOptions: options.filter((o) => o.method),
        captions: Object.fromEntries(photos.map((p) => [p.id, p.caption])),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setStatus(res.ok ? "Saved." : (data.error ?? "Could not save."));
  }

  async function regenerate() {
    setBusy(true);
    setStatus(null);
    const res = await fetch(`/api/page-setup/${org}/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "regenerate_directions",
        venueLat: lat ? Number(lat) : null,
        venueLng: lng ? Number(lng) : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(data.error ?? "Could not generate.");
      return;
    }
    setDirections(data.directions);
    setStatus("Generated — edit it, then save. Nothing is saved until you do.");
  }

  return (
    <div className="mt-8 space-y-12">
      {/* ---------------- Photos ---------------- */}
      <section>
        <p className="mono">Photos</p>
        <p className="mt-2 text-sm text-[var(--color-dim)]">
          The hero photo shows at the top of the public page and in link previews.
          Pictures of the actual fields help travelling teams more than a logo does.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {photos.map((p) => (
            <div key={p.id} className="panel overflow-hidden">
              <img
                src={p.url}
                alt={p.caption || "Tournament photo"}
                className="h-40 w-full object-cover"
              />
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="mono">{p.kind}</span>
                  <button
                    onClick={() => removePhoto(p.id)}
                    disabled={busy}
                    className="mono hover:text-[var(--color-alert)]"
                  >
                    Remove
                  </button>
                </div>
                <input
                  value={p.caption}
                  placeholder="Caption"
                  onChange={(e) =>
                    setPhotos((all) =>
                      all.map((x) =>
                        x.id === p.id ? { ...x, caption: e.target.value } : x,
                      ),
                    )
                  }
                  className="field !py-1 !text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f, photos.some((p) => p.kind === "hero") ? "gallery" : "hero");
            e.target.value = "";
          }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="btn btn-ghost disabled:opacity-40"
          >
            Add photo
          </button>
          <span className="mono self-center normal-case tracking-normal">
            JPEG, PNG, WebP or AVIF · 8MB max · first one becomes the hero
          </span>
        </div>
      </section>

      {/* ---------------- Directions ---------------- */}
      <section>
        <p className="mono">Directions and notes</p>
        <p className="mt-2 text-sm text-[var(--color-dim)]">
          Generate a draft from your venue and site map, then add the local
          knowledge no database has — which gate is unlocked, which lot floods.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="block">
            <span className="mono">Venue latitude</span>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="38.999123"
              className="field mt-1 !w-40 !py-1.5"
            />
          </label>
          <label className="block">
            <span className="mono">Venue longitude</span>
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="-94.522456"
              className="field mt-1 !w-40 !py-1.5"
            />
          </label>
          <button
            onClick={regenerate}
            disabled={busy}
            className="btn btn-ghost self-end disabled:opacity-40"
          >
            Generate draft
          </button>
        </div>

        <textarea
          value={directions}
          onChange={(e) => setDirections(e.target.value)}
          rows={16}
          placeholder="Generate a draft, or write your own."
          className="field mt-3 font-mono !text-xs leading-relaxed"
        />
      </section>

      {/* ---------------- Payment ---------------- */}
      <section>
        <p className="mono">How teams pay</p>
        <p className="mt-2 text-sm text-[var(--color-dim)]">
          175g doesn&apos;t process payments. Give teams the instructions you
          already use, and mark them paid when it lands.
        </p>

        <div className="mt-4 space-y-2">
          {options.map((o, i) => {
            const meta = methods.find((m) => m.key === o.method);
            return (
              <div key={i} className="panel flex flex-wrap items-end gap-2 p-3">
                <label className="block">
                  <span className="mono">Method</span>
                  <select
                    value={o.method}
                    onChange={(e) =>
                      setOptions((all) =>
                        all.map((x, j) =>
                          j === i ? { ...x, method: e.target.value } : x,
                        ),
                      )
                    }
                    className="field mt-1 !w-36 !py-1.5"
                  >
                    {methods.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block flex-1">
                  <span className="mono">{meta?.handlePrompt ?? "Details"}</span>
                  <input
                    value={o.handle ?? ""}
                    onChange={(e) =>
                      setOptions((all) =>
                        all.map((x, j) =>
                          j === i ? { ...x, handle: e.target.value } : x,
                        ),
                      )
                    }
                    className="field mt-1 !py-1.5"
                  />
                </label>
                <button
                  onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}
                  className="btn btn-ghost !py-1.5 !text-xs"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setOptions((all) => [...all, { method: "venmo", handle: "" }])}
          className="btn btn-ghost mt-3 !py-1.5 !text-xs"
        >
          Add a payment method
        </button>

        <label className="mt-4 block">
          <span className="mono">Note for teams</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Put your team name in the payment reference, or we won't know who it's from."
            className="field mt-2"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy} className="btn btn-primary disabled:opacity-40">
          {busy ? "Saving…" : "Save"}
        </button>
        {status && <span className="mono normal-case tracking-normal">{status}</span>}
      </div>
    </div>
  );
}
