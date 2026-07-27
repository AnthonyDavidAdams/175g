import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getTeams, getTournament } from "@/lib/tournament";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  const name = found?.tournament.name ?? "Tournament";
  return buildMetadata({
    title: `Teams — ${name}`,
    description: `The field for ${name}.`,
    path: `/t/${org}/${slug}/teams`,
    image: found?.tournament.ogImage ?? undefined,
  });
}

export default async function TeamsPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const teams = getTeams(found.tournament.id);
  const accepted = teams.filter((t) => t.status === "accepted");
  const waitlisted = teams.filter((t) => t.status === "waitlisted");

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <Link href={`/t/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-4 text-4xl">The field</h1>

      {!accepted.length && (
        <p className="mt-8 text-[var(--color-dim)]">
          The field hasn&apos;t been announced yet.
        </p>
      )}

      <ul className="mt-10 divide-y divide-[var(--color-line)]">
        {accepted.map((t) => (
          <li key={t.id} className="flex items-baseline justify-between gap-4 py-3">
            <span>
              {t.seed && (
                <span className="tabular mr-3 text-[var(--color-faint)]">{t.seed}</span>
              )}
              {t.name}
            </span>
            <span className="mono">{t.pool ? `Pool ${t.pool}` : t.school}</span>
          </li>
        ))}
      </ul>

      {waitlisted.length > 0 && (
        <section className="mt-12">
          <p className="mono">Waitlist</p>
          <ul className="mt-3 space-y-1 text-[var(--color-dim)]">
            {waitlisted.map((t) => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
