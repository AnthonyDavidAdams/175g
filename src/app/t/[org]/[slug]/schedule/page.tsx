import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getTournament, resolvedGames } from "@/lib/tournament";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  const name = found?.tournament.name ?? "Tournament";
  return buildMetadata({
    title: `Schedule — ${name}`,
    description: `Full schedule and live scores for ${name}.`,
    path: `/t/${org}/${slug}/schedule`,
    image: found?.tournament.ogImage ?? undefined,
  });
}

export default async function SchedulePage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const games = resolvedGames(found.tournament.id);

  const byDayRound = new Map<string, typeof games>();
  for (const g of games) {
    const key = `${g.day ?? 1}|${g.round ?? 1}`;
    byDayRound.set(key, [...(byDayRound.get(key) ?? []), g]);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link
        href={`/t/${org}/${slug}`}
        className="text-sm text-[var(--color-muted)] hover:text-[var(--color-accent)]"
      >
        ← {found.tournament.name}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Schedule</h1>

      {!games.length && (
        <p className="mt-8 text-[var(--color-muted)]">
          The schedule hasn&apos;t been published yet.
        </p>
      )}

      <div className="mt-10 space-y-10">
        {[...byDayRound.entries()]
          .sort(([a], [b]) => {
            const [da, ra] = a.split("|").map(Number);
            const [dbb, rb] = b.split("|").map(Number);
            return da - dbb || ra - rb;
          })
          .map(([key, roundGames]) => {
            const [day, round] = key.split("|");
            return (
              <section key={key}>
                <h2 className="text-sm font-medium tracking-widest uppercase text-[var(--color-muted)]">
                  Day {day} · Round {round} · {roundGames[0]?.startTime}
                </h2>
                <div className="scroll-x mt-3">
                  <table className="w-full min-w-[34rem] text-sm">
                    <tbody>
                      {roundGames
                        .sort((a, b) => Number(a.field) - Number(b.field))
                        .map((g) => {
                          const final = g.status === "final";
                          const homeWon =
                            final && (g.homeScore ?? 0) > (g.awayScore ?? 0);
                          const awayWon =
                            final && (g.awayScore ?? 0) > (g.homeScore ?? 0);
                          return (
                            <tr
                              key={g.id}
                              className="border-b border-black/5 dark:border-white/10"
                            >
                              <td className="py-2 pr-4 whitespace-nowrap text-[var(--color-muted)]">
                                F{g.field}
                              </td>
                              <td className="py-2 pr-3 text-xs whitespace-nowrap text-[var(--color-muted)]">
                                {g.pool}
                              </td>
                              <td
                                className={`py-2 pr-2 ${homeWon ? "font-semibold" : ""}`}
                              >
                                {g.homeName}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {final ? g.homeScore : ""}
                              </td>
                              <td className="px-2 text-center text-[var(--color-muted)]">
                                {final ? "–" : "v"}
                              </td>
                              <td className="py-2 text-left tabular-nums">
                                {final ? g.awayScore : ""}
                              </td>
                              <td
                                className={`py-2 pl-2 ${awayWon ? "font-semibold" : ""}`}
                              >
                                {g.awayName}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
      </div>
    </main>
  );
}
