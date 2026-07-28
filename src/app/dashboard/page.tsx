import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
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

export default async function Dashboard() {
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

  const orgBySlug = new Map(orgs.map((o) => [o.id, o]));

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
                    <span className="mono mt-1 block">{org.name}</span>
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

      <p className="mono mt-12">
        <Link href="/" className="hover:text-[var(--color-signal)]">
          ← 175g
        </Link>
      </p>
    </main>
  );
}
