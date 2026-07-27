import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canAdminOrg, getSession, upsertPerson } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";

const Body = z.object({
  action: z.enum(["add", "remove"]),
  email: z.string().email(),
  role: z.enum(["owner", "td", "staff"]).optional(),
  notifyPath: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const { org: orgSlug } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const org = db
    .select()
    .from(schema.orgs)
    .where(eq(schema.orgs.slug, orgSlug))
    .get();
  if (!org) return NextResponse.json({ error: "Org not found." }, { status: 404 });
  if (!canAdminOrg(session.personId, org.id)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { action, email, role = "td", notifyPath } = parsed.data;
  const normalized = email.trim().toLowerCase();

  if (action === "remove") {
    const person = db
      .select()
      .from(schema.people)
      .where(eq(schema.people.email, normalized))
      .get();
    if (!person) return NextResponse.json({ ok: true });

    const members = db
      .select()
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.orgId, org.id))
      .all();
    // Never let the last owner remove themselves and lock everyone out.
    const owners = members.filter((m) => m.role === "owner");
    if (owners.length === 1 && owners[0].personId === person.id) {
      return NextResponse.json(
        { error: "That's the only owner. Add another owner before removing this one." },
        { status: 409 },
      );
    }

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

  // Adding someone creates their person record but grants no marketing consent.
  const person = await upsertPerson(normalized);
  db.insert(schema.orgMembers)
    .values({ orgId: org.id, personId: person.id, role })
    .onConflictDoNothing()
    .run();

  const link = new URL(notifyPath ?? "/dashboard", SITE_URL).toString();
  try {
    await sendEmail({
      to: normalized,
      replyTo: session.email,
      subject: `You've been added to ${org.name} on 175g`,
      text: [
        `${session.email} added you as ${role} for ${org.name} on 175g.`,
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
