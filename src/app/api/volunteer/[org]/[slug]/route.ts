import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertPerson } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getTournament } from "@/lib/tournament";

const Signup = z.object({
  shiftId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  marketingConsent: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const parsed = Signup.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid signup." },
      { status: 400 },
    );
  }
  const s = parsed.data;

  const shift = db
    .select()
    .from(schema.shifts)
    .where(eq(schema.shifts.id, s.shiftId))
    .get();
  if (!shift || shift.tournamentId !== found.tournament.id) {
    return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  }
  if (shift.personId) {
    return NextResponse.json({ error: "That shift was just taken." }, { status: 409 });
  }

  const person = await upsertPerson(s.email, s.name);
  if (s.marketingConsent) {
    db.update(schema.people)
      .set({
        marketingConsent: true,
        consentAt: Math.floor(Date.now() / 1000),
        consentSource: `volunteer:${found.tournament.slug}`,
      })
      .where(eq(schema.people.id, person.id))
      .run();
  }

  db.update(schema.shifts)
    .set({
      personId: person.id,
      assignedName: s.name,
      assignedPhone: s.phone ?? null,
    })
    .where(eq(schema.shifts.id, s.shiftId))
    .run();

  // Volunteers join the directory tagged as such, so they can be asked back.
  db.insert(schema.rosterEntries)
    .values({
      id: `${found.tournament.id}-${person.id}`.slice(0, 40),
      tournamentId: found.tournament.id,
      personId: person.id,
      roles: "volunteer",
    })
    .onConflictDoNothing()
    .run();

  return NextResponse.json({ ok: true });
}
