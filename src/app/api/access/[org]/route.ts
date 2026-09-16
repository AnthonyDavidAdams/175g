import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ROLE_LABEL,
  ROLES,
  canManageRole,
  getRole,
  requireAccess,
  type Role,
} from "@/lib/access";
import { upsertPerson } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";

const Body = z.object({
  action: z.enum(["add", "remove", "set_role"]),
  email: z.string().email(),
  role: z.enum(ROLES).optional(),
  notifyPath: z.string().optional(),
});

/**
 * Who can run the program. Owners manage everyone; TDs manage td, staff and
 * advisor but never owners; nobody else manages access. The last owner can't
 * be removed or demoted, so a program can't lock itself out.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const { org: orgSlug } = await params;

  const org = db
    .select()
    .from(schema.orgs)
    .where(eq(schema.orgs.slug, orgSlug))
    .get();
  if (!org) return NextResponse.json({ error: "Org not found." }, { status: 404 });

  const auth = await requireAccess(org.id, "access");
  if (!auth.ok) return auth.response;
  const { session, role: actorRole } = auth.access;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { action, email, notifyPath } = parsed.data;
  const role: Role = parsed.data.role ?? "td";
  const normalized = email.trim().toLowerCase();

  const members = () =>
    db
      .select()
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.orgId, org.id))
      .all();

  const lastOwnerGuard = (personId: string) => {
    const owners = members().filter((m) => m.role === "owner");
    return owners.length === 1 && owners[0].personId === personId;
  };

  if (action === "remove" || action === "set_role") {
    const person = db
      .select()
      .from(schema.people)
      .where(eq(schema.people.email, normalized))
      .get();
    if (!person) {
      return action === "remove"
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: "Not a member." }, { status: 404 });
    }
    const currentRole = getRole(person.id, org.id);
    if (!currentRole) {
      return action === "remove"
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: "Not a member." }, { status: 404 });
    }

    // A TD cannot touch an owner; only an owner can.
    if (!canManageRole(actorRole, currentRole)) {
      return NextResponse.json(
        { error: `Only an owner can change another owner.` },
        { status: 403 },
      );
    }

    if (lastOwnerGuard(person.id) && (action === "remove" || role !== "owner")) {
      return NextResponse.json(
        { error: "That's the only owner. Add another owner before removing or demoting this one." },
        { status: 409 },
      );
    }

    if (action === "remove") {
      db.delete(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, org.id),
            eq(schema.orgMembers.personId, person.id),
          ),
        )
        .run();
      return NextResponse.json({ ok: true });
    }

    if (!canManageRole(actorRole, role)) {
      return NextResponse.json(
        { error: `Only an owner can make someone an owner.` },
        { status: 403 },
      );
    }
    db.update(schema.orgMembers)
      .set({ role })
      .where(
        and(
          eq(schema.orgMembers.orgId, org.id),
          eq(schema.orgMembers.personId, person.id),
        ),
      )
      .run();
    return NextResponse.json({ ok: true, role });
  }

  // --- add -----------------------------------------------------------------
  if (!canManageRole(actorRole, role)) {
    return NextResponse.json(
      { error: `Only an owner can add another owner.` },
      { status: 403 },
    );
  }

  // Adding someone creates their person record but grants no marketing consent.
  const person = await upsertPerson(normalized);
  const existing = getRole(person.id, org.id);
  if (existing) {
    return NextResponse.json(
      { error: `${normalized} is already here as ${ROLE_LABEL[existing].toLowerCase()}. Change their role instead.` },
      { status: 409 },
    );
  }
  db.insert(schema.orgMembers)
    .values({ orgId: org.id, personId: person.id, role })
    .run();

  const link = new URL(notifyPath ?? "/dashboard", SITE_URL).toString();
  const what =
    role === "advisor"
      ? [
          `${session.email} added you as an advisor for ${org.name} on 175g.`,
          "",
          "As an advisor you can see everything the organisers see — the plan,",
          "the schedule, the budget, their working conversation with the",
          "tournament director agent — and leave notes for them. You can't change",
          "the tournament; that stays with the people running it.",
        ]
      : role === "staff"
        ? [
            `${session.email} added you to the staff for ${org.name} on 175g.`,
            "",
            "You can enter scores, tick off tasks, post announcements and edit the",
            "field map. Outreach, waivers and publishing stay with the TD.",
          ]
        : [
            `${session.email} added you as ${ROLE_LABEL[role].toLowerCase()} for ${org.name} on 175g.`,
          ];

  try {
    await sendEmail({
      to: normalized,
      replyTo: session.email,
      subject: `You've been added to ${org.name} on 175g`,
      text: [
        ...what,
        "",
        `Sign in with this email address and you'll see it: ${link}`,
        "",
        "175g is a tournament director for college ultimate. There's no password —",
        "you'll get a sign-in link by email.",
      ].join("\n"),
    });
  } catch (err) {
    // The grant is what matters; a failed notification shouldn't undo it.
    console.error("[access] notify failed", err);
    return NextResponse.json({ ok: true, notified: false });
  }

  return NextResponse.json({ ok: true, notified: true });
}
