import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROLE_LABEL, isRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { formatDateRange } from "@/lib/tournament";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Your tournaments",
  description: "Tournaments you run on 175g.",
  path: "/dashboard",
});

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard");

  const memberships = db
    .select()
    .from(schema.orgMembers)
    .where(eq(schema.orgMembers.personId, session.personId))
    .all();

  const orgIds = memberships.map((m) => m.orgId);
  const orgs = orgIds.length
    ? db.select().from(schema.orgs).where(inArray(schema.orgs.id, orgIds)).all()
    : [];
  const tournaments = orgIds.length
    ? db
        .select()
        .from(schema.tournaments)
        .where(inArray(schema.tournaments.orgId, orgIds))
        .all()
    : [];

  // Agent-first: one tournament means one console. Go straight there.
  // ?all=1 shows the list anyway (the "Your tournaments" link in the console).
  if (tournaments.length === 1 && !(await searchParams).all) {
    const only = tournaments[0];
    const org = orgs.find((o) => o.id === only.orgId);
    if (org) redirect(`/td/${org.slug}/${only.slug}`);
  }

  const orgBySlug = new Map(orgs.map((o) => [o.id, o]));
  const roleByOrg = new Map(
    memberships.map((m) => [m.orgId, isRole(m.role) ? ROLE_LABEL[m.role] : m.role]),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="mono">{session.email}</span>
          <h1 className="display mt-3 text-4xl">Your tournaments</h1>
        </div>
        <Link href="/new" className="btn btn-primary">
          Start a tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <div className="panel mt-10 p-6">
          <p className="mono">Nothing yet</p>
          <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
            Start one and the agent will walk you through it — you only need a name
            to begin. Free for college and community tournaments.
          </p>
          <p className="mt-4 text-sm text-[var(--color-dim)]">
            If a teammate already set one up, ask them to add{" "}
            <span className="tabular">{session.email}</span> under Access.
          </p>
          <Link href="/new" className="btn btn-primary mt-5">
            Start a tournament
          </Link>
        </div>
      ) : (
        <ul className="mt-10 space-y-3">
          {tournaments.map((t) => {
            const org = orgBySlug.get(t.orgId);
            if (!org) return null;
            return (
              <li key={t.id}>
                <Link
                  href={`/td/${org.slug}/${t.slug}`}
                  className="panel panel-hover flex items-baseline justify-between gap-4 p-5"
                >
                  <span>
                    <span className="block font-medium">{t.name}</span>
                    <span className="mono mt-1 block">
                      {org.name} · {roleByOrg.get(org.id)?.toLowerCase()}
                    </span>
                  </span>
                  <span className="mono">
                    {formatDateRange(t.startDate, t.endDate) ?? "dates TBD"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mono mt-12 flex gap-6">
        <Link href="/" className="hover:text-[var(--color-signal)]">
          ← 175g
        </Link>
        <Link href="/templates" className="hover:text-[var(--color-signal)]">
          Event templates →
        </Link>
      </p>
    </main>
  );
}
