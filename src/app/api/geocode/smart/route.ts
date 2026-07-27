import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/**
 * AI-assisted place resolution.
 *
 * Plain geocoders are literal: "the rec fields at KU" returns nothing, and a
 * TD searching for their own site by the name everyone locally uses gets no
 * results. This asks Claude to turn a colloquial description into candidate
 * postal addresses, then geocodes those candidates — so the model proposes and
 * the geocoder verifies. Nothing is placed on the map from the model alone.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

type Candidate = { address: string; why: string };

async function geocodeOne(q: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "2");
  const res = await fetch(url, {
    headers: {
      "User-Agent": "175g tournament platform (https://175g.com)",
      "Accept-Language": "en",
    },
  });
  if (!res.ok) return [];
  const raw = (await res.json()) as {
    display_name: string;
    lat: string;
    lon: string;
  }[];
  return raw.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}

export async function GET(req: Request) {
  // Costs a model call, so require a signed-in user.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) return NextResponse.json({ results: [] });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { results: [], error: "Smart search needs ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  let candidates: Candidate[] = [];
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system:
        "You turn colloquial descriptions of sports venues into full postal " +
        "addresses that a geocoder can resolve. The user is a tournament " +
        "director looking for the fields they will play on — often a campus " +
        "recreation complex, a city park, a school district site, or a soccer " +
        "complex.\n\n" +
        "Return 1-4 candidates, best first, as JSON only:\n" +
        '{"candidates":[{"address":"full street address, city, state ZIP","why":"one short line"}]}\n\n' +
        "Rules: give complete US-style postal addresses where you can, including " +
        "city and state. If the query names an institution, expand the " +
        "abbreviation (KU -> University of Kansas, Lawrence, KS). If you are " +
        "unsure of the street number, give the venue name plus city and state " +
        "rather than inventing a number — a wrong number geocodes to the wrong " +
        "place, which is worse than a vaguer query. Never invent a ZIP code you " +
        "are not confident about. Output JSON and nothing else.",
      messages: [{ role: "user", content: q }],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      candidates = (JSON.parse(match[0]).candidates ?? []).slice(0, 4);
    }
  } catch (err) {
    console.error("[geocode/smart]", err);
    return NextResponse.json(
      { results: [], error: "Smart search failed. Try the plain search." },
      { status: 502 },
    );
  }

  // The model proposes; the geocoder verifies. Only real coordinates come back.
  const seen = new Set<string>();
  const results: {
    label: string;
    lat: number;
    lng: number;
    interpreted: string;
    why: string;
  }[] = [];

  for (const c of candidates) {
    const hits = await geocodeOne(c.address);
    for (const h of hits) {
      const key = `${h.lat.toFixed(5)},${h.lng.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ ...h, interpreted: c.address, why: c.why });
    }
  }

  return NextResponse.json({
    results,
    note: results.length
      ? undefined
      : "Claude suggested addresses but none of them geocoded. Try naming the city.",
    candidates: results.length ? undefined : candidates,
  });
}
