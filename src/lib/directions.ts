/**
 * Getting-there notes.
 *
 * Auto-generated from what the tournament already knows — venue, coordinates,
 * parking markers, sites — then freely editable, because the part that actually
 * helps is local knowledge no database has: which entrance is unlocked, that
 * the north lot floods, that the gate on Elm is chained on weekends.
 *
 * Coordinates are included as plain text on purpose. Map apps and link
 * shorteners fail, phones lose signal at the far end of a park, and a printed
 * lat/long can be typed into anything.
 */

export type DirectionsInput = {
  tournamentName: string;
  venueName?: string | null;
  venueAddress?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  sites?: {
    name: string;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    travelMinutes?: number | null;
    isPrimary?: boolean;
    parkingNotes?: string | null;
  }[];
  parkingMarkers?: { label: string; lat: number; lng: number }[];
  entranceMarkers?: { label: string; lat: number; lng: number }[];
};

export function formatCoords(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return null;
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function mapLinks(lat?: number | null, lng?: number | null, label?: string) {
  if (lat == null || lng == null) return null;
  const q = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${encodeURIComponent(label ?? "Fields")}&ll=${q}`,
    osm: `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=17/${lat.toFixed(5)}/${lng.toFixed(5)}`,
  };
}

export function generateDirections(input: DirectionsInput): string {
  const out: string[] = [];
  const sites = input.sites ?? [];

  const primary =
    sites.find((s) => s.isPrimary) ??
    (sites.length === 1 ? sites[0] : undefined);

  // --- headline venue -----------------------------------------------------
  const venue = primary?.name ?? input.venueName;
  const address = primary?.address ?? input.venueAddress;
  const lat = primary?.lat ?? input.lat;
  const lng = primary?.lng ?? input.lng;

  if (venue) out.push(venue);
  if (address) out.push(address);
  else if (input.city) out.push(input.city);

  const coords = formatCoords(lat, lng);
  if (coords) {
    out.push("");
    out.push(`Coordinates: ${coords}`);
    out.push(
      "Type those straight into any map app. Park addresses often drop you at " +
        "a main gate rather than the fields.",
    );
  }

  // --- other venues -------------------------------------------------------
  const others = sites.filter((s) => s !== primary);
  if (others.length) {
    out.push("");
    out.push("OTHER VENUES");
    for (const s of others) {
      const c = formatCoords(s.lat, s.lng);
      out.push(
        `${s.name}${s.address ? ` — ${s.address}` : ""}` +
          `${s.travelMinutes ? ` (about ${s.travelMinutes} minutes from ${venue ?? "the main site"})` : ""}` +
          `${c ? `\n  ${c}` : ""}`,
      );
    }
    out.push(
      "",
      "Check which venue your first game is at before you set off. They are not " +
        "walkable from each other.",
    );
  }

  // --- parking ------------------------------------------------------------
  const parking = input.parkingMarkers ?? [];
  const parkingNotes = sites
    .map((s) => (s.parkingNotes ? `${s.name}: ${s.parkingNotes}` : null))
    .filter(Boolean) as string[];

  if (parking.length || parkingNotes.length) {
    out.push("");
    out.push("PARKING");
    for (const p of parking) {
      out.push(`${p.label} — ${formatCoords(p.lat, p.lng)}`);
    }
    for (const n of parkingNotes) out.push(n);
    out.push(
      "Twenty travelling teams is sixty to a hundred cars. Carpool if you can, " +
        "and allow more time than the map says.",
    );
  } else {
    out.push("");
    out.push("PARKING");
    out.push(
      "[Add parking directions — where to park, whether a weekend permit is " +
        "needed, and what it costs. This is the single most common day-of " +
        "question and the easiest one to answer in advance.]",
    );
  }

  // --- entrance -----------------------------------------------------------
  const entrances = input.entranceMarkers ?? [];
  if (entrances.length) {
    out.push("");
    out.push("WAY IN");
    for (const e of entrances) {
      out.push(`${e.label} — ${formatCoords(e.lat, e.lng)}`);
    }
  }

  // --- prompts for the local knowledge no database has --------------------
  out.push("");
  out.push("GETTING THERE");
  out.push(
    "[Add anything a first-time visitor would not work out: which entrance to " +
      "use, whether a gate is locked at weekends, where the nearest coffee is, " +
      "which lot floods after rain, how long the walk from parking to the " +
      "furthest field really takes.]",
  );

  return out.join("\n");
}

/* -------------------------------------------------------------------------
 * Payment options
 * ---------------------------------------------------------------------- */

export type PaymentOption = {
  method: string;
  handle?: string | null;
  note?: string | null;
};

export const PAYMENT_METHODS = [
  { key: "venmo", label: "Venmo", handlePrompt: "@handle" },
  { key: "paypal", label: "PayPal", handlePrompt: "email or paypal.me link" },
  { key: "zelle", label: "Zelle", handlePrompt: "email or phone" },
  { key: "cashapp", label: "Cash App", handlePrompt: "$cashtag" },
  { key: "invoice", label: "Invoice", handlePrompt: "who to bill / PO process" },
  { key: "check", label: "Check", handlePrompt: "payable to, and where to post" },
  { key: "transfer", label: "Bank transfer", handlePrompt: "details to request" },
  { key: "other", label: "Other", handlePrompt: "how to pay" },
];

export function parsePaymentOptions(raw?: string | null): PaymentOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => p?.method) : [];
  } catch {
    return [];
  }
}

export function methodLabel(key: string) {
  return PAYMENT_METHODS.find((m) => m.key === key)?.label ?? key;
}

/**
 * No money moves through 175g. A college TD already has a way to take payment —
 * usually Venmo, sometimes a university invoice — and asking them to adopt a
 * payment processor to run one tournament is a worse product, not a better one.
 * So these are instructions, and the TD marks a team paid when it lands.
 */
export const PAYMENT_DISCLAIMER =
  "175g does not process payments. These are instructions for paying the " +
  "tournament directly, and the TD marks your team paid once it arrives.";
