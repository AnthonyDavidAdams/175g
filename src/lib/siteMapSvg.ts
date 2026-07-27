import { fieldShape } from "./fieldGeometry";
import { iconSvg } from "./siteIcons";

/**
 * Render the saved field layout as a standalone SVG for the printed handout.
 *
 * Deliberately no satellite tiles: a printed site map wants high-contrast line
 * art that survives a photocopier and a laminator, not a grey aerial photo.
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

type Point = { kind: string; label: string; lat: number; lng: number };

const EARTH_R = 6378137;

export function siteMapSvg(
  fields: Field[],
  points: Point[],
  opts: { width?: number; height?: number } = {},
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

  const place = (lat: number, lng: number): [number, number] => {
    const [x, y] = toXY(lat, lng);
    return [
      pad + (x - minX) * scale + (width - pad * 2 - spanX * scale) / 2,
      pad + (y - minY) * scale + (height - pad * 2 - spanY * scale) / 2,
    ];
  };

  const parts: string[] = [];

  for (const { field, shape } of shapes) {
    const pts = shape.outline
      .map((c) => place(c[0], c[1]).map((n) => n.toFixed(1)).join(","))
      .join(" ");
    parts.push(
      `<polygon points="${pts}" fill="#f2f2f2" stroke="#111" stroke-width="1.5"/>`,
    );
    for (const line of shape.endzoneLines) {
      const [a, b] = line.map((c) => place(c[0], c[1]));
      parts.push(
        `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" ` +
          `y2="${b[1].toFixed(1)}" stroke="#111" stroke-width="1" stroke-dasharray="4 3"/>`,
      );
    }
    const [cx, cy] = place(field.centerLat, field.centerLng);
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" ` +
        `dominant-baseline="central" font-family="ui-monospace, monospace" ` +
        `font-size="13" font-weight="700" fill="#111">${escapeXml(field.name)}</text>`,
    );
  }

  for (const p of points) {
    const [x, y] = place(p.lat, p.lng);
    parts.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="#fff" ` +
        `stroke="#111" stroke-width="1.5"/>`,
    );
    parts.push(
      `<g transform="translate(${(x - 7).toFixed(1)},${(y - 7).toFixed(1)})">` +
        iconSvg(p.kind, 14, "#111") +
        `</g>`,
    );
    parts.push(
      `<text x="${x.toFixed(1)}" y="${(y + 22).toFixed(1)}" text-anchor="middle" ` +
        `font-family="ui-monospace, monospace" font-size="9" fill="#111">` +
        `${escapeXml(p.label)}</text>`,
    );
  }

  // Scale bar: a round number of metres, sized to the drawing.
  const targetPx = 90;
  const rawM = targetPx / scale;
  const niceM = [10, 20, 25, 50, 100, 200].reduce((a, b) =>
    Math.abs(b - rawM) < Math.abs(a - rawM) ? b : a,
  );
  const barPx = niceM * scale;
  const bx = pad;
  const by = height - 14;
  parts.push(
    `<line x1="${bx}" y1="${by}" x2="${(bx + barPx).toFixed(1)}" y2="${by}" ` +
      `stroke="#111" stroke-width="2"/>` +
      `<line x1="${bx}" y1="${by - 4}" x2="${bx}" y2="${by + 4}" stroke="#111" stroke-width="2"/>` +
      `<line x1="${(bx + barPx).toFixed(1)}" y1="${by - 4}" x2="${(bx + barPx).toFixed(1)}" ` +
      `y2="${by + 4}" stroke="#111" stroke-width="2"/>` +
      `<text x="${(bx + barPx + 8).toFixed(1)}" y="${by + 3}" ` +
      `font-family="ui-monospace, monospace" font-size="10" fill="#111">${niceM}m</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%">
    <rect width="${width}" height="${height}" fill="#fff"/>
    ${parts.join("\n    ")}
  </svg>`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}
