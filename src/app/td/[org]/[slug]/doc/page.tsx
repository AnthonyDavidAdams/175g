import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canAdminOrg, getSession } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import { getTournament } from "@/lib/tournament";
import { toDoc } from "@/lib/tournamentDoc";
import DocEditor from "./doc-editor";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Tournament document",
  description: "The whole tournament as one editable JSON document.",
  path: "/td",
});

export default async function DocPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const session = await getSession();
  if (!session) redirect(`/login?next=/td/${org}/${slug}/doc`);
  if (!canAdminOrg(session.personId, found.org.id)) notFound();

  const doc = toDoc(found.tournament.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href={`/td/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-3 text-3xl">Tournament document</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-[var(--color-dim)]">
        The whole event as one JSON object — venue, sites, fields with their real
        geometry, teams, every game, waivers, deadlines, sponsors. Edit it and apply
        it back. Anything a generator produced, you can overwrite here.
      </p>
      <p className="mono mt-3 normal-case tracking-normal">
        Contains no personal data — no rosters, emails, or signatures — so it is safe
        to save, share, or commit to a repo.
      </p>

      <DocEditor org={org} slug={slug} initial={JSON.stringify(doc, null, 2)} />
    </main>
  );
}
