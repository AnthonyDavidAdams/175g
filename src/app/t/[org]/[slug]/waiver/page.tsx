import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { formatDateRange, getTeams, getTournament } from "@/lib/tournament";
import SignForm from "./sign-form";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  const name = found?.tournament.name ?? "Tournament";
  return buildMetadata({
    title: `Sign the waiver — ${name}`,
    description: `Sign the participant waiver for ${name}. Required before you play.`,
    path: `/t/${org}/${slug}/waiver`,
    image: found?.tournament.ogImage ?? undefined,
  });
}

export default async function WaiverPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();
  const t = found.tournament;

  const waivers = db
    .select()
    .from(schema.waivers)
    .where(eq(schema.waivers.tournamentId, t.id))
    .all();

  const teams = getTeams(t.id).filter((x) => x.status === "accepted");

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <Link href={`/t/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {t.name}
      </Link>
      <h1 className="display mt-4 text-4xl">Sign the waiver</h1>
      <p className="mt-4 leading-relaxed text-[var(--color-dim)]">
        {[formatDateRange(t.startDate, t.endDate), t.venueName].filter(Boolean).join(" · ")}
      </p>

      {waivers.length === 0 ? (
        <p className="mt-8 text-[var(--color-dim)]">
          No waivers have been published for this tournament yet. Check back, or ask
          your captain.
        </p>
      ) : (
        <SignForm
          org={org}
          slug={slug}
          waivers={waivers.map((w) => ({
            id: w.id,
            title: w.title,
            body: w.body,
            audience: w.audience,
            required: !!w.required,
          }))}
          teams={teams.map((x) => ({ id: x.id, name: x.name }))}
        />
      )}
    </main>
  );
}
