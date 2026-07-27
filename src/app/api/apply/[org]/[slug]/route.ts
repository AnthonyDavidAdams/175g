import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertPerson } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getTournament } from "@/lib/tournament";

const RosterPlayer = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  roles: z.string().optional(),
  jerseyNumber: z.string().optional(),
  shirtSize: z.string().optional(),
});

const Application = z.object({
  teamName: z.string().min(1, "Team name is required."),
  school: z.string().optional(),
  division: z.string().optional(),
  captainName: z.string().min(1, "Captain name is required."),
  captainEmail: z.string().email("Captain email must be valid."),
  captainPhone: z.string().optional(),
  notes: z.string().optional(),
  // Consent is explicit and per-person. It is never inferred and never
  // defaulted to true.
  captainMarketingConsent: z.boolean().optional(),
  roster: z.array(RosterPlayer).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }
  const t = found.tournament;

  const parsed = Application.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid application." },
      { status: 400 },
    );
  }
  const app = parsed.data;

  const existing = db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.tournamentId, t.id),
        eq(schema.teams.name, app.teamName),
      ),
    )
    .get();

  if (existing) {
    return NextResponse.json(
      { error: "A team with that name has already applied." },
      { status: 409 },
    );
  }

  const teamId = nanoid();
  db.insert(schema.teams)
    .values({
      id: teamId,
      tournamentId: t.id,
      name: app.teamName,
      school: app.school ?? null,
      division: app.division ?? t.division ?? null,
      captainName: app.captainName,
      captainEmail: app.captainEmail.toLowerCase(),
      captainPhone: app.captainPhone ?? null,
      notes: app.notes ?? null,
      status: "applied",
    })
    .run();

  // The captain enters the cross-tournament directory tagged as captain. This
  // is the record that makes filling next year's field easy.
  const captain = await upsertPerson(app.captainEmail, app.captainName);
  if (app.captainMarketingConsent) {
    db.update(schema.people)
      .set({
        marketingConsent: true,
        consentAt: Math.floor(Date.now() / 1000),
        consentSource: `apply:${t.slug}`,
      })
      .where(eq(schema.people.id, captain.id))
      .run();
  }

  db.insert(schema.rosterEntries)
    .values({
      id: nanoid(),
      tournamentId: t.id,
      teamId,
      personId: captain.id,
      roles: "player;captain",
    })
    .onConflictDoNothing()
    .run();

  for (const p of app.roster ?? []) {
    if (!p.email) continue;
    const person = await upsertPerson(p.email, p.name);
    db.insert(schema.rosterEntries)
      .values({
        id: nanoid(),
        tournamentId: t.id,
        teamId,
        personId: person.id,
        roles: p.roles || "player",
        jerseyNumber: p.jerseyNumber ?? null,
        shirtSize: p.shirtSize ?? null,
      })
      .onConflictDoNothing()
      .run();
  }

  return NextResponse.json({ ok: true, teamId });
}
