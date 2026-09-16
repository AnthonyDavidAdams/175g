import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, getAccess } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getTournament } from "@/lib/tournament";
import Queue from "./queue";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Outreach queue",
  description: "Review and approve drafted outreach before it sends.",
  path: "/td",
});

export default async function OutreachPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const access = await getAccess(found.org.id);
  if (!access) redirect(`/login?next=/td/${org}/${slug}/outreach`);
  const readOnly = !can(access.role, "outreach");

  const drafts = db
    .select()
    .from(schema.outreach)
    .where(eq(schema.outreach.tournamentId, found.tournament.id))
    .orderBy(desc(schema.outreach.createdAt))
    .all();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/td/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-3 text-3xl">Outreach queue</h1>
      <p className="mono mt-2">Nothing sends until you approve it</p>
      <Queue drafts={drafts} readOnly={readOnly} />
    </main>
  );
}
