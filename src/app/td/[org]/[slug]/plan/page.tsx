import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canAdminOrg, getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getTournament } from "@/lib/tournament";
import Plan from "./plan";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Plan",
  description: "Every task, who owns it, and when it's due.",
  path: "/td",
});

export default async function PlanPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const session = await getSession();
  if (!session) redirect(`/login?next=/td/${org}/${slug}/plan`);
  if (!canAdminOrg(session.personId, found.org.id)) notFound();

  const tasks = db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.tournamentId, found.tournament.id))
    .orderBy(asc(schema.tasks.dueDate))
    .all();

  // Everyone who can be assigned work: the org's members.
  const members = db
    .select()
    .from(schema.orgMembers)
    .where(eq(schema.orgMembers.orgId, found.org.id))
    .all();
  const people = members.length
    ? db.select().from(schema.people).all().filter((p) =>
        members.some((m) => m.personId === p.id),
      )
    : [];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href={`/td/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-3 text-3xl">Plan</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-[var(--color-dim)]">
        Every task, who owns it, and when it&apos;s due. The agent maintains this
        too — ask it to generate the countdown, add work, or reassign.
      </p>

      <Plan
        org={org}
        slug={slug}
        eventDate={found.tournament.startDate}
        people={people.map((p) => p.name || p.email)}
        tasks={tasks.map((t) => ({
          id: t.id,
          phase: t.phase ?? "",
          task: t.task,
          owner: t.owner ?? "",
          assignee: t.assignee ?? "",
          startDate: t.startDate ?? "",
          dueDate: t.dueDate ?? "",
          hardDeadline: !!t.hardDeadline,
          done: !!t.done,
          notes: t.notes ?? "",
        }))}
      />
    </main>
  );
}
