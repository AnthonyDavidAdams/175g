import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, getAccess } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getTournament } from "@/lib/tournament";
import { LEGAL_DISCLAIMER, TEMPLATES } from "@/lib/waiverTemplates";
import WaiverEditor from "./waiver-editor";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Waivers",
  description: "Edit the waivers participants sign.",
  path: "/td",
});

export default async function WaiversPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const access = await getAccess(found.org.id);
  if (!access) redirect(`/login?next=/td/${org}/${slug}/waivers`);
  const readOnly = !can(access.role, "waivers");

  const waivers = db
    .select()
    .from(schema.waivers)
    .where(eq(schema.waivers.tournamentId, found.tournament.id))
    .all();

  const signatures = db
    .select()
    .from(schema.waiverSignatures)
    .where(eq(schema.waiverSignatures.tournamentId, found.tournament.id))
    .all();

  const counts: Record<string, number> = {};
  for (const s of signatures) {
    counts[s.waiverId] = (counts[s.waiverId] ?? 0) + 1;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/td/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-3 text-3xl">Waivers</h1>
      <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
        Participants sign at{" "}
        <Link
          href={`/t/${org}/${slug}/waiver`}
          className="underline hover:text-[var(--color-signal)]"
        >
          /t/{org}/{slug}/waiver
        </Link>
        . Edit the text freely — the agent can rewrite these for you too. Editing
        bumps the version; signatures already collected keep a snapshot of exactly
        what that person agreed to.
      </p>
      <p className="panel mt-5 p-4 text-sm text-[var(--color-dim)]">
        {LEGAL_DISCLAIMER}
      </p>

      {readOnly ? (
        <div className="mt-8 space-y-4">
          <p className="mono">View only — waiver text is the TD&apos;s to change</p>
          {waivers.length === 0 && (
            <p className="text-[var(--color-dim)]">No waivers yet.</p>
          )}
          {waivers.map((w) => (
            <details key={w.id} className="panel p-5">
              <summary className="cursor-pointer">
                <span className="font-medium">{w.title}</span>
                <span className="mono ml-3">
                  {w.audience} · v{w.version} · {counts[w.id] ?? 0} signed
                </span>
              </summary>
              <pre className="mt-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-dim)]">
                {w.body}
              </pre>
            </details>
          ))}
        </div>
      ) : (
      <WaiverEditor
        org={org}
        slug={slug}
        templates={TEMPLATES.map((t) => ({
          key: t.key,
          title: t.title,
          description: t.description,
        }))}
        waivers={waivers.map((w) => ({
          id: w.id,
          title: w.title,
          body: w.body,
          audience: w.audience,
          version: w.version,
          required: !!w.required,
          signatureCount: counts[w.id] ?? 0,
        }))}
      />
      )}
    </main>
  );
}
