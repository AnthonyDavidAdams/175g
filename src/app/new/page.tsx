import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { can, isRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { canSeeTemplate, getTemplate, parseTemplate, summarize } from "@/lib/templates";
import NewTournamentForm from "./new-form";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Start a tournament",
  description: "Create a tournament on 175g. Free for college and community events.",
  path: "/new",
});

export default async function NewTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; token?: string }>;
}) {
  const { template: templateId, token } = await searchParams;
  const session = await getSession();
  if (!session) {
    const next = templateId
      ? `/new?template=${templateId}${token ? `&token=${token}` : ""}`
      : "/new";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const memberships = db
    .select()
    .from(schema.orgMembers)
    .where(eq(schema.orgMembers.personId, session.personId))
    .all();
  // Only programs where this person may start a tournament. Advisors and
  // staff see their programs elsewhere but can't create under their name.
  const creatable = memberships.filter(
    (m) => isRole(m.role) && can(m.role, "tournament.create"),
  );
  const orgs = creatable.length
    ? db
        .select()
        .from(schema.orgs)
        .where(inArray(schema.orgs.id, creatable.map((m) => m.orgId)))
        .all()
    : [];

  const templateRow = templateId ? getTemplate(templateId) : null;
  const template =
    templateRow && canSeeTemplate(templateRow, session.personId, token)
      ? {
          id: templateRow.id,
          token: token ?? null,
          name: templateRow.name,
          description: templateRow.description,
          summary: summarize(parseTemplate(templateRow)),
        }
      : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <Link href="/dashboard" className="mono hover:text-[var(--color-signal)]">
        ← Your tournaments
      </Link>
      <h1 className="display mt-4 text-4xl">Start a tournament</h1>
      <p className="mt-4 leading-relaxed text-[var(--color-dim)]">
        {template
          ? "Starting from a template. Give it a name and, if you know it, the date — the plan, deadlines, policies and waivers come across, timed to your event."
          : "Just enough to get going. The agent takes it from here and asks for the rest one thing at a time — you don't need dates or a venue yet."}
      </p>

      {template ? (
        <div className="panel mt-6 p-4">
          <p className="mono text-[var(--color-signal)]">Template</p>
          <p className="mt-1 font-medium">{template.name}</p>
          {template.description && (
            <p className="mt-1 text-sm text-[var(--color-dim)]">{template.description}</p>
          )}
          <p className="mono mt-2">
            {template.summary.tasks} tasks · {template.summary.waivers} waivers ·{" "}
            {template.summary.sponsors} sponsor prospects
            {template.summary.hasVenue ? " · venue included" : ""}
            {" · "}
            <Link href="/templates" className="hover:text-[var(--color-signal)]">
              choose another
            </Link>
          </p>
        </div>
      ) : (
        <p className="mono mt-4">
          <Link href="/templates" className="hover:text-[var(--color-signal)]">
            Or start from a template →
          </Link>
        </p>
      )}

      <NewTournamentForm
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
        template={template ? { id: template.id, token: template.token } : null}
      />
    </main>
  );
}
