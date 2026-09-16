import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ROLE_BLURB, ROLE_LABEL, can, getAccess } from "@/lib/access";
import { threadFor } from "@/lib/agent/runner";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getTeams, getTournament } from "@/lib/tournament";
import Console from "./console";
import Notes, { type Note } from "./notes";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "TD console",
  description: "Build and run your tournament with the 175g tournament director.",
  path: "/td",
});

type Msg = {
  role: "user" | "assistant";
  content: string;
  toolCalls: { name: string; input: unknown; result: string }[] | null;
  author?: string | null;
};

export default async function TdPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const access = await getAccess(found.org.id);
  if (!access) {
    const session = await (await import("@/lib/auth")).getSession();
    if (!session) redirect(`/login?next=/td/${org}/${slug}`);
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
  const { session, role } = access;
  const isAdvisor = role === "advisor";

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

  // Names for user turns, so a shared thread shows who said what.
  const members = db
    .select({ id: schema.people.id, name: schema.people.name, email: schema.people.email })
    .from(schema.orgMembers)
    .innerJoin(schema.people, eq(schema.people.id, schema.orgMembers.personId))
    .where(eq(schema.orgMembers.orgId, found.org.id))
    .all();
  const nameOf = new Map(members.map((m) => [m.id, m.name ?? m.email]));

  const loadThread = (thread: string): Msg[] =>
    db
      .select()
      .from(schema.agentMessages)
      .where(
        and(
          eq(schema.agentMessages.tournamentId, t.id),
          eq(schema.agentMessages.thread, thread),
        ),
      )
      .orderBy(asc(schema.agentMessages.createdAt))
      .all()
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
        author:
          m.role === "user" && m.personId && m.personId !== session.personId
            ? (nameOf.get(m.personId) ?? null)
            : null,
      }));

  const myThread = threadFor(role, session.personId);
  const history = loadThread(myThread);
  const mainThread = isAdvisor ? loadThread("main") : undefined;

  const notes: Note[] = db
    .select({
      id: schema.advisorNotes.id,
      body: schema.advisorNotes.body,
      createdAt: schema.advisorNotes.createdAt,
      resolvedAt: schema.advisorNotes.resolvedAt,
      personId: schema.advisorNotes.personId,
      name: schema.people.name,
      email: schema.people.email,
    })
    .from(schema.advisorNotes)
    .innerJoin(schema.people, eq(schema.people.id, schema.advisorNotes.personId))
    .where(eq(schema.advisorNotes.tournamentId, t.id))
    .orderBy(desc(schema.advisorNotes.createdAt))
    .all()
    .map((n) => {
      const m = db
        .select({ role: schema.orgMembers.role })
        .from(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, found.org.id),
            eq(schema.orgMembers.personId, n.personId),
          ),
        )
        .get();
      return {
        id: n.id,
        body: n.body,
        author: n.name ?? n.email,
        role: m?.role ?? "member",
        createdAt: n.createdAt,
        resolvedAt: n.resolvedAt,
      };
    });

  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((x) => !x.done);
  const late = open.filter((x) => x.dueDate && x.dueDate < today);
  const next = open.filter((x) => x.dueDate && x.dueDate >= today).slice(0, 6);
  const openNotes = notes.filter((n) => !n.resolvedAt).length;

  const nav: { href: string; label: string; show: boolean }[] = [
    { href: `/dashboard?all=1`, label: "All tournaments", show: true },
    { href: `/t/${org}/${slug}`, label: "Public page", show: true },
    { href: `/td/${org}/${slug}/plan`, label: "Plan", show: true },
    { href: `/td/${org}/${slug}/scores`, label: "Score entry", show: true },
    {
      href: `/td/${org}/${slug}/outreach`,
      label: `Outreach${drafts.length > 0 ? ` (${drafts.length})` : ""}`,
      show: true,
    },
    { href: `/td/${org}/${slug}/fields`, label: "Fields", show: true },
    { href: `/td/${org}/${slug}/waivers`, label: "Waivers", show: true },
    { href: `/td/${org}/${slug}/access`, label: "Access", show: true },
    { href: `/td/${org}/${slug}/page-setup`, label: "Page setup", show: true },
    { href: `/td/${org}/${slug}/doc`, label: "Document", show: true },
    { href: `/td/${org}/${slug}/template`, label: "Save as template", show: can(role, "templates.save") },
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="mono">
            {found.org.name} · you are {ROLE_LABEL[role].toLowerCase()}
          </span>
          <h1 className="display mt-1 text-3xl">{t.name}</h1>
        </div>
        <nav className="flex flex-wrap gap-4">
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="mono hover:text-[var(--color-signal)]"
              >
                {n.label}
              </Link>
            ))}
        </nav>
      </div>

      {(isAdvisor || role === "staff") && (
        <p className="mono mt-3 normal-case tracking-normal text-[var(--color-dim)]">
          {ROLE_BLURB[role]}
        </p>
      )}

      <hr className="rule my-6" />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <Console
          org={org}
          slug={slug}
          initial={history}
          role={role}
          mainThread={mainThread}
        />

        <aside className="space-y-5">
          {(openNotes > 0 || isAdvisor || role === "staff") && (
            <Notes
              org={org}
              slug={slug}
              initial={notes}
              canResolve={can(role, "tasks")}
              meLabel={session.name ?? session.email}
              compose={isAdvisor ? "prominent" : "quiet"}
            />
          )}

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
            <Link href={`/td/${org}/${slug}/plan`} className="mono hover:text-[var(--color-signal)]">
              Next up →
            </Link>
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

          {!isAdvisor && role !== "staff" && openNotes === 0 && (
            <Notes
              org={org}
              slug={slug}
              initial={notes}
              canResolve
              meLabel={session.name ?? session.email}
              compose="quiet"
            />
          )}
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
