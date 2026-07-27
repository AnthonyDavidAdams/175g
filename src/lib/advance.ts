import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { standings, type Game } from "./standings";

/**
 * Resolve scheduled-game placeholders into real teams as results land.
 *
 * Without this, a bracket generated before pool play sits on "TBD" forever and
 * the TD ends up retyping matchups by hand on Sunday morning. Run after every
 * score change, from any source (web, Telegram, agent).
 *
 * Placeholders:
 *   "W:G12" / "L:G12" — winner or loser of the game with that code
 *   "A1"              — pool A, first place, once that pool is complete
 *
 * Pool places resolve only when every game in the pool is final, because the
 * nine-rule tiebreak procedure can reorder a pool right up to the last result.
 */

const RESULT_REF = /^([WL]):(G\d+)$/i;
const POOL_PLACE = /^([A-Z])(\d{1,2})$/;

export function advanceTournament(tournamentId: string) {
  const games = db
    .select()
    .from(schema.games)
    .where(eq(schema.games.tournamentId, tournamentId))
    .all();
  const teams = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, tournamentId))
    .all();

  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  const idByName = new Map(teams.map((t) => [t.name, t.id]));
  const byCode = new Map(games.filter((g) => g.gameCode).map((g) => [g.gameCode!, g]));

  // Pool standings, computed only for pools whose games are all final.
  const poolOrder = new Map<string, string[]>();
  const poolGames = new Map<string, typeof games>();
  for (const g of games) {
    if (g.stage !== "pool" || !g.pool) continue;
    poolGames.set(g.pool, [...(poolGames.get(g.pool) ?? []), g]);
  }
  for (const [pool, list] of poolGames) {
    if (!list.every((g) => g.status === "final")) continue;
    const input: Game[] = list.map((g) => ({
      pool,
      homeTeam: nameById.get(g.homeTeamId ?? "") ?? "?",
      awayTeam: nameById.get(g.awayTeamId ?? "") ?? "?",
      homeScore: g.homeScore ?? 0,
      awayScore: g.awayScore ?? 0,
      status: g.status,
    }));
    poolOrder.set(pool, standings(input).ordered.map((r) => r.team));
  }

  const resolve = (label: string | null): string | null => {
    if (!label) return null;

    const rr = label.match(RESULT_REF);
    if (rr) {
      const source = byCode.get(rr[2].toUpperCase());
      if (!source || source.status !== "final") return null;
      const homeWon = (source.homeScore ?? 0) > (source.awayScore ?? 0);
      const winner = homeWon ? source.homeTeamId : source.awayTeamId;
      const loser = homeWon ? source.awayTeamId : source.homeTeamId;
      return rr[1].toUpperCase() === "W" ? (winner ?? null) : (loser ?? null);
    }

    const pp = label.match(POOL_PLACE);
    if (pp) {
      const order = poolOrder.get(pp[1]);
      if (!order) return null;
      const name = order[Number(pp[2]) - 1];
      return name ? (idByName.get(name) ?? null) : null;
    }

    // A literal team name that was stored as a label.
    return idByName.get(label) ?? null;
  };

  let resolved = 0;
  for (const g of games) {
    const patch: Record<string, unknown> = {};

    if (!g.homeTeamId && g.homeLabel) {
      const id = resolve(g.homeLabel);
      if (id) {
        patch.homeTeamId = id;
        patch.homeLabel = null;
      }
    }
    if (!g.awayTeamId && g.awayLabel) {
      const id = resolve(g.awayLabel);
      if (id) {
        patch.awayTeamId = id;
        patch.awayLabel = null;
      }
    }

    if (Object.keys(patch).length) {
      db.update(schema.games)
        .set(patch)
        .where(eq(schema.games.id, g.id))
        .run();
      resolved++;
    }
  }

  return { resolved };
}
