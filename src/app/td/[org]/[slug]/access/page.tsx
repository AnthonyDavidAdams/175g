import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ROLE_BLURB, ROLE_LABEL, ROLES, can, getAccess } from "@/lib/access";
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

  const access = await getAccess(found.org.id);
  if (!access) redirect(`/login?next=/td/${org}/${slug}/access`);
  const { session, role } = access;
  const canEdit = can(role, "access");

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
        Access is to the program, <strong>{found.org.name}</strong>, so it carries to
        next year&apos;s edition. There are no passwords; everyone signs in with a link
        sent to their email.
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        {ROLES.map((r) => (
          <div key={r} className="panel p-3">
            <dt className="mono">{ROLE_LABEL[r]}</dt>
            <dd className="mt-1 text-sm text-[var(--color-dim)]">{ROLE_BLURB[r]}</dd>
          </div>
        ))}
      </dl>

      <p className="mono mt-6">
        {canEdit
          ? "Add your co-captains, your alumni advisor, and next year's TD now, not the week of"
          : `View only — your role here is ${ROLE_LABEL[role].toLowerCase()}`}
      </p>

      <AccessList
        org={org}
        tournamentPath={`/td/${org}/${slug}`}
        currentEmail={session.email}
        actorRole={role}
        members={members.map((m) => ({
          email: byId.get(m.personId)?.email ?? "(unknown)",
          name: byId.get(m.personId)?.name ?? null,
          role: m.role,
        }))}
      />
    </main>
  );
}
