"use client";

import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import {
  PRESETS,
  bearingBetween,
  fieldShape,
  presetByKey,
  spacingWarnings,
} from "@/lib/fieldGeometry";
import {
  PIN_COLORS,
  SITE_ICONS,
  iconByKind,
  iconSvg,
  mapPin,
} from "@/lib/siteIcons";

/**
 * Field and site-map placement on real satellite imagery, at true scale.
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
  color?: string | null;
};

/** What the next map click will do. */
type Mode = { tool: "field" } | { tool: "marker"; kind: string };

type Selection =
  | { type: "field"; index: number }
  | { type: "point"; index: number }
  | null;

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
  const [selected, setSelected] = useState<Selection>(
    initialFields.length ? { type: "field", index: 0 } : null,
  );
  const [mode, setMode] = useState<Mode>({ tool: "field" });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { label: string; lat: number; lng: number; interpreted?: string; why?: string }[]
  >([]);
  const [searching, setSearching] = useState<"plain" | "smart" | null>(null);

  // The map click handler is registered once, so it reads the live mode from a
  // ref rather than closing over a stale value.
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // While a drag is in flight we must NOT rebuild the Leaflet layers: clearing
  // them destroys the very element under the pointer, which ends the drag after
  // a single pixel. Instead the drag mutates the existing layers directly and
  // commits to React state once, on release.
  const draggingRef = useRef(false);
  const fieldLayersRef = useRef<
    Map<
      number,
      {
        poly: L.Polygon;
        endzones: L.Polyline[];
        label: L.Marker;
        handle?: L.Marker;
        spoke?: L.Polyline;
      }
    >
  >(new Map());

  /** Move a field's drawn layers without touching React state. */
  function repaintField(i: number, f: FieldRow) {
    const refs = fieldLayersRef.current.get(i);
    if (!refs) return;
    const shape = fieldShape(f);
    refs.poly.setLatLngs(shape.outline);
    refs.endzones.forEach((l, k) => l.setLatLngs(shape.endzoneLines[k]));
    refs.label.setLatLng(shape.center);
    if (refs.handle && refs.spoke) {
      const nose: [number, number] = [
        (shape.outline[0][0] + shape.outline[1][0]) / 2,
        (shape.outline[0][1] + shape.outline[1][1]) / 2,
      ];
      refs.handle.setLatLng(nose);
      refs.spoke.setLatLngs([shape.center, nose]);
    }
  }

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

      leaflet.control.scale({ metric: true, imperial: true }).addTo(map);

      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      setStatus("Search for your site, then click the map to place a field.");

      map.on("click", (e: L.LeafletMouseEvent) => {
        const current = modeRef.current;

        if (current.tool === "marker") {
          const icon = iconByKind(current.kind);
          setPoints((prev) => {
            const next = [
              ...prev,
              {
                kind: current.kind,
                label: icon.label,
                lat: e.latlng.lat,
                lng: e.latlng.lng,
                color: "#ffffff",
              },
            ];
            setSelected({ type: "point", index: next.length - 1 });
            return next;
          });
          // One click, one marker — drop back to the default tool so the next
          // click doesn't scatter duplicates.
          setMode({ tool: "field" });
          return;
        }

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
          setSelected({ type: "field", index: next.length - 1 });
          return next;
        });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [centerLat, centerLng]);

  // Cursor communicates the armed tool.
  useEffect(() => {
    const el = mapEl.current?.querySelector(".leaflet-container") as HTMLElement | null;
    if (el) el.style.cursor = mode.tool === "marker" ? "crosshair" : "";
  }, [mode]);

  // Redraw whenever the layout changes — except mid-drag, see draggingRef.
  useEffect(() => {
    const leaflet = leafletRef.current;
    const layer = layerRef.current;
    if (!leaflet || !layer || draggingRef.current) return;
    layer.clearLayers();
    fieldLayersRef.current.clear();

    fields.forEach((f, i) => {
      const shape = fieldShape(f);
      const active = selected?.type === "field" && selected.index === i;

      const poly = leaflet
        .polygon(shape.outline, {
          color: active ? "#d4fe4f" : "#ffffff",
          weight: active ? 3 : 2,
          opacity: active ? 1 : 0.75,
          fillColor: active ? "#d4fe4f" : "#ffffff",
          fillOpacity: active ? 0.16 : 0.07,
        })
        .on("click", (e: L.LeafletMouseEvent) => {
          if (modeRef.current.tool === "marker") return;
          leaflet.DomEvent.stop(e);
          setSelected({ type: "field", index: i });
        })
        // Drag anywhere on the field, not just the little label. Leaflet
        // polygons aren't draggable, so pan the shape by hand: freeze the map,
        // move the layers directly, and commit once on release.
        .on("mousedown", (e: L.LeafletMouseEvent) => {
          if (modeRef.current.tool === "marker") return;
          const map = mapRef.current;
          if (!map) return;
          leaflet.DomEvent.stop(e);
          setSelected({ type: "field", index: i });

          const start = e.latlng;
          const origin = { lat: f.centerLat, lng: f.centerLng };
          let latest = { ...f };
          draggingRef.current = true;
          map.dragging.disable();

          const onMove = (ev: L.LeafletMouseEvent) => {
            latest = {
              ...latest,
              centerLat: origin.lat + (ev.latlng.lat - start.lat),
              centerLng: origin.lng + (ev.latlng.lng - start.lng),
            };
            repaintField(i, latest);
          };
          const onUp = () => {
            map.off("mousemove", onMove);
            map.off("mouseup", onUp);
            map.dragging.enable();
            draggingRef.current = false;
            setFields((prev) => prev.map((x, j) => (j === i ? latest : x)));
          };
          map.on("mousemove", onMove);
          map.on("mouseup", onUp);
        })
        .addTo(layer);

      const endzones = shape.endzoneLines.map((line) =>
        leaflet
          .polyline(line, {
            color: active ? "#d4fe4f" : "#ffffff",
            weight: 1.5,
            opacity: 0.8,
            dashArray: "5 5",
          })
          .addTo(layer),
      );

      const label = leaflet
        .marker(shape.center, {
          draggable: true,
          icon: leaflet.divIcon({
            className: "",
            html: `<div style="
              transform:translate(-50%,-50%);
              font:600 12px ui-monospace,monospace;
              color:#0a0c05;background:${active ? "#d4fe4f" : "#ffffffcc"};
              padding:2px 7px;border-radius:4px;white-space:nowrap;cursor:grab;
            ">${f.name}</div>`,
          }),
        })
        .on("dragstart", () => {
          draggingRef.current = true;
          setSelected({ type: "field", index: i });
        })
        .on("drag", (e: L.LeafletEvent) => {
          const ll = (e.target as L.Marker).getLatLng();
          repaintField(i, { ...f, centerLat: ll.lat, centerLng: ll.lng });
        })
        .on("dragend", (e: L.LeafletEvent) => {
          const ll = (e.target as L.Marker).getLatLng();
          draggingRef.current = false;
          setFields((prev) =>
            prev.map((x, j) =>
              j === i ? { ...x, centerLat: ll.lat, centerLng: ll.lng } : x,
            ),
          );
        })
        .addTo(layer);

      const refs: {
        poly: L.Polygon;
        endzones: L.Polyline[];
        label: L.Marker;
        handle?: L.Marker;
        spoke?: L.Polyline;
      } = { poly, endzones, label };

      // Rotation handle: drag the nose of the field to spin it in place.
      if (active) {
        const nose: [number, number] = [
          (shape.outline[0][0] + shape.outline[1][0]) / 2,
          (shape.outline[0][1] + shape.outline[1][1]) / 2,
        ];
        refs.spoke = leaflet
          .polyline([shape.center, nose], {
            color: "#d4fe4f",
            weight: 1,
            opacity: 0.6,
            dashArray: "3 4",
          })
          .addTo(layer);
        refs.handle = leaflet
          .marker(nose, {
            draggable: true,
            icon: leaflet.divIcon({
              className: "",
              html: `<div title="Drag to rotate" style="
                transform:translate(-50%,-50%);
                width:18px;height:18px;border-radius:50%;
                background:#d4fe4f;border:2px solid #08090b;cursor:grab;
              "></div>`,
            }),
          })
          .on("dragstart", () => {
            draggingRef.current = true;
          })
          .on("drag", (e: L.LeafletEvent) => {
            const ll = (e.target as L.Marker).getLatLng();
            const deg = bearingBetween([f.centerLat, f.centerLng], [ll.lat, ll.lng]);
            repaintField(i, { ...f, bearing: Math.round(deg) });
          })
          .on("dragend", (e: L.LeafletEvent) => {
            const ll = (e.target as L.Marker).getLatLng();
            const deg = bearingBetween([f.centerLat, f.centerLng], [ll.lat, ll.lng]);
            draggingRef.current = false;
            setFields((prev) =>
              prev.map((x, j) => (j === i ? { ...x, bearing: Math.round(deg) } : x)),
            );
          })
          .addTo(layer);
      }

      fieldLayersRef.current.set(i, refs);
    });

    points.forEach((p, i) => {
      const active = selected?.type === "point" && selected.index === i;
      leaflet
        .marker([p.lat, p.lng], {
          draggable: true,
          icon: leaflet.divIcon({
            className: "",
            iconSize: [0, 0],
            html: mapPin(p.kind, p.label, active, p.color),
          }),
        })
        .on("click", (e: L.LeafletMouseEvent) => {
          leaflet.DomEvent.stop(e);
          setSelected({ type: "point", index: i });
        })
        .on("dragstart", () => {
          draggingRef.current = true;
          setSelected({ type: "point", index: i });
        })
        .on("dragend", (e: L.LeafletEvent) => {
          const ll = (e.target as L.Marker).getLatLng();
          draggingRef.current = false;
          setPoints((prev) =>
            prev.map((x, j) => (j === i ? { ...x, lat: ll.lat, lng: ll.lng } : x)),
          );
        })
        .addTo(layer);
    });
  }, [fields, points, selected]);

  // Delete the selection with the keyboard, as any map editor should.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!selected) return;
      e.preventDefault();
      if (selected.type === "field") {
        setFields((prev) => prev.filter((_, j) => j !== selected.index));
      } else {
        setPoints((prev) => prev.filter((_, j) => j !== selected.index));
      }
      setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  async function runSearch(kind: "plain" | "smart") {
    if (query.trim().length < 3) return;
    setSearching(kind);
    setStatus(null);
    const url =
      kind === "smart"
        ? `/api/geocode/smart?q=${encodeURIComponent(query)}`
        : `/api/geocode?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({ results: [] }));
    setResults(data.results ?? []);
    setSearching(null);
    if (!data.results?.length) {
      setStatus(
        data.error ??
          data.note ??
          (kind === "plain"
            ? "Nothing matched. Try Smart find — it can read a description."
            : "No match. Try adding the city and state."),
      );
    }
  }

  function patchField(i: number, p: Partial<FieldRow>) {
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
    setStatus(
      res.ok
        ? `Saved ${data.fields} field${data.fields === 1 ? "" : "s"} and ${points.length} marker${points.length === 1 ? "" : "s"}.`
        : (data.error ?? "Save failed."),
    );
  }

  const warnings = spacingWarnings(fields);
  const activeField =
    selected?.type === "field" ? fields[selected.index] : null;
  const activePoint =
    selected?.type === "point" ? points[selected.index] : null;

  return (
    <div className="mt-8">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await runSearch("plain");
        }}
        className="mb-3 flex flex-wrap gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="An address, park, or campus — or just 'the rec fields at KU'"
          className="field min-w-52 flex-1"
        />
        <button
          type="submit"
          disabled={!!searching}
          className="btn btn-ghost disabled:opacity-40"
        >
          {searching === "plain" ? "…" : "Find"}
        </button>
        <button
          type="button"
          onClick={() => runSearch("smart")}
          disabled={!!searching}
          title="Let Claude work out the real address, then geocode it"
          className="btn btn-primary disabled:opacity-40"
        >
          {searching === "smart" ? "Thinking…" : "Smart find"}
        </button>
      </form>

      {results.length > 0 && (
        <ul className="panel mb-3 divide-y divide-[var(--color-line)]">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                onClick={() => {
                  mapRef.current?.setView([r.lat, r.lng], 18);
                  setResults([]);
                  setQuery("");
                  setStatus("Click the map to place a field.");
                }}
                className="w-full px-4 py-2.5 text-left text-sm hover:text-[var(--color-signal)]"
              >
                {r.label}
                {r.interpreted && (
                  <span className="mono mt-1 block normal-case tracking-normal">
                    read as “{r.interpreted}”{r.why ? ` — ${r.why}` : ""}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Palette */}
      <div className="panel mb-3 flex flex-wrap items-center gap-1.5 p-2">
        <button
          onClick={() => setMode({ tool: "field" })}
          className={`btn !gap-1.5 !rounded-md !px-2.5 !py-1.5 !text-xs ${
            mode.tool === "field" ? "btn-primary" : "btn-ghost"
          }`}
          title="Click the map to place a field"
        >
          Field
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--color-line-strong)]" />
        {SITE_ICONS.map((icon) => {
          const armed = mode.tool === "marker" && mode.kind === icon.kind;
          return (
            <button
              key={icon.kind}
              onClick={() =>
                setMode(armed ? { tool: "field" } : { tool: "marker", kind: icon.kind })
              }
              title={`${icon.label} — ${icon.hint}`}
              className={`btn !gap-1.5 !rounded-md !px-2.5 !py-1.5 !text-xs ${
                armed ? "btn-primary" : "btn-ghost"
              }`}
            >
              <span
                className="inline-flex"
                dangerouslySetInnerHTML={{
                  __html: iconSvg(icon.kind, 14, armed ? "#0a0c05" : "currentColor"),
                }}
              />
              {icon.label}
            </button>
          );
        })}
      </div>

      {mode.tool === "marker" && (
        <p className="mono mb-2 normal-case tracking-normal text-[var(--color-signal)]">
          Click the map to drop {iconByKind(mode.kind).label} — or press the button
          again to cancel
        </p>
      )}

      <div
        ref={mapEl}
        className="h-[32rem] w-full rounded-lg border border-[var(--color-line)]"
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
          Clear all
        </button>
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

      {activeField && selected?.type === "field" && (
        <div className="panel mt-4 p-5">
          <p className="mono">Selected field</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mono">Name</span>
              <input
                value={activeField.name}
                onChange={(e) => patchField(selected.index, { name: e.target.value })}
                className="field mt-2"
              />
            </label>
            <label className="block">
              <span className="mono">Size</span>
              <select
                value={activeField.preset}
                onChange={(e) => {
                  const p = presetByKey(e.target.value);
                  patchField(selected.index, {
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
            <label className="block">
              <span className="mono">Total length (m)</span>
              <input
                type="number"
                min={20}
                max={200}
                value={activeField.lengthM}
                onChange={(e) =>
                  patchField(selected.index, {
                    preset: "custom",
                    lengthM: Number(e.target.value) || activeField.lengthM,
                  })
                }
                className="field mt-2"
              />
            </label>
            <label className="block">
              <span className="mono">Width (m)</span>
              <input
                type="number"
                min={10}
                max={100}
                value={activeField.widthM}
                onChange={(e) =>
                  patchField(selected.index, {
                    preset: "custom",
                    widthM: Number(e.target.value) || activeField.widthM,
                  })
                }
                className="field mt-2"
              />
            </label>
            <label className="block">
              <span className="mono">End zone depth (m)</span>
              <input
                type="number"
                min={2}
                max={40}
                value={activeField.endzoneM}
                onChange={(e) =>
                  patchField(selected.index, {
                    preset: "custom",
                    endzoneM: Number(e.target.value) || activeField.endzoneM,
                  })
                }
                className="field mt-2"
              />
            </label>
            <label className="block">
              <span className="mono">Apply this size to</span>
              <button
                type="button"
                onClick={() =>
                  setFields((prev) =>
                    prev.map((x) => ({
                      ...x,
                      preset: activeField.preset,
                      lengthM: activeField.lengthM,
                      widthM: activeField.widthM,
                      endzoneM: activeField.endzoneM,
                    })),
                  )
                }
                className="btn btn-ghost mt-2 w-full justify-center !py-2 !text-xs"
              >
                All {fields.length} fields
              </button>
            </label>
            <label className="block sm:col-span-2">
              <span className="mono">
                Rotation — {activeField.bearing}° · drag the dot on the map to spin it
              </span>
              <input
                type="range"
                min={0}
                max={359}
                value={activeField.bearing}
                onChange={(e) =>
                  patchField(selected.index, { bearing: Number(e.target.value) })
                }
                className="mt-2 w-full"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setFields((prev) => prev.filter((_, j) => j !== selected.index));
                setSelected(null);
              }}
              className="btn btn-ghost !py-1 !text-xs"
            >
              Delete field
            </button>
            <span className="mono normal-case tracking-normal">
              {activeField.lengthM}×{activeField.widthM}m, {activeField.endzoneM}m end
              zones · {presetByKey(activeField.preset).note}
            </span>
          </div>
        </div>
      )}

      {activePoint && selected?.type === "point" && (
        <div className="panel mt-4 p-5">
          <p className="mono">Selected marker</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mono">Label</span>
              <input
                value={activePoint.label}
                onChange={(e) =>
                  setPoints((prev) =>
                    prev.map((x, j) =>
                      j === selected.index ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
                className="field mt-2"
              />
            </label>
            <label className="block">
              <span className="mono">Kind</span>
              <select
                value={activePoint.kind}
                onChange={(e) =>
                  setPoints((prev) =>
                    prev.map((x, j) =>
                      j === selected.index ? { ...x, kind: e.target.value } : x,
                    ),
                  )
                }
                className="field mt-2"
              >
                {SITE_ICONS.map((i) => (
                  <option key={i.kind} value={i.kind}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4">
            <span className="mono">Colour</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PIN_COLORS.map((c) => (
                <button
                  key={c.hex}
                  title={c.name}
                  onClick={() =>
                    setPoints((prev) =>
                      prev.map((x, j) =>
                        j === selected.index ? { ...x, color: c.hex } : x,
                      ),
                    )
                  }
                  style={{ background: c.hex }}
                  className={`h-7 w-7 rounded-full border-2 ${
                    (activePoint.color ?? "#ffffff") === c.hex
                      ? "border-[var(--color-signal)]"
                      : "border-transparent"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setPoints((prev) => prev.filter((_, j) => j !== selected.index));
                setSelected(null);
              }}
              className="btn btn-ghost !py-1 !text-xs"
            >
              Delete marker
            </button>
            <span className="mono normal-case tracking-normal">
              {iconByKind(activePoint.kind).hint}
            </span>
          </div>
        </div>
      )}

      <p className="mono mt-6 normal-case tracking-normal">
        Pick a tool, then click the map · drag a field anywhere on its surface to
        move it · drag the dot to rotate · Delete removes the selection. Fields are
        drawn at true size — a standard 100×37m field is 91% the length of an
        American football field, so it should look large. Check against the scale
        bar in the corner.
      </p>
    </div>
  );
}
