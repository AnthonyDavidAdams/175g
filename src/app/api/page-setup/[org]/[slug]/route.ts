import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canAdminOrg, getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { generateDirections } from "@/lib/directions";
import { getTournament } from "@/lib/tournament";

const Body = z.object({
  action: z.enum(["save", "regenerate_directions"]),
  directions: z.string().nullish(),
  venueLat: z.number().nullish(),
  venueLng: z.number().nullish(),
  paymentNote: z.string().nullish(),
  paymentOptions: z
    .array(
      z.object({
        method: z.string().min(1),
        handle: z.string().nullish(),
        note: z.string().nullish(),
      }),
    )
    .nullish(),
  captions: z.record(z.string(), z.string()).nullish(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const session = await getSession();
  if (!session || !canAdminOrg(session.personId, found.org.id)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const t = found.tournament;
  const input = parsed.data;

  if (input.action === "regenerate_directions") {
    const sites = db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.tournamentId, t.id))
      .all();
    const markers = db
      .select()
      .from(schema.sitePoints)
      .where(eq(schema.sitePoints.tournamentId, t.id))
      .all();

    const text = generateDirections({
      tournamentName: t.name,
      venueName: t.venueName,
      venueAddress: t.venueAddress,
      city: t.city,
      lat: input.venueLat ?? (t.venueLat ? Number(t.venueLat) : null),
      lng: input.venueLng ?? (t.venueLng ? Number(t.venueLng) : null),
      sites: sites.map((s) => ({
        name: s.name,
        address: s.address,
        lat: s.lat ? Number(s.lat) : null,
        lng: s.lng ? Number(s.lng) : null,
        travelMinutes: s.travelMinutes,
        isPrimary: !!s.isPrimary,
        parkingNotes: s.parkingNotes,
      })),
      parkingMarkers: markers
        .filter((m) => m.kind === "parking")
        .map((m) => ({ label: m.label, lat: Number(m.lat), lng: Number(m.lng) })),
      entranceMarkers: markers
        .filter((m) => m.kind === "entrance")
        .map((m) => ({ label: m.label, lat: Number(m.lat), lng: Number(m.lng) })),
    });

    // Returned, not saved — the TD sees it before it replaces their edits.
    return NextResponse.json({ ok: true, directions: text });
  }

  const patch: Record<string, unknown> = {};
  if (input.directions !== undefined) patch.directions = input.directions ?? null;
  if (input.venueLat !== undefined) {
    patch.venueLat = input.venueLat != null ? String(input.venueLat) : null;
  }
  if (input.venueLng !== undefined) {
    patch.venueLng = input.venueLng != null ? String(input.venueLng) : null;
  }
  if (input.paymentNote !== undefined) patch.paymentNote = input.paymentNote ?? null;
  if (input.paymentOptions !== undefined) {
    patch.paymentOptions = input.paymentOptions?.length
      ? JSON.stringify(input.paymentOptions)
      : null;
  }

  if (Object.keys(patch).length) {
    db.update(schema.tournaments)
      .set(patch)
      .where(eq(schema.tournaments.id, t.id))
      .run();
  }

  for (const [id, caption] of Object.entries(input.captions ?? {})) {
    db.update(schema.media)
      .set({ caption: caption || null })
      .where(eq(schema.media.id, id))
      .run();
  }

  return NextResponse.json({ ok: true });
}
