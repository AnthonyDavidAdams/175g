import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, getRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { canSeeTemplate, getTemplate, parseTemplate, summarize } from "@/lib/templates";
import TemplateActions from "./template-actions";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const row = getTemplate(id);
  return buildMetadata({
    title: row ? `${row.name} — template` : "Template",
    description:
      row?.description ??
      "An event template on 175g: the plan, policies and waivers of a tournament that already worked.",
    path: `/templates/${id}`,
  });
}

export default async function TemplatePage({ params, searchParams }: Params) {
  const { id } = await params;
  const { token } = await searchParams;
  const row = getTemplate(id);
  if (!row) notFound();

  const session = await getSession();
  if (!canSeeTemplate(row, session?.personId ?? null, token)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <p className="mono">Private template</p>
        <h1 className="display mt-4 text-3xl">This template isn&apos;t shared with you.</h1>
        <p className="mt-4 text-[var(--color-dim)]">
          {session
            ? "Ask whoever made it for the share link, or to add you to their program."
            : "Sign in if you belong to the program that made it, or ask for the share link."}
        </p>
        {!session && (
          <Link href={`/login?next=/templates/${id}`} className="btn btn-primary mt-6">
            Sign in
          </Link>
        )}
      </main>
    );
  }

  const tpl = parseTemplate(row);
  const s = summarize(tpl);
  const org = row.orgId
    ? db.select().from(schema.orgs).where(eq(schema.orgs.id, row.orgId)).get()
    : null;
  const source = row.sourceTournamentId
    ? db
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, row.sourceTournamentId))
        .get()
    : null;

  const myRole = session && row.orgId ? getRole(session.personId, row.orgId) : null;
  const canManage = !!row.orgId && can(myRole, "templates.manage");

  const byPhase = new Map<string, typeof tpl.tasks>();
  for (const t of tpl.tasks) {
    const k = t.phase ?? "Other";
    byPhase.set(k, [...(byPhase.get(k) ?? []), t]);
  }

  const startHref =
    `/new?template=${row.id}` + (token ? `&token=${encodeURIComponent(token)}` : "");

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/templates" className="mono hover:text-[var(--color-signal)]">
        ← Templates
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="mono">
            {org ? `From ${org.name}` : "Built-in"}
            {source && source.published ? (
              <>
                {" · "}
                <Link
                  href={`/t/${org?.slug}/${source.slug}`}
                  className="hover:text-[var(--color-signal)]"
                >
                  see the source event
                </Link>
              </>
            ) : null}
            {row.useCount > 0 && ` · used ${row.useCount}×`}
          </span>
          <h1 className="display mt-2 text-4xl">{row.name}</h1>
          {row.description && (
            <p className="mt-4 max-w-2xl leading-relaxed text-[var(--color-dim)]">
              {row.description}
            </p>
          )}
        </div>
        <Link
          href={session ? startHref : `/login?next=${encodeURIComponent(startHref)}`}
          className="btn btn-primary"
        >
          Start a tournament from this
        </Link>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        <Stat label="Days" value={String(s.durationDays)} />
        <Stat label="Teams" value={s.teamTarget ? String(s.teamTarget) : "—"} />
        <Stat label="Fields" value={s.fieldCount ? String(s.fieldCount) : "—"} />
        <Stat label="Bid fee" value={s.bidFeeUSD != null ? `$${s.bidFeeUSD}` : "—"} />
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Row k="Division" v={tpl.event.division ?? "not fixed"} />
        <Row k="Surface" v={tpl.event.surface ?? "not fixed"} />
        <Row
          k="Sanctioned"
          v={tpl.event.sanctioned == null ? "undecided" : tpl.event.sanctioned ? "yes" : "no"}
        />
        <Row k="Games guaranteed" v={tpl.event.gamesGuaranteed ?? "—"} />
        <Row
          k="Applications close"
          v={tpl.offsets.applyDeadline != null ? `${tpl.offsets.applyDeadline} days out` : "—"}
        />
        <Row
          k="Payment due"
          v={tpl.offsets.paymentDeadline != null ? `${tpl.offsets.paymentDeadline} days out` : "—"}
        />
        <Row
          k="Venue"
          v={s.hasVenue ? `${s.venueName ?? "included"}${s.city ? `, ${s.city}` : ""} · ${s.fields} fields mapped` : "not included"}
        />
        <Row k="Sponsor prospects" v={s.sponsors} />
      </dl>

      {tpl.event.refundPolicy && (
        <section className="mt-10">
          <p className="mono">Refund policy</p>
          <pre className="mt-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-dim)]">
            {tpl.event.refundPolicy}
          </pre>
        </section>
      )}

      {tpl.tasks.length > 0 && (
        <section className="mt-10">
          <p className="mono">Plan · {tpl.tasks.length} tasks</p>
          <div className="mt-3 space-y-5">
            {[...byPhase.entries()].map(([phase, tasks]) => (
              <div key={phase}>
                <p className="mono mb-1">{phase}</p>
                <ul className="divide-y divide-[var(--color-line)]">
                  {tasks
                    .slice()
                    .sort((a, b) => (b.daysBefore ?? -1) - (a.daysBefore ?? -1))
                    .map((t, i) => (
                      <li key={i} className="flex items-baseline gap-3 py-1.5 text-sm">
                        <span className="tabular w-20 shrink-0 text-xs text-[var(--color-faint)]">
                          {t.daysBefore != null
                            ? t.daysBefore >= 14
                              ? `${Math.round(t.daysBefore / 7)} wks`
                              : `${t.daysBefore} days`
                            : "—"}
                        </span>
                        <span className="flex-1">
                          {t.task}
                          {t.hard && <span className="mono ml-2 normal-case tracking-normal">hard</span>}
                        </span>
                        <span className="mono w-24 shrink-0 truncate text-right">{t.owner}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {tpl.waivers.length > 0 && (
        <section className="mt-10">
          <p className="mono">Waivers · {tpl.waivers.length}</p>
          <div className="mt-3 space-y-3">
            {tpl.waivers.map((w, i) => (
              <details key={i} className="panel p-4">
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium">{w.title}</span>
                  <span className="mono ml-3">{w.audience}{w.required ? " · required" : ""}</span>
                </summary>
                <pre className="mt-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-dim)]">
                  {w.body}
                </pre>
              </details>
            ))}
          </div>
        </section>
      )}

      {tpl.sponsors.length > 0 && (
        <section className="mt-10">
          <p className="mono">Sponsor prospects · {tpl.sponsors.length}</p>
          <ul className="mt-3 divide-y divide-[var(--color-line)] text-sm">
            {tpl.sponsors.map((sp, i) => (
              <li key={i} className="flex justify-between gap-4 py-1.5">
                <span>{sp.org}</span>
                <span className="mono">
                  {sp.type}
                  {sp.tier ? ` · ${sp.tier}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mono mt-2 normal-case tracking-normal">
            Organisations only. Contacts never travel with a template.
          </p>
        </section>
      )}

      <section className="mt-12">
        <TemplateActions
          id={row.id}
          name={row.name}
          description={row.description ?? ""}
          visibility={row.visibility as "org" | "link" | "public"}
          shareToken={row.shareToken}
          canManage={canManage}
          startHref={startHref}
          signedIn={!!session}
        />
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <div className="tabular text-2xl text-[var(--color-signal)]">{value}</div>
      <div className="mono mt-1">{label}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[var(--color-line)] py-1.5">
      <dt className="text-[var(--color-faint)]">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
