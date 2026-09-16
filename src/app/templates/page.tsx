import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { listTemplatesFor, parseTemplate, summarize } from "@/lib/templates";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Event templates",
  description:
    "Start your tournament from a plan that already worked: policies, deadlines, waivers, task list and sponsor prospects from programs that have run it before.",
  path: "/templates",
});

export default async function TemplatesPage() {
  const session = await getSession();
  const rows = listTemplatesFor(session?.personId ?? null);

  const orgIds = [...new Set(rows.map((r) => r.orgId).filter((x): x is string => !!x))];
  const orgs = orgIds.length
    ? db.select().from(schema.orgs).where(inArray(schema.orgs.id, orgIds)).all()
    : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  const myOrgIds = session
    ? new Set(
        db
          .select({ orgId: schema.orgMembers.orgId })
          .from(schema.orgMembers)
          .where(eq(schema.orgMembers.personId, session.personId))
          .all()
          .map((m) => m.orgId),
      )
    : new Set<string>();

  const mine = rows.filter((r) => r.orgId && myOrgIds.has(r.orgId));
  const shared = rows.filter((r) => !r.orgId || !myOrgIds.has(r.orgId));

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link
        href={session ? "/dashboard" : "/"}
        className="mono hover:text-[var(--color-signal)]"
      >
        ← {session ? "Your tournaments" : "175g"}
      </Link>
      <h1 className="display mt-4 text-4xl">Event templates</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-[var(--color-dim)]">
        A template is a tournament with the edition taken out: no teams, no games,
        no dates. What stays is the part that took someone years to learn — the
        refund policy, the waiver text, the task list with real lead times, which
        sponsors to approach. Start from one and the agent adjusts it to your event.
      </p>

      {mine.length > 0 && (
        <Section title="Your programs' templates" rows={mine} orgName={orgName} />
      )}
      <Section
        title={mine.length ? "Shared and built-in" : "Available templates"}
        rows={shared}
        orgName={orgName}
      />

      {!session && (
        <p className="mt-10 text-sm text-[var(--color-dim)]">
          <Link href="/login?next=/templates" className="underline hover:text-[var(--color-signal)]">
            Sign in
          </Link>{" "}
          to start a tournament from one of these, or to see templates shared with
          your program.
        </p>
      )}
    </main>
  );
}

function Section({
  title,
  rows,
  orgName,
}: {
  title: string;
  rows: ReturnType<typeof listTemplatesFor>;
  orgName: Map<string, string>;
}) {
  return (
    <section className="mt-10">
      <p className="mono">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-dim)]">None yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => {
            const s = summarize(parseTemplate(r));
            return (
              <li key={r.id}>
                <Link
                  href={`/templates/${r.id}`}
                  className="panel panel-hover block p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="font-medium">{r.name}</span>
                    <span className="mono">
                      {r.orgId ? orgName.get(r.orgId) ?? "a program" : "built-in"}
                      {r.useCount > 0 && ` · used ${r.useCount}×`}
                    </span>
                  </div>
                  {r.description && (
                    <p className="mt-2 text-sm leading-relaxed text-[var(--color-dim)]">
                      {r.description}
                    </p>
                  )}
                  <p className="mono mt-3">
                    {s.durationDays}-day
                    {s.division ? ` · ${s.division}` : ""}
                    {s.teamTarget ? ` · ${s.teamTarget} teams` : ""}
                    {s.fieldCount ? ` · ${s.fieldCount} fields` : ""}
                    {` · ${s.tasks} tasks · ${s.waivers} waivers`}
                    {s.hasVenue ? ` · venue included` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
