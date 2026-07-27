import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canAdminOrg, getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getTournament } from "@/lib/tournament";
import AccessList from "./access-list";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Who can edit",
  description: "Manage who can run this tournament.",
  path: "/td",
});

export default async function AccessPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const session = await getSession();
  if (!session) redirect(`/login?next=/td/${org}/${slug}/access`);
  if (!canAdminOrg(session.personId, found.org.id)) notFound();

  const members = db
    .select()
    .from(schema.orgMembers)
    .where(eq(schema.orgMembers.orgId, found.org.id))
    .all();

  const ids = members.map((m) => m.personId);
  const people = ids.length
    ? db.select().from(schema.people).where(inArray(schema.people.id, ids)).all()
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/td/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-3 text-3xl">Who can edit</h1>
      <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
        Anyone here can run every tournament under{" "}
        <strong>{found.org.name}</strong> — the agent console, score entry, and
        outreach. There are no passwords; they sign in with a link sent to their
        email.
      </p>
      <p className="mono mt-4">
        Add your co-captains and next year&apos;s TD now, not the week of
      </p>

      <AccessList
        org={org}
        tournamentPath={`/td/${org}/${slug}`}
        currentEmail={session.email}
        members={members.map((m) => ({
          email: byId.get(m.personId)?.email ?? "(unknown)",
          name: byId.get(m.personId)?.name ?? null,
          role: m.role,
        }))}
      />
    </main>
  );
}
