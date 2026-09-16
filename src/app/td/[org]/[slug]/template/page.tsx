import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, getAccess } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { buildTemplate, summarize } from "@/lib/templates";
import { getTournament } from "@/lib/tournament";
import SaveTemplateForm from "./save-template-form";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Save as template",
  description: "Package this tournament so next year, or another program, starts from what worked.",
  path: "/td",
});

export default async function SaveTemplatePage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const access = await getAccess(found.org.id);
  if (!access) redirect(`/login?next=/td/${org}/${slug}/template`);
  if (!can(access.role, "templates.save")) notFound();

  const t = found.tournament;
  const preview = summarize(buildTemplate(t.id, { includeVenue: true }));

  const existing = db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.sourceTournamentId, t.id))
    .orderBy(desc(schema.templates.createdAt))
    .all();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/td/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {t.name}
      </Link>
      <h1 className="display mt-3 text-3xl">Save as template</h1>
      <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
        A template keeps what took work to get right and drops what belongs to this
        edition. Next year&apos;s TD, or another program, starts from it instead of
        from nothing.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <p className="mono text-[var(--color-signal)]">Travels</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-dim)]">
            <li>{preview.tasks} tasks, as offsets from the event date</li>
            <li>Deadlines, likewise as offsets</li>
            <li>{preview.waivers} waiver texts</li>
            <li>{preview.hasRefundPolicy ? "The refund policy" : "No refund policy yet"}</li>
            <li>{preview.sponsors} sponsor prospects — organisations, not contacts</li>
            <li>Format facts: division, team target, field count, bid fee</li>
            <li>Venue, sites and {preview.fields} mapped fields — if you choose</li>
          </ul>
        </div>
        <div className="panel p-4">
          <p className="mono">Stays behind</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-dim)]">
            <li>Teams and everything about them</li>
            <li>The schedule and every result</li>
            <li>Dates</li>
            <li>Captain and sponsor contacts</li>
            <li>Payment handles</li>
            <li>Signatures, rosters, consent</li>
            <li>Photos and the agent conversation</li>
          </ul>
        </div>
      </div>

      <SaveTemplateForm
        org={org}
        slug={slug}
        defaultName={`${t.name}${t.year ? ` ${t.year}` : ""}`}
        canPublish={can(access.role, "templates.manage")}
      />

      {existing.length > 0 && (
        <section className="mt-12">
          <p className="mono">Already saved from this tournament</p>
          <ul className="mt-3 divide-y divide-[var(--color-line)]">
            {existing.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <Link href={`/templates/${e.id}`} className="hover:text-[var(--color-signal)]">
                  {e.name}
                </Link>
                <span className="mono">
                  {e.visibility}
                  {e.useCount > 0 && ` · used ${e.useCount}×`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
