import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { can, getRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { applyTemplate, canSeeTemplate, getTemplate } from "@/lib/templates";

/**
 * Create a tournament, and the org that owns it if this is someone's first.
 *
 * An org is the durable thing — a college program that runs an event every
 * year — and a tournament is one edition of it. New TDs should not have to
 * understand that distinction to get started, so we create both from one form
 * and explain the difference afterwards.
 */

const Body = z
  .object({
    /** Required only when creating a new program; ignored when orgSlug is given. */
    orgName: z.string().nullish(),
    tournamentName: z.string().min(2, "Give the tournament a name."),
  school: z.string().nullish(),
  city: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  division: z.string().nullish(),
    teamTarget: z.number().nullish(),
    sanctioned: z.boolean().nullish(),
    /** Join an org the user is already a member of, instead of making one. */
    orgSlug: z.string().nullish(),
    /** Start from an event template; token unlocks a link-shared one. */
    templateId: z.string().nullish(),
    templateToken: z.string().nullish(),
  })
  .refine((v) => !!v.orgSlug || (v.orgName ?? "").trim().length >= 2, {
    message: "Give your program a name.",
    path: ["orgName"],
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

  // --- template (validate before creating anything) -----------------------
  const template = input.templateId ? getTemplate(input.templateId) : null;
  if (input.templateId && !template) {
    return NextResponse.json({ error: "That template doesn't exist." }, { status: 404 });
  }
  if (template && !canSeeTemplate(template, session.personId, input.templateToken)) {
    return NextResponse.json(
      { error: "You don't have access to that template." },
      { status: 403 },
    );
  }

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
    const role = getRole(session.personId, org.id);
    if (!role) {
      return NextResponse.json(
        { error: "You don't have access to that program." },
        { status: 403 },
      );
    }
    // Staff and advisors can see a program's tournaments but not start new ones
    // under its name. An advisor who wants to run their own event starts a
    // new program, which they then own.
    if (!can(role, "tournament.create")) {
      return NextResponse.json(
        {
          error:
            "Your role in that program can't start a tournament under its name. " +
            "Create a new program instead, or ask an owner or TD.",
        },
        { status: 403 },
      );
    }
    orgId = org.id;
    orgSlug = org.slug;
  } else {
    // The refine above guarantees this is present when orgSlug is absent.
    const orgName = (input.orgName ?? "").trim();
    orgSlug = uniqueSlug(
      slugify(orgName),
      (s) => !!db.select().from(schema.orgs).where(eq(schema.orgs.slug, s)).get(),
    );
    orgId = nanoid();
    db.insert(schema.orgs)
      .values({
        id: orgId,
        slug: orgSlug,
        name: orgName,
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
      sanctioned: input.sanctioned ?? false,
      // Unpublished until the TD chooses. Nothing is public by accident, and a
      // half-built page shouldn't be findable.
      published: false,
    })
    .run();

  // --- template -----------------------------------------------------------
  let templateReport: { applied: boolean; errors: string[] } | undefined;
  if (template) {
    const report = applyTemplate(template.id, id, {
      name: input.tournamentName,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    });
    templateReport = { applied: report.applied, errors: report.errors };
    // The form's explicit choices win over the template's defaults.
    const overrides: Record<string, unknown> = {};
    if (input.division) overrides.division = input.division;
    if (input.teamTarget) overrides.teamTarget = input.teamTarget;
    if (input.sanctioned !== null && input.sanctioned !== undefined) {
      overrides.sanctioned = input.sanctioned;
    }
    if (input.city) overrides.city = input.city;
    if (Object.keys(overrides).length) {
      db.update(schema.tournaments)
        .set(overrides)
        .where(eq(schema.tournaments.id, id))
        .run();
    }
    if (report.applied) {
      db.insert(schema.agentMessages)
        .values({
          id: nanoid(),
          tournamentId: id,
          thread: "main",
          role: "assistant",
          content:
            `This tournament started from the template "${template.name}". ` +
            `Its plan, policies, waivers and sponsor prospects are already in place` +
            (input.startDate
              ? ", with deadlines set from your event date."
              : ". Set the event date and I'll put dates on the deadlines.") +
            " Tell me what's different about your edition and I'll adjust.",
        })
        .run();
    }
  }

  return NextResponse.json({
    ok: true,
    orgSlug,
    slug,
    url: `/td/${orgSlug}/${slug}`,
    template: templateReport,
  });
}
