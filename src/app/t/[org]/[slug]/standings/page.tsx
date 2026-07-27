import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getTournament, poolStandings } from "@/lib/tournament";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  const name = found?.tournament.name ?? "Tournament";
  return buildMetadata({
    title: `Standings — ${name}`,
    description: `Live pool standings for ${name}, with USAU tiebreakers applied.`,
    path: `/t/${org}/${slug}/standings`,
    image: found?.tournament.ogImage ?? undefined,
  });
}

export default async function StandingsPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const pools = poolStandings(found.tournament.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href={`/t/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-4 text-4xl">Standings</h1>

      {!pools.length && (
        <p className="mt-8 text-[var(--color-dim)]">No final pool games yet.</p>
      )}

      <div className="mt-10 space-y-10">
        {pools.map(({ pool, ordered, trace }) => (
          <section key={pool}>
            <p className="mono">Pool {pool}</p>
            <div className="scroll-x mt-3">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-line)] text-left">
                    <th className="mono py-2 font-normal">#</th>
                    <th className="mono py-2 font-normal">Team</th>
                    <th className="mono py-2 text-right font-normal">W-L</th>
                    <th className="mono py-2 text-right font-normal">PF</th>
                    <th className="mono py-2 text-right font-normal">PA</th>
                    <th className="mono py-2 text-right font-normal">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((r, i) => (
                    <tr key={r.team} className="border-b border-[var(--color-line)]">
                      <td className="tabular py-2 text-[var(--color-faint)]">{i + 1}</td>
                      <td className="py-2">{r.team}</td>
                      <td className="tabular py-2 text-right">
                        {r.w}-{r.l}
                      </td>
                      <td className="tabular py-2 text-right text-[var(--color-dim)]">
                        {r.pf}
                      </td>
                      <td className="tabular py-2 text-right text-[var(--color-dim)]">
                        {r.pa}
                      </td>
                      <td className="tabular py-2 text-right">
                        {r.diff >= 0 ? "+" : ""}
                        {r.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {trace.filter(Boolean).length > 0 && (
              <details className="mt-3">
                <summary className="mono cursor-pointer list-none hover:text-[var(--color-signal)]">
                  How ties were broken
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--color-line)] bg-black/30 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--color-dim)]">
                  {trace.filter(Boolean).join("\n")}
                </pre>
              </details>
            )}
          </section>
        ))}
      </div>

      <p className="mono mt-12">
        Ties break by the USA Ultimate nine-rule round-robin procedure
      </p>
    </main>
  );
}
