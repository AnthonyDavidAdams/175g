import { NextResponse } from "next/server";

/**
 * Place search, proxied through us rather than called from the browser.
 *
 * Nominatim's usage policy requires an identifying User-Agent, which a browser
 * fetch cannot set, and asks for low request rates. Proxying lets us identify
 * ourselves properly and cache repeat lookups.
 */

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 60 * 60 * 1000;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) return NextResponse.json({ results: [] });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json(hit.data);
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "0");

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "175g tournament platform (https://175g.com)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) throw new Error(String(res.status));
    const raw = (await res.json()) as {
      display_name: string;
      lat: string;
      lon: string;
      type?: string;
    }[];

    const data = {
      results: raw.map((r) => ({
        label: r.display_name,
        lat: Number(r.lat),
        lng: Number(r.lon),
        type: r.type ?? null,
      })),
    };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { results: [], error: "Place search is unavailable right now." },
      { status: 502 },
    );
  }
}
