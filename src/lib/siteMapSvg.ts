import { fieldShape } from "./fieldGeometry";
import { iconSvg } from "./siteIcons";

/**
 * Render the saved field layout as a standalone SVG.
 *
 * Optionally with satellite imagery behind it: the aerial photo makes the map
 * legible to someone standing in the car park, because they can match it to
 * what they can see. Tiles are embedded as base64 <image> elements, so the SVG
 * stays self-contained and prints without network access.
 *
 * Everything is projected to a local metre grid, so distances on the page are
 * proportional to distances on the ground.
 */

type Field = {
  name: string;
  centerLat: number;
  centerLng: number;
  bearing: number;
  lengthM: number;
  widthM: number;
  endzoneM: number;
};

type Point = {
  kind: string;
  label: string;
  lat: number;
  lng: number;
  color?: string | null;
};

const EARTH_R = 6378137;

/** Slippy-map tile maths, so we can fetch the aerial tiles covering a bbox. */
function lngToTileX(lng: number, z: number) {
  return ((lng + 180) / 360) * 2 ** z;
}
function latToTileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/**
 * Fetch the Esri aerial tiles covering a bounding box and return them as
 * positioned, base64-embedded <image> elements. Capped hard: a printed page
 * needs a readable backdrop, not a gigabyte of imagery.
 */
export async function backdropTiles(
  bounds: { north: number; south: number; east: number; west: number },
  width: number,
  height: number,
  maxTiles = 24,
) {
  for (let z = 19; z >= 15; z--) {
    const x0 = Math.floor(lngToTileX(bounds.west, z));
    const x1 = Math.floor(lngToTileX(bounds.east, z));
    const y0 = Math.floor(latToTileY(bounds.north, z));
    const y1 = Math.floor(latToTileY(bounds.south, z));
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count > maxTiles || count < 1) continue;

    // Pixel bounds of the requested box within this zoom level.
    const pxWest = lngToTileX(bounds.west, z) * 256;
    const pxEast = lngToTileX(bounds.east, z) * 256;
    const pxNorth = latToTileY(bounds.north, z) * 256;
    const pxSouth = latToTileY(bounds.south, z) * 256;
    const scaleX = width / (pxEast - pxWest);
    const scaleY = height / (pxSouth - pxNorth);

    const jobs: Promise<string | null>[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const url =
          `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery` +
          `/MapServer/tile/${z}/${y}/${x}`;
        jobs.push(
          fetch(url)
            .then(async (r) => {
              if (!r.ok) return null;
              const buf = Buffer.from(await r.arrayBuffer());
              const px = (x * 256 - pxWest) * scaleX;
              const py = (y * 256 - pxNorth) * scaleY;
              const w = 256 * scaleX;
              const h = 256 * scaleY;
              return (
                `<image x="${px.toFixed(1)}" y="${py.toFixed(1)}" ` +
                `width="${w.toFixed(1)}" height="${h.toFixed(1)}" ` +
                `preserveAspectRatio="none" ` +
                `href="data:image/jpeg;base64,${buf.toString("base64")}"/>`
              );
            })
            .catch(() => null),
        );
      }
    }
    const parts = (await Promise.all(jobs)).filter(Boolean) as string[];
    return parts.length ? parts.join("\n    ") : null;
  }
  return null;
}

