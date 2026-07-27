"use client";

import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import {
  PRESETS,
  fieldShape,
  presetByKey,
  spacingWarnings,
} from "@/lib/fieldGeometry";

/**
 * Field placement on a real satellite image, at true scale.
 *
 * Fields are stored as centre + bearing + dimensions, so a field is always
 * exactly regulation size no matter how it is dragged or rotated — the map
 * matches what actually gets lined on the grass.
 */

type FieldRow = {
  id?: string;
  name: string;
  preset: string;
  centerLat: number;
  centerLng: number;
  bearing: number;
  lengthM: number;
  widthM: number;
  endzoneM: number;
  showcase?: boolean;
};

type PointRow = {
  id?: string;
  kind: string;
  label: string;
  lat: number;
  lng: number;
};

const POINT_KINDS = [
  "water",
  "trainer",
  "hq",
  "parking",
  "toilets",
  "trash",
  "food",
  "other",
];

export default function FieldMap({
  org,
  slug,
  initialFields,
  initialPoints,
  centerLat,
  centerLng,
}: {
  org: string;
  slug: string;
  initialFields: FieldRow[];
  initialPoints: PointRow[];
  centerLat: number;
  centerLng: number;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const leafletRef = useRef<typeof L | null>(null);

  const [fields, setFields] = useState<FieldRow[]>(initialFields);
  const [points, setPoints] = useState<PointRow[]>(initialPoints);
  const [selected, setSelected] = useState<number | null>(
    initialFields.length ? 0 : null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Leaflet touches `window`, so it can only load in the browser.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !mapEl.current || mapRef.current) return;
      leafletRef.current = leaflet;

      const map = leaflet.map(mapEl.current, {
        center: [centerLat, centerLng],
        zoom: 18,
        maxZoom: 22,
      });

      // Esri World Imagery: satellite detail without an API key, which matters
      // for a product other schools self-host.
      leaflet
        .tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 22,
            maxNativeZoom: 19,
            attribution: "Imagery: Esri, Maxar, Earthstar Geographics",
          },
        )
        .addTo(map);

      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      setStatus("Click the map to place a field.");

      map.on("click", (e: L.LeafletMouseEvent) => {
        setFields((prev) => {
          const preset = presetByKey("usau");
          const next = [
            ...prev,
            {
              name: `Field ${prev.length + 1}`,
              preset: preset.key,
              centerLat: e.latlng.lat,
              centerLng: e.latlng.lng,
              bearing: 0,
              lengthM: preset.lengthM,
              widthM: preset.widthM,
              endzoneM: preset.endzoneM,
            },
          ];
          setSelected(next.length - 1);
          return next;
        });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [centerLat, centerLng]);

  // Redraw whenever the layout changes.
  useEffect(() => {
    const leaflet = leafletRef.current;
    const layer = layerRef.current;
    if (!leaflet || !layer) return;
    layer.clearLayers();

    fields.forEach((f, i) => {
      const shape = fieldShape(f);
      const active = i === selected;

      leaflet
        .polygon(shape.outline, {
          color: active ? "#d4fe4f" : "#ffffff",
          weight: active ? 3 : 2,
          opacity: active ? 1 : 0.75,
          fillColor: active ? "#d4fe4f" : "#ffffff",
          fillOpacity: active ? 0.16 : 0.07,
        })
        .on("click", (e: L.LeafletMouseEvent) => {
          leaflet.DomEvent.stop(e);
          setSelected(i);
        })
        .addTo(layer);

      for (const line of shape.endzoneLines) {
        leaflet
          .polyline(line, {
            color: active ? "#d4fe4f" : "#ffffff",
            weight: 1.5,
            opacity: 0.8,
            dashArray: "5 5",
          })
          .addTo(layer);
      }

      leaflet
        .marker(shape.center, {
          draggable: true,
          icon: leaflet.divIcon({
            className: "",
            html: `<div style="
              transform:translate(-50%,-50%);
              font:600 12px ui-monospace,monospace;
              color:#0a0c05;background:${active ? "#d4fe4f" : "#ffffffcc"};
              padding:2px 7px;border-radius:4px;white-space:nowrap;
            ">${f.name}</div>`,
          }),
        })
        .on("dragstart", () => setSelected(i))
        .on("drag", (e: L.LeafletEvent) => {
          const ll = (e.target as L.Marker).getLatLng();
          setFields((prev) =>
            prev.map((x, j) =>
              j === i ? { ...x, centerLat: ll.lat, centerLng: ll.lng } : x,
            ),
          );
        })
        .addTo(layer);
    });

    points.forEach((p, i) => {
      leaflet
        .marker([p.lat, p.lng], {
          draggable: true,
          icon: leaflet.divIcon({
            className: "",
            html: `<div style="
              transform:translate(-50%,-50%);
              font:500 11px ui-monospace,monospace;
              color:#08090b;background:#ffb020;
              padding:2px 6px;border-radius:4px;white-space:nowrap;
            ">${p.label}</div>`,
          }),
        })
        .on("drag", (e: L.LeafletEvent) => {
          const ll = (e.target as L.Marker).getLatLng();
          setPoints((prev) =>
            prev.map((x, j) => (j === i ? { ...x, lat: ll.lat, lng: ll.lng } : x)),
          );
        })
        .addTo(layer);
    });
  }, [fields, points, selected]);

  function patch(i: number, p: Partial<FieldRow>) {
    setFields((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    const res = await fetch(`/api/fields/${org}/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", fields, points }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    setStatus(res.ok ? `Saved ${data.fields} fields.` : (data.error ?? "Save failed."));
  }

  const warnings = spacingWarnings(fields);
  const active = selected !== null ? fields[selected] : null;

  return (
    <div className="mt-8">
      <div
        ref={mapEl}
        className="h-[28rem] w-full rounded-lg border border-[var(--color-line)]"
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-40">
          {saving ? "Saving…" : "Save layout"}
        </button>
        <button
          onClick={() => {
            setFields([]);
            setPoints([]);
            setSelected(null);
          }}
          className="btn btn-ghost"
        >
          Clear
        </button>
        <select
          className="field !w-auto"
          value=""
          onChange={(e) => {
            if (!e.target.value || !mapRef.current) return;
            const c = mapRef.current.getCenter();
            setPoints((p) => [
              ...p,
              { kind: e.target.value, label: e.target.value, lat: c.lat, lng: c.lng },
            ]);
            e.target.value = "";
          }}
        >
          <option value="">Add a marker…</option>
          {POINT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        {status && <span className="mono normal-case tracking-normal">{status}</span>}
      </div>

      {warnings.length > 0 && (
        <div className="panel mt-4 border-[var(--color-warn)]/40 p-4">
          <p className="mono text-[var(--color-warn)]">Spacing</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-dim)]">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {active && selected !== null && (
        <div className="panel mt-4 p-5">
          <p className="mono">Selected field</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mono">Name</span>
              <input
                value={active.name}
                onChange={(e) => patch(selected, { name: e.target.value })}
                className="field mt-2"
              />
            </label>
            <label className="block">
              <span className="mono">Size</span>
              <select
                value={active.preset}
                onChange={(e) => {
                  const p = presetByKey(e.target.value);
                  patch(selected, {
                    preset: p.key,
                    lengthM: p.lengthM,
                    widthM: p.widthM,
                    endzoneM: p.endzoneM,
                  });
                }}
                className="field mt-2"
              >
                {PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} — {p.lengthM}×{p.widthM}m
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mono">Rotation — {active.bearing}°</span>
              <input
                type="range"
                min={0}
                max={359}
                value={active.bearing}
                onChange={(e) => patch(selected, { bearing: Number(e.target.value) })}
                className="mt-2 w-full"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setFields((prev) => prev.filter((_, j) => j !== selected));
                setSelected(null);
              }}
              className="btn btn-ghost !py-1 !text-xs"
            >
              Delete field
            </button>
            <span className="mono normal-case tracking-normal">
              {presetByKey(active.preset).note}
            </span>
          </div>
        </div>
      )}

      <p className="mono mt-6 normal-case tracking-normal">
        Click to place · drag the label to move · slider rotates · click a field to
        select it. Fields stay exactly regulation size at every zoom and rotation.
      </p>
    </div>
  );
}
