import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";

/**
 * Create a tournament, and the org that owns it if this is someone's first.
 *
 * An org is the durable thing — a college program that runs an event every
 * year — and a tournament is one edition of it. New TDs should not have to
 * understand that distinction to get started, so we create both from one form
 * and explain the difference afterwards.
 */

const Body = z.object({
  orgName: z.string().min(2, "Give your program a name."),
  tournamentName: z.string().min(2, "Give the tournament a name."),
  school: z.string().nullish(),
  city: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  division: z.string().nullish(),
  teamTarget: z.number().nullish(),
  /** Join an org the user is already a member of, instead of making one. */
  orgSlug: z.string().nullish(),
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

/** Append -2, -3 … until the slug is free. */
function uniqueSlug(base: string, taken: (s: string) => boolean) {
  const root = base || "tournament";
  if (!taken(root)) return root;
  for (let i = 2; i < 200; i++) {
    const candidate = `${root}-${i}`;
    if (!taken(candidate)) return candidate;
  }
  return `${root}-${nanoid(6).toLowerCase()}`;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form." },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // --- org ----------------------------------------------------------------
  let orgId: string;
  let orgSlug: string;

  if (input.orgSlug) {
    const org = db
      .select()
      .from(schema.orgs)
      .where(eq(schema.orgs.slug, input.orgSlug))
      .get();
    if (!org) {
      return NextResponse.json({ error: "That program doesn't exist." }, { status: 404 });
    }
    const member = db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.orgId, org.id),
          eq(schema.orgMembers.personId, session.personId),
        ),
      )
      .get();
    if (!member) {
      return NextResponse.json(
        { error: "You don't have access to that program." },
        { status: 403 },
      );
    }
    orgId = org.id;
    orgSlug = org.slug;
  } else {
    orgSlug = uniqueSlug(
      slugify(input.orgName),
      (s) => !!db.select().from(schema.orgs).where(eq(schema.orgs.slug, s)).get(),
    );
    orgId = nanoid();
    db.insert(schema.orgs)
      .values({
        id: orgId,
        slug: orgSlug,
        name: input.orgName,
        school: input.school ?? null,
        city: input.city ?? null,
      })
      .run();
    // Creator owns it, so they can add the rest of their committee.
    db.insert(schema.orgMembers)
      .values({ orgId, personId: session.personId, role: "owner" })
      .run();
  }

  // --- tournament ---------------------------------------------------------
  const slug = uniqueSlug(
    slugify(input.tournamentName),
    (s) =>
      !!db
        .select()
        .from(schema.tournaments)
        .where(
          and(eq(schema.tournaments.orgId, orgId), eq(schema.tournaments.slug, s)),
        )
        .get(),
  );

  const id = nanoid();
  db.insert(schema.tournaments)
    .values({
      id,
      orgId,
      slug,
      name: input.tournamentName,
      year: input.startDate ? Number(input.startDate.slice(0, 4)) : null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? input.startDate ?? null,
      city: input.city ?? null,
      division: input.division ?? null,
      teamTarget: input.teamTarget ?? null,
      // Unpublished until the TD chooses. Nothing is public by accident, and a
      // half-built page shouldn't be findable.
      published: false,
    })
    .run();

  return NextResponse.json({
    ok: true,
    orgSlug,
    slug,
    url: `/td/${orgSlug}/${slug}`,
  });
}
