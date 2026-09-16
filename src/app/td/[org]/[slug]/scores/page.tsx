import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, getAccess } from "@/lib/access";
import { buildMetadata } from "@/lib/seo";
import { getTournament, resolvedGames } from "@/lib/tournament";
import ScoreEntry from "./score-entry";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Score entry",
  description: "Enter scores from the fields.",
  path: "/td",
});

export default async function ScoresPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const access = await getAccess(found.org.id);
  if (!access) redirect(`/login?next=/td/${org}/${slug}/scores`);
  const readOnly = !can(access.role, "scores");

  const games = resolvedGames(found.tournament.id).map((g) => ({
    id: g.id,
    gameCode: g.gameCode,
    round: g.round,
    field: g.field,
    startTime: g.startTime,
    pool: g.pool,
    homeName: g.homeName,
    awayName: g.awayName,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    status: g.status,
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/td/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-3 text-3xl">Score entry</h1>
      <p className="mono mt-2">
        {readOnly
          ? "View only — your role here can't enter scores"
          : "Collect actively — don't wait for teams to report. Click a field number to move a game."}
      </p>

      {games.length === 0 ? (
        <p className="mt-8 text-[var(--color-dim)]">
          No schedule yet. Ask the agent to generate one.
        </p>
      ) : (
        <ScoreEntry games={games} readOnly={readOnly} />
      )}
    </main>
  );
}
