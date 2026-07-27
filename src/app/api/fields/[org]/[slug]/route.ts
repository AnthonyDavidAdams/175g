import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canAdminOrg, getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getTournament } from "@/lib/tournament";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    fields: z.array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        preset: z.string(),
        centerLat: z.number(),
        centerLng: z.number(),
        bearing: z.number(),
        lengthM: z.number(),
        widthM: z.number(),
        endzoneM: z.number(),
        showcase: z.boolean().optional(),
        notes: z.string().optional(),
      }),
    ),
    points: z
      .array(
        z.object({
          id: z.string().optional(),
          kind: z.string(),
          label: z.string().min(1),
          lat: z.number(),
          lng: z.number(),
          color: z.string().nullable().optional(),
        }),
      )
      .optional(),
  }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canAdminOrg(session.personId, found.org.id)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid layout." },
      { status: 400 },
    );
  }

  const t = found.tournament;

  // Replace wholesale — the editor always sends the complete layout.
  db.delete(schema.fields).where(eq(schema.fields.tournamentId, t.id)).run();
  db.delete(schema.sitePoints).where(eq(schema.sitePoints.tournamentId, t.id)).run();

  parsed.data.fields.forEach((f, i) => {
    db.insert(schema.fields)
      .values({
        id: f.id ?? nanoid(),
        tournamentId: t.id,
        name: f.name,
        preset: f.preset,
        centerLat: String(f.centerLat),
        centerLng: String(f.centerLng),
        bearing: Math.round(f.bearing),
        lengthM: Math.round(f.lengthM),
        widthM: Math.round(f.widthM),
        endzoneM: Math.round(f.endzoneM),
        showcase: !!f.showcase,
        notes: f.notes ?? null,
        sortOrder: i,
      })
      .run();
  });

  for (const p of parsed.data.points ?? []) {
    db.insert(schema.sitePoints)
      .values({
        id: p.id ?? nanoid(),
        tournamentId: t.id,
        kind: p.kind,
        label: p.label,
        lat: String(p.lat),
        lng: String(p.lng),
        color: p.color ?? null,
      })
      .run();
  }

  // Keep the headline field count honest.
  db.update(schema.tournaments)
    .set({ fieldCount: parsed.data.fields.length })
    .where(eq(schema.tournaments.id, t.id))
    .run();

  return NextResponse.json({ ok: true, fields: parsed.data.fields.length });
}