export function siteMapSvg(
  fields: Field[],
  points: Point[],
  opts: {
    width?: number;
    height?: number;
    backdrop?: string | null;
    /** Must be the same bounds the backdrop tiles were fetched for. */
    bounds?: { north: number; south: number; east: number; west: number } | null;
  } = {},
) {
  if (!fields.length && !points.length) return null;

  const width = opts.width ?? 700;
  const height = opts.height ?? 460;
  const pad = 28;

  // Project lat/lng to local metres relative to the first feature.
  const originLat = fields[0]?.centerLat ?? points[0].lat;
  const originLng = fields[0]?.centerLng ?? points[0].lng;
  const toXY = (lat: number, lng: number): [number, number] => {
    const x =
      ((lng - originLng) * Math.PI / 180) *
      EARTH_R *
      Math.cos((originLat * Math.PI) / 180);
    const y = ((lat - originLat) * Math.PI / 180) * EARTH_R;
    return [x, -y]; // screen y grows downward
  };

  const shapes = fields.map((f) => ({
    field: f,
    shape: fieldShape(f),
  }));

  const allXY: [number, number][] = [];
  for (const { shape } of shapes) {
    for (const c of shape.outline) allXY.push(toXY(c[0], c[1]));
  }
  for (const p of points) allXY.push(toXY(p.lat, p.lng));

  const xs = allXY.map((p) => p[0]);
  const ys = allXY.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);

  // When imagery sits behind the drawing, both must use the SAME projection or
  // the fields land on the wrong grass. The tiles are Web Mercator positioned
  // from `opts.bounds`, so project to that same frame; otherwise fall back to
  // the local metre grid, which is fine for line art on its own.
  const bounds = opts.bounds;
  const mercY = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  };

  const place = bounds
    ? (lat: number, lng: number): [number, number] => {
        const fx = (lng - bounds.west) / (bounds.east - bounds.west);
        const fy =
          (mercY(lat) - mercY(bounds.north)) /
          (mercY(bounds.south) - mercY(bounds.north));
        return [fx * width, fy * height];
      }
    : (lat: number, lng: number): [number, number] => {
        const [x, y] = toXY(lat, lng);
        return [
          pad + (x - minX) * scale + (width - pad * 2 - spanX * scale) / 2,
          pad + (y - minY) * scale + (height - pad * 2 - spanY * scale) / 2,
        ];
      };

  const parts: string[] = [];

  const hasBackdrop = !!opts.backdrop;
  if (opts.backdrop) parts.push(opts.backdrop);

  for (const { field, shape } of shapes) {
    const pts = shape.outline
      .map((c) => place(c[0], c[1]).map((n) => n.toFixed(1)).join(","))
      .join(" ");
    parts.push(
      `<polygon points="${pts}" fill="${hasBackdrop ? "#ffffff" : "#f2f2f2"}" ` +
        `fill-opacity="${hasBackdrop ? 0.22 : 1}" ` +
        `stroke="${hasBackdrop ? "#ffffff" : "#111"}" stroke-width="2"/>`,
    );
    for (const line of shape.endzoneLines) {
      const [ezA, ezB] = line.map((c) => place(c[0], c[1]));
      parts.push(
        `<line x1="${ezA[0].toFixed(1)}" y1="${ezA[1].toFixed(1)}" x2="${ezB[0].toFixed(1)}" ` +
          `y2="${ezB[1].toFixed(1)}" stroke="${hasBackdrop ? "#ffffff" : "#111"}" ` +
          `stroke-width="1.2" stroke-dasharray="4 3"/>`,
      );
    }
    const [cx, cy] = place(field.centerLat, field.centerLng);
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" ` +
        `dominant-baseline="central" font-family="ui-monospace, monospace" ` +
        `font-size="13" font-weight="700" fill="${hasBackdrop ? "#ffffff" : "#111"}" ` +
        `${hasBackdrop ? 'stroke="#000" stroke-width="3" paint-order="stroke"' : ""}` +
        `>${escapeXml(field.name)}</text>`,
    );
  }

  for (const p of points) {
    const [x, y] = place(p.lat, p.lng);
    // Printed in ink, so a pale fill would vanish — keep the outline strong.
    parts.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" ` +
        `fill="${p.color ?? "#fff"}" stroke="#111" stroke-width="1.5"/>`,
    );
    parts.push(
      `<g transform="translate(${(x - 7).toFixed(1)},${(y - 7).toFixed(1)})">` +
        iconSvg(p.kind, 14, "#111") +
        `</g>`,
    );
    parts.push(
      `<text x="${x.toFixed(1)}" y="${(y + 22).toFixed(1)}" text-anchor="middle" ` +
        `font-family="ui-monospace, monospace" font-size="9" ` +
        `fill="${hasBackdrop ? "#ffffff" : "#111"}" ` +
        `${hasBackdrop ? 'stroke="#000" stroke-width="2.5" paint-order="stroke"' : ""}>` +
        `${escapeXml(p.label)}</text>`,
    );
  }

  // Scale bar: a round number of metres, measured from the projection actually
  // in use so the bar stays truthful under either fit.
  const refLat = fields[0]?.centerLat ?? points[0].lat;
  const pxPerM = bounds
    ? width /
      Math.max(
        1,
        (((bounds.east - bounds.west) * Math.PI) / 180) *
          EARTH_R *
          Math.cos((refLat * Math.PI) / 180),
      )
    : scale;
  const targetPx = 90;
  const rawM = targetPx / pxPerM;
  const niceM = [10, 20, 25, 50, 100, 200].reduce((a, b) =>
    Math.abs(b - rawM) < Math.abs(a - rawM) ? b : a,
  );
  const barPx = niceM * pxPerM;
  const bx = pad;
  const by = height - 14;
  parts.push(
    `<line x1="${bx}" y1="${by}" x2="${(bx + barPx).toFixed(1)}" y2="${by}" ` +
      `stroke="#111" stroke-width="2"/>` +
      `<line x1="${bx}" y1="${by - 4}" x2="${bx}" y2="${by + 4}" stroke="#111" stroke-width="2"/>` +
      `<line x1="${(bx + barPx).toFixed(1)}" y1="${by - 4}" x2="${(bx + barPx).toFixed(1)}" ` +
      `y2="${by + 4}" stroke="#111" stroke-width="2"/>` +
      `<text x="${(bx + barPx + 8).toFixed(1)}" y="${by + 3}" ` +
      `font-family="ui-monospace, monospace" font-size="10" fill="#111">${niceM}m</text>`
      .replace(/#111/g, hasBackdrop ? "#ffffff" : "#111"),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%">
    <rect width="${width}" height="${height}" fill="${hasBackdrop ? "#333" : "#fff"}"/>
    ${parts.join("\n    ")}
  </svg>`;
}

/** Geographic bounds of a layout, padded, for fetching backdrop tiles. */
export function layoutBounds(fields: Field[], points: Point[], padRatio = 0.12) {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const f of fields) {
    for (const c of fieldShape(f).outline) {
      lats.push(c[0]);
      lngs.push(c[1]);
    }
  }
  for (const p of points) {
    lats.push(p.lat);
    lngs.push(p.lng);
  }
  if (!lats.length) return null;

  const north = Math.max(...lats);
  const south = Math.min(...lats);
  const east = Math.max(...lngs);
  const west = Math.min(...lngs);
  const padLat = Math.max((north - south) * padRatio, 0.0004);
  const padLng = Math.max((east - west) * padRatio, 0.0004);
  return {
    north: north + padLat,
    south: south - padLat,
    east: east + padLng,
    west: west - padLng,
  };
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}
