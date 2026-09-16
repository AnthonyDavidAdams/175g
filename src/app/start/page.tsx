import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { getIntake, parseIntake } from "@/lib/agent/intake";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { applyTemplate, getTemplate } from "@/lib/templates";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Opening your console",
  description: "Turning your conversation with the tournament director into a tournament.",
  path: "/start",
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

function uniqueSlug(base: string, taken: (s: string) => boolean) {
  const root = base || "tournament";
  if (!taken(root)) return root;
  for (let i = 2; i < 200; i++) if (!taken(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${nanoid(6).toLowerCase()}`;
}

/**
 * Where the magic link from the front-page agent lands. Turns the intake
 * conversation into a real program and tournament, carries the conversation
 * into the console's main thread, and redirects there. Idempotent: a second
 * click goes straight to the console that already exists.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ intake?: string }>;
}) {
  const { intake: intakeId } = await searchParams;
  const session = await getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/start${intakeId ? `?intake=${intakeId}` : ""}`)}`);
  }
  if (!intakeId) redirect("/dashboard");

  const row = getIntake(intakeId);
  if (!row) redirect("/dashboard");

  if (row.claimedTournamentId) {
    const t = db
      .select({ slug: schema.tournaments.slug, orgId: schema.tournaments.orgId })
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, row.claimedTournamentId))
      .get();
    const org = t
      ? db.select({ slug: schema.orgs.slug }).from(schema.orgs).where(eq(schema.orgs.id, t.orgId)).get()
      : null;
    redirect(t && org ? `/td/${org.slug}/${t.slug}` : "/dashboard");
  }

  const { messages, draft } = parseIntake(row);

  // --- program -------------------------------------------------------------
  const orgName =
    draft.orgName?.trim() ||
    (draft.school ? `${draft.school} Ultimate` : null) ||
    (session.name ? `${session.name}'s program` : "My program");
  const orgSlug = uniqueSlug(
    slugify(orgName),
    (s) => !!db.select().from(schema.orgs).where(eq(schema.orgs.slug, s)).get(),
  );
  const orgId = nanoid();
  db.insert(schema.orgs)
    .values({
      id: orgId,
      slug: orgSlug,
      name: orgName,
      school: draft.school ?? null,
      city: draft.city ?? null,
    })
    .run();
  db.insert(schema.orgMembers)
    .values({ orgId, personId: session.personId, role: "owner" })
    .run();

  // --- tournament ----------------------------------------------------------
  const name =
    draft.tournamentName?.trim() ||
    (draft.school ? `${draft.school} tournament` : "New tournament");
  const slug = uniqueSlug(
    slugify(name),
    (s) =>
      !!db
        .select()
        .from(schema.tournaments)
        .where(and(eq(schema.tournaments.orgId, orgId), eq(schema.tournaments.slug, s)))
        .get(),
  );
  const tournamentId = nanoid();
  db.insert(schema.tournaments)
    .values({
      id: tournamentId,
      orgId,
      slug,
      name,
      year: draft.startDate ? Number(draft.startDate.slice(0, 4)) : null,
      startDate: draft.startDate ?? null,
      endDate: draft.endDate ?? draft.startDate ?? null,
      city: draft.city ?? null,
      division: draft.division ?? null,
      teamTarget: draft.teamTarget ?? null,
      sanctioned: draft.sanctioned ?? false,
      published: false,
      brief: [
        draft.roughTiming ? `Timing: ${draft.roughTiming}` : null,
        draft.hasFields != null ? `Fields: ${draft.hasFields ? "has fields" : "no fields yet"}` : null,
        draft.experience ? `TD experience: ${draft.experience}` : null,
        draft.notes ?? null,
      ]
        .filter(Boolean)
        .join("\n") || null,
    })
    .run();

  // --- template ------------------------------------------------------------
  const template = row.templateId ? getTemplate(row.templateId) : null;
  let templateNote = "";
  if (template) {
    const report = applyTemplate(template.id, tournamentId, {
      name,
      startDate: draft.startDate ?? null,
      endDate: draft.endDate ?? null,
    });
    if (report.applied) {
      // The visitor's explicit answers beat the template's defaults.
      const overrides: Record<string, unknown> = {};
      if (draft.division) overrides.division = draft.division;
      if (draft.teamTarget) overrides.teamTarget = draft.teamTarget;
      if (draft.sanctioned != null) overrides.sanctioned = draft.sanctioned;
      if (draft.city) overrides.city = draft.city;
      if (Object.keys(overrides).length) {
        db.update(schema.tournaments).set(overrides).where(eq(schema.tournaments.id, tournamentId)).run();
      }
      templateNote = ` I started it from the template "${template.name}", so the plan, deadlines and waivers are already in place${draft.startDate ? ", dated from your event." : "; set the date and I'll date them."}`;
    }
  }

  // --- carry the conversation across ---------------------------------------
  const base = Math.floor(Date.now() / 1000) - messages.length - 1;
  messages.forEach((m, i) => {
    db.insert(schema.agentMessages)
      .values({
        id: nanoid(),
        tournamentId,
        thread: "main",
        personId: m.role === "user" ? session.personId : null,
        role: m.role,
        content: m.content,
        createdAt: base + i,
      })
      .run();
  });
  db.insert(schema.agentMessages)
    .values({
      id: nanoid(),
      tournamentId,
      thread: "main",
      role: "assistant",
      content:
        `This is your console for ${name}, under ${orgName}. Everything you told me on the way in is recorded.${templateNote} ` +
        "From here I can set dates, draft the field email, build the budget, invite teams and generate the schedule. What's next?",
      createdAt: base + messages.length + 1,
    })
    .run();

  db.update(schema.intakeSessions)
    .set({ claimedTournamentId: tournamentId, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.intakeSessions.id, row.id))
    .run();

  redirect(`/td/${orgSlug}/${slug}`);
}
