import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { standingsByPool, type Game } from "./standings";

export function getOrg(slug: string) {
  return db.select().from(schema.orgs).where(eq(schema.orgs.slug, slug)).get();
}

export function getTournament(orgSlug: string, slug: string) {
  const org = getOrg(orgSlug);
  if (!org) return null;
  const tournament = db
    .select()
    .from(schema.tournaments)
    .where(
      and(
        eq(schema.tournaments.orgId, org.id),
        eq(schema.tournaments.slug, slug),
      ),
    )
    .get();
  return tournament ? { org, tournament } : null;
}

export function getTeams(tournamentId: string) {
  return db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, tournamentId))
    .orderBy(asc(schema.teams.seed), asc(schema.teams.name))
    .all();
}

export function getGames(tournamentId: string) {
  return db
    .select()
    .from(schema.games)
    .where(eq(schema.games.tournamentId, tournamentId))
    .orderBy(asc(schema.games.round), asc(schema.games.field))
    .all();
}

export function getAnnouncements(tournamentId: string, limit = 10) {
  return db
    .select()
    .from(schema.announcements)
    .where(eq(schema.announcements.tournamentId, tournamentId))
    .orderBy(desc(schema.announcements.createdAt))
    .limit(limit)
    .all();
}

/** Games with team names resolved, ready for display or the standings engine. */
export function resolvedGames(tournamentId: string) {
  const teams = new Map(getTeams(tournamentId).map((t) => [t.id, t.name]));
  return getGames(tournamentId).map((g) => ({
    ...g,
    homeName: teams.get(g.homeTeamId ?? "") ?? g.homeLabel ?? "TBD",
    awayName: teams.get(g.awayTeamId ?? "") ?? g.awayLabel ?? "TBD",
  }));
}

export function poolStandings(tournamentId: string) {
  const games: Game[] = resolvedGames(tournamentId)
    .filter((g) => g.stage === "pool")
    .map((g) => ({
      pool: g.pool,
      homeTeam: g.homeName,
      awayTeam: g.awayName,
      homeScore: g.homeScore ?? 0,
      awayScore: g.awayScore ?? 0,
      status: g.status,
    }));
  return standingsByPool(games);
}

export function formatDateRange(start?: string | null, end?: string | null) {
  if (!start) return null;
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  if (!end || end === start) return fmt(start);
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}–${e.getUTCDate()}, ${e.getUTCFullYear()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}
