import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canAdminOrg, getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getTeams, getTournament } from "@/lib/tournament";
import Console from "./console";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "TD console",
  description: "Build and run your tournament with the 175g tournament director.",
  path: "/td",
});

export default async function TdPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const session = await getSession();
  if (!session) redirect(`/login?next=/td/${org}/${slug}`);
  if (!canAdminOrg(session.personId, found.org.id)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <p className="mono">Not authorised</p>
        <h1 className="display mt-4 text-3xl">
          You don&apos;t have access to this tournament.
        </h1>
        <p className="mt-4 text-[var(--color-dim)]">
          Signed in as {session.email}. Ask the tournament owner to add you.
        </p>
      </main>
    );
  }

  const { tournament: t } = found;
  const teams = getTeams(t.id);
  const tasks = db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.tournamentId, t.id))
    .orderBy(asc(schema.tasks.dueDate))
    .all();
  const drafts = db
    .select()
    .from(schema.outreach)
    .where(eq(schema.outreach.tournamentId, t.id))
    .all()
    .filter((o) => o.status === "draft");

  const history = db
    .select()
    .from(schema.agentMessages)
    .where(eq(schema.agentMessages.tournamentId, t.id))
    .orderBy(asc(schema.agentMessages.createdAt))
    .all()
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
    }));

  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((x) => !x.done);
  const late = open.filter((x) => x.dueDate && x.dueDate < today);
  const next = open.filter((x) => x.dueDate && x.dueDate >= today).slice(0, 6);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="mono">{found.org.name}</span>
          <h1 className="display mt-1 text-3xl">{t.name}</h1>
        </div>
        <nav className="flex gap-4">
          <Link href={`/t/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
            Public page
          </Link>
          <Link
            href={`/td/${org}/${slug}/scores`}
            className="mono hover:text-[var(--color-signal)]"
          >
            Score entry
          </Link>
          <Link
            href={`/td/${org}/${slug}/outreach`}
            className="mono hover:text-[var(--color-signal)]"
          >
            Outreach {drafts.length > 0 && `(${drafts.length})`}
          </Link>
          <Link
            href={`/td/${org}/${slug}/fields`}
            className="mono hover:text-[var(--color-signal)]"
          >
            Fields
          </Link>
          <Link
            href={`/td/${org}/${slug}/waivers`}
            className="mono hover:text-[var(--color-signal)]"
          >
            Waivers
          </Link>
          <Link
            href={`/td/${org}/${slug}/access`}
            className="mono hover:text-[var(--color-signal)]"
          >
            Access
          </Link>
          <Link
            href={`/td/${org}/${slug}/page-setup`}
            className="mono hover:text-[var(--color-signal)]"
          >
            Page setup
          </Link>
          <Link
            href={`/td/${org}/${slug}/doc`}
            className="mono hover:text-[var(--color-signal)]"
          >
            Document
          </Link>
        </nav>
      </div>

      <hr className="rule my-6" />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <Console org={org} slug={slug} initial={history} />

        <aside className="space-y-5">
          <div className="panel p-4">
            <p className="mono">State</p>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Dates" v={t.startDate ?? "not set"} />
              <Row k="Venue" v={t.venueName ?? "not set"} />
              <Row k="Fields" v={t.fieldCount ?? "not set"} />
              <Row
                k="Bid fee"
                v={t.bidFee ? `$${(t.bidFee / 100).toFixed(0)}` : "not set"}
              />
              <Row k="Accepted" v={teams.filter((x) => x.status === "accepted").length} />
              <Row k="Paid" v={teams.filter((x) => x.feePaid).length} />
              <Row k="Published" v={t.published ? "yes" : "no"} />
            </dl>
          </div>

          {late.length > 0 && (
            <div className="panel border-[var(--color-alert)]/40 p-4">
              <p className="mono text-[var(--color-alert)]">Late · {late.length}</p>
              <ul className="mt-3 space-y-2 text-sm text-[var(--color-dim)]">
                {late.slice(0, 5).map((x) => (
                  <li key={x.id}>
                    <span className="tabular text-xs">{x.dueDate}</span> {x.task}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel p-4">
            <p className="mono">Next up</p>
            {next.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-dim)]">
                No timeline yet. Ask the agent to generate one.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-[var(--color-dim)]">
                {next.map((x) => (
                  <li key={x.id}>
                    <span className="tabular text-xs">{x.dueDate}</span> {x.task}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--color-faint)]">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
