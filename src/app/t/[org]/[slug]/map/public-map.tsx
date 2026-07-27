"use client";

import { useEffect, useRef } from "react";
import type * as L from "leaflet";
import { fieldShape } from "@/lib/fieldGeometry";
import { mapPin } from "@/lib/siteIcons";

/** Read-only site map for players and spectators, on real satellite imagery. */
export default function PublicMap({
  fields,
  points,
}: {
  fields: {
    name: string;
    centerLat: number;
    centerLng: number;
    bearing: number;
    lengthM: number;
    widthM: number;
    endzoneM: number;
  }[];
  points: { kind: string; label: string; lat: number; lng: number; color?: string | null }[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const made = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !el.current || made.current) return;
      made.current = true;

      const map = leaflet.map(el.current, { maxZoom: 22, scrollWheelZoom: true });
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

      const all: [number, number][] = [];

      for (const f of fields) {
        const shape = fieldShape(f);
        leaflet
          .polygon(shape.outline, {
            color: "#ffffff",
            weight: 2,
            fillColor: "#ffffff",
            fillOpacity: 0.12,
          })
          .addTo(map);
        for (const line of shape.endzoneLines) {
          leaflet
            .polyline(line, { color: "#ffffff", weight: 1.5, dashArray: "5 5" })
            .addTo(map);
        }
        leaflet
          .marker(shape.center, {
            interactive: false,
            icon: leaflet.divIcon({
              className: "",
              html: `<div style="transform:translate(-50%,-50%);
                font:600 12px ui-monospace,monospace;color:#0a0c05;
                background:#ffffffdd;padding:2px 7px;border-radius:4px;
                white-space:nowrap;">${f.name}</div>`,
            }),
          })
          .addTo(map);
        all.push(...shape.outline);
      }

      for (const p of points) {
        leaflet
          .marker([p.lat, p.lng], {
            interactive: false,
            icon: leaflet.divIcon({
              className: "",
              iconSize: [0, 0],
              html: mapPin(p.kind, p.label, false, p.color),
            }),
          })
          .addTo(map);
        all.push([p.lat, p.lng]);
      }

      if (all.length) {
        map.fitBounds(leaflet.latLngBounds(all).pad(0.25));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fields, points]);

  return (
    <div
      ref={el}
      className="mt-8 h-[34rem] w-full rounded-lg border border-[var(--color-line)]"
    />
  );
}
