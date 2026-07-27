import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canAdminOrg, getSession, upsertPerson } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatDateRange, getTournament } from "@/lib/tournament";
import { fillTemplate, templateByKey } from "@/lib/waiverTemplates";

const Manage = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_from_template"), templateKey: z.string() }),
  z.object({
    action: z.literal("update"),
    id: z.string(),
    title: z.string().optional(),
    body: z.string().optional(),
    required: z.boolean().optional(),
  }),
  z.object({ action: z.literal("delete"), id: z.string() }),
]);

const Sign = z.object({
  action: z.literal("sign"),
  waiverId: z.string(),
  signedName: z.string().min(1),
  signedEmail: z.string().email(),
  guardianName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  teamId: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const t = found.tournament;

  const raw = await req.json().catch(() => null);

  // --- Signing is public: participants have no account. -------------------
  if (raw?.action === "sign") {
    const parsed = Sign.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid signature." },
        { status: 400 },
      );
    }
    const s = parsed.data;
    const waiver = db
      .select()
      .from(schema.waivers)
      .where(eq(schema.waivers.id, s.waiverId))
      .get();
    if (!waiver || waiver.tournamentId !== t.id) {
      return NextResponse.json({ error: "Waiver not found." }, { status: 404 });
    }

    const person = await upsertPerson(s.signedEmail, s.signedName);
    const hdrs = await headers();

    try {
      db.insert(schema.waiverSignatures)
        .values({
          id: nanoid(),
          waiverId: waiver.id,
          tournamentId: t.id,
          personId: person.id,
          teamId: s.teamId ?? null,
          signedName: s.signedName,
          signedEmail: s.signedEmail.toLowerCase(),
          guardianName: s.guardianName ?? null,
          dateOfBirth: s.dateOfBirth ?? null,
          // Snapshot what was actually agreed to, so later edits to the waiver
          // don't rewrite history.
          bodySnapshot: waiver.body,
          versionSigned: waiver.version,
          ip: hdrs.get("x-real-ip"),
          userAgent: hdrs.get("user-agent"),
        })
        .run();
    } catch {
      return NextResponse.json(
        { error: "That email has already signed this waiver." },
        { status: 409 },
      );
    }

    // Mark the roster entry signed if this person is on a roster.
    const entry = db
      .select()
      .from(schema.rosterEntries)
      .where(
        and(
          eq(schema.rosterEntries.tournamentId, t.id),
          eq(schema.rosterEntries.personId, person.id),
        ),
      )
      .get();
    if (entry) {
      db.update(schema.rosterEntries)
        .set({ waiverSigned: true, waiverSignedAt: Math.floor(Date.now() / 1000) })
        .where(eq(schema.rosterEntries.id, entry.id))
        .run();
    }

    return NextResponse.json({ ok: true });
  }

  // --- Everything else requires org admin. --------------------------------
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canAdminOrg(session.personId, found.org.id)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const parsed = Manage.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (parsed.data.action === "create_from_template") {
    const tpl = templateByKey(parsed.data.templateKey);
    if (!tpl) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

    const body = fillTemplate(tpl.body, {
      tournament_name: t.name,
      dates: formatDateRange(t.startDate, t.endDate) ?? undefined,
      venue: t.venueName ?? undefined,
      venue_owner: t.venueName ?? undefined,
      organizer: found.org.name,
      roster_deadline: t.rosterDeadline ?? undefined,
      payment_deadline: t.paymentDeadline ?? undefined,
      bid_fee: t.bidFee ? `$${(t.bidFee / 100).toFixed(0)}` : undefined,
    });

    const id = nanoid();
    db.insert(schema.waivers)
      .values({
        id,
        tournamentId: t.id,
        title: tpl.title,
        body,
        audience: tpl.audience,
        templateKey: tpl.key,
      })
      .run();
    return NextResponse.json({ ok: true, id });
  }

  if (parsed.data.action === "update") {
    const existing = db
      .select()
      .from(schema.waivers)
      .where(eq(schema.waivers.id, parsed.data.id))
      .get();
    if (!existing || existing.tournamentId !== t.id) {
      return NextResponse.json({ error: "Waiver not found." }, { status: 404 });
    }
    const patch: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) };
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.required !== undefined) patch.required = parsed.data.required;
    if (parsed.data.body !== undefined && parsed.data.body !== existing.body) {
      patch.body = parsed.data.body;
      // Bump the version so already-collected signatures stay attributable to
      // the text they actually agreed to.
      patch.version = existing.version + 1;
    }
    db.update(schema.waivers)
      .set(patch)
      .where(eq(schema.waivers.id, existing.id))
      .run();
    return NextResponse.json({ ok: true, version: patch.version ?? existing.version });
  }

  if (parsed.data.action === "delete") {
    const signed = db
      .select()
      .from(schema.waiverSignatures)
      .where(eq(schema.waiverSignatures.waiverId, parsed.data.id))
      .all();
    if (signed.length) {
      return NextResponse.json(
        {
          error: `${signed.length} people have signed this. It can't be deleted — ` +
            `mark it not required instead, so the record survives.`,
        },
        { status: 409 },
      );
    }
    db.delete(schema.waivers).where(eq(schema.waivers.id, parsed.data.id)).run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
