/**
 * True-scale field geometry for the site-map tool.
 *
 * A field is stored as a centre point, a bearing, and its dimensions in metres.
 * Corners are derived, never stored — so a field stays exactly regulation size
 * however it is dragged or rotated, and the map matches what gets lined on the
 * ground.
 */

export type FieldPreset = {
  key: string;
  label: string;
  lengthM: number; // total, including both end zones
  widthM: number;
  endzoneM: number;
  note: string;
};

export const PRESETS: FieldPreset[] = [
  {
    key: "usau",
    label: "USAU / WFDF standard",
    lengthM: 100,
    widthM: 37,
    endzoneM: 18,
    note: "64m playing field proper plus two 18m end zones.",
  },
  {
    key: "wfdf_youth",
    label: "Youth / small-sided",
    lengthM: 75,
    widthM: 27,
    endzoneM: 15,
    note: "Common for youth and 5v5 formats.",
  },
  {
    key: "beach",
    label: "Beach",
    lengthM: 75,
    widthM: 25,
    endzoneM: 15,
    note: "WFDF beach dimensions. Lined with rope and stakes, not paint.",
  },
  {
    key: "indoor",
    label: "Indoor",
    lengthM: 50,
    widthM: 25,
    endzoneM: 8,
    note: "Varies by venue — measure the actual hall before committing.",
  },
];

export function presetByKey(key: string) {
  return PRESETS.find((p) => p.key === key) ?? PRESETS[0];
}

const EARTH_R = 6378137;

/** Offset a lat/lng by metres east and north. Accurate at tournament scale. */
export function offsetMeters(
  lat: number,
  lng: number,
  east: number,
  north: number,
): [number, number] {
  const dLat = (north / EARTH_R) * (180 / Math.PI);
  const dLng =
    (east / (EARTH_R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return [lat + dLat, lng + dLng];
}

export type FieldShape = {
  /** Outer boundary, 4 corners. */
  outline: [number, number][];
  /** The two end-zone boundary lines, as segments across the field. */
  endzoneLines: [number, number][][];
  /** Midpoint of the field, for the label. */
  center: [number, number];
};

/**
 * Derive the drawable shape. `bearing` is degrees clockwise from north and
 * points along the field's long axis.
 */
export function fieldShape(opts: {
  centerLat: number;
  centerLng: number;
  bearing: number;
  lengthM: number;
  widthM: number;
  endzoneM: number;
}): FieldShape {
  const { centerLat, centerLng, bearing, lengthM, widthM, endzoneM } = opts;
  const rad = (bearing * Math.PI) / 180;

  // Local field axes: `along` runs the length, `across` runs the width.
  const along = { e: Math.sin(rad), n: Math.cos(rad) };
  const across = { e: Math.cos(rad), n: -Math.sin(rad) };

  const at = (l: number, w: number) =>
    offsetMeters(
      centerLat,
      centerLng,
      along.e * l + across.e * w,
      along.n * l + across.n * w,
    );

  const halfL = lengthM / 2;
  const halfW = widthM / 2;

  const outline: [number, number][] = [
    at(+halfL, -halfW),
    at(+halfL, +halfW),
    at(-halfL, +halfW),
    at(-halfL, -halfW),
  ];

  const ezA = halfL - endzoneM;
  const endzoneLines: [number, number][][] = [
    [at(+ezA, -halfW), at(+ezA, +halfW)],
    [at(-ezA, -halfW), at(-ezA, +halfW)],
  ];

  return { outline, endzoneLines, center: [centerLat, centerLng] };
}

/**
 * Minimum spacing between adjacent fields. The formats and TD manuals set a
 * buffer, but that buffer does not account for equipment — a 10ft team tent
 * needs room beyond it. This returns both numbers so the UI can warn honestly.
 */
export const SPACING = {
  minBufferM: 5,
  recommendedWithTentsM: 9,
  note:
    "5m is the bare minimum between playing fields. Team tents have roughly a " +
    "3m footprint and sit outside the buffer, so 9m is what actually works.",
};

/** Great-circle distance in metres. */
export function distanceM(a: [number, number], b: [number, number]) {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p;
  const dLng = (lng2 - lng1) * p;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/** Flag field pairs that are too close to co-exist safely. */
export function spacingWarnings(
  fields: { name: string; centerLat: number; centerLng: number; widthM: number }[],
) {
  const out: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    for (let j = i + 1; j < fields.length; j++) {
      const a = fields[i];
      const b = fields[j];
      const gap =
        distanceM([a.centerLat, a.centerLng], [b.centerLat, b.centerLng]) -
        (a.widthM + b.widthM) / 2;
      if (gap < SPACING.minBufferM) {
        out.push(
          `${a.name} and ${b.name} are about ${Math.max(0, Math.round(gap))}m apart — ` +
            `below the ${SPACING.minBufferM}m minimum.`,
        );
      } else if (gap < SPACING.recommendedWithTentsM) {
        out.push(
          `${a.name} and ${b.name} are about ${Math.round(gap)}m apart. That clears ` +
            `the minimum but leaves no room for team tents.`,
        );
      }
    }
  }
  return out;
}

/** Initial bearing from one point to another, degrees clockwise from north. */
export function bearingBetween(
  from: [number, number],
  to: [number, number],
): number {
  const p = Math.PI / 180;
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;
  const dLng = (lng2 - lng1) * p;
  const y = Math.sin(dLng) * Math.cos(lat2 * p);
  const x =
    Math.cos(lat1 * p) * Math.sin(lat2 * p) -
    Math.sin(lat1 * p) * Math.cos(lat2 * p) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}
