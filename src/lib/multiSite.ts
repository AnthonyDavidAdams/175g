/**
 * Tournaments spanning more than one venue.
 *
 * The map is the easy half. The half that ruins a Saturday is the schedule: a
 * team sent across town between consecutive rounds arrives late, and the round
 * they arrive into starts late for everybody on that field. So travel time is a
 * scheduling constraint here, not a note on a webpage.
 *
 * Two rules, in order of how much trouble they save:
 *
 *   1. Keep a pool at one site. If every team in a pool plays all its pool
 *      games at one venue, nobody moves during pool play at all. This is worth
 *      more than any amount of clever gap-finding.
 *
 *   2. When a team must move — usually into brackets — leave a gap. A move
 *      needs travel time plus warm-up plus the inevitable parking hunt, which
 *      in practice means at least one idle round unless the sites are minutes
 *      apart.
 */

export type Site = {
  id: string;
  name: string;
  travelMinutes: number;
  isPrimary?: boolean;
};

export type ScheduledGame = {
  gameId: string;
  round: number;
  siteId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  pool?: string | null;
  startTime?: string | null;
};

/** Buffer beyond raw travel time: packing up, parking, finding the field, warming up. */
const TURNAROUND_MINUTES = 20;

export function travelWarnings(
  games: ScheduledGame[],
  sites: Site[],
  opts: { roundMinutes: number },
): string[] {
  const warnings: string[] = [];
  if (sites.length < 2) return warnings;

  const siteById = new Map(sites.map((s) => [s.id, s]));
  const travelBetween = (a: string, b: string) => {
    if (a === b) return 0;
    const sa = siteById.get(a);
    const sb = siteById.get(b);
    if (!sa || !sb) return 0;
    // Times are stored relative to the primary site. Two satellites are, at
    // worst, the sum of their legs; assume the pessimistic case rather than
    // inventing a shortcut that may not exist.
    if (sa.isPrimary || sb.isPrimary) {
      return Math.max(sa.travelMinutes, sb.travelMinutes);
    }
    return sa.travelMinutes + sb.travelMinutes;
  };

  // --- 1. Does any pool span sites? ---------------------------------------
  const poolSites = new Map<string, Set<string>>();
  for (const g of games) {
    if (!g.pool || !g.siteId) continue;
    const set = poolSites.get(g.pool) ?? new Set<string>();
    set.add(g.siteId);
    poolSites.set(g.pool, set);
  }
  for (const [pool, set] of poolSites) {
    if (set.size > 1) {
      const names = [...set].map((id) => siteById.get(id)?.name ?? id);
      warnings.push(
        `Pool ${pool} is split across ${names.join(" and ")}. Keep a pool at one ` +
          `venue — otherwise every team in it travels mid-pool.`,
      );
    }
  }

  // --- 2. Does any team move without enough gap? --------------------------
  const byTeam = new Map<string, ScheduledGame[]>();
  for (const g of games) {
    for (const id of [g.homeTeamId, g.awayTeamId]) {
      if (!id) continue;
      byTeam.set(id, [...(byTeam.get(id) ?? []), g]);
    }
  }

  const flagged = new Set<string>();
  for (const [teamId, list] of byTeam) {
    const ordered = [...list].sort((a, b) => a.round - b.round);
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const next = ordered[i];
      if (!prev.siteId || !next.siteId || prev.siteId === next.siteId) continue;

      const gapRounds = next.round - prev.round;
      const availableMinutes = gapRounds * opts.roundMinutes;
      const needed = travelBetween(prev.siteId, next.siteId) + TURNAROUND_MINUTES;

      if (availableMinutes < needed) {
        const key = `${teamId}|${prev.round}|${next.round}`;
        if (flagged.has(key)) continue;
        flagged.add(key);
        warnings.push(
          `A team plays round ${prev.round} at ${siteById.get(prev.siteId)?.name} ` +
            `and round ${next.round} at ${siteById.get(next.siteId)?.name}. That ` +
            `allows ${availableMinutes} minutes for a move needing about ` +
            `${needed} (travel plus turnaround). Add a bye round, or move one of ` +
            `the games.`,
        );
      }
    }
  }

  return warnings;
}

/**
 * Assign pools to sites so that each pool stays put and each site's load
 * matches how many fields it has. Returns a pool → siteId map.
 */
export function assignPoolsToSites(
  pools: { pool: string; games: number }[],
  sites: { id: string; name: string; fields: number }[],
): { assignment: Map<string, string>; problems: string[] } {
  const assignment = new Map<string, string>();
  const problems: string[] = [];

  const totalFields = sites.reduce((a, s) => a + s.fields, 0);
  if (totalFields === 0) {
    problems.push("No fields are assigned to any site yet.");
    return { assignment, problems };
  }

  // Largest pools first into the site with the most spare capacity — a simple
  // greedy fill, which is plenty for the handful of pools a tournament has.
  const load = new Map(sites.map((s) => [s.id, 0]));
  const ordered = [...pools].sort((a, b) => b.games - a.games);

  for (const p of ordered) {
    const best = sites
      .filter((s) => s.fields > 0)
      .sort(
        (a, b) =>
          (load.get(a.id)! / a.fields) - (load.get(b.id)! / b.fields),
      )[0];
    if (!best) {
      problems.push(`No site with fields available for pool ${p.pool}.`);
      continue;
    }
    assignment.set(p.pool, best.id);
    load.set(best.id, load.get(best.id)! + p.games);
  }

  for (const s of sites) {
    if (s.fields > 0 && load.get(s.id) === 0) {
      problems.push(
        `${s.name} has ${s.fields} field(s) but no pool assigned. You may not ` +
          `need it — or the pools are unbalanced.`,
      );
    }
  }

  return { assignment, problems };
}

/** Plain-language summary for the TD, rather than a table of numbers. */
export function describeSites(sites: Site[]) {
  if (sites.length < 2) return "Single venue.";
  const primary = sites.find((s) => s.isPrimary) ?? sites[0];
  const others = sites.filter((s) => s.id !== primary.id);
  return (
    `${sites.length} venues. ${primary.name} is the main site; ` +
    others
      .map((s) => `${s.name} is about ${s.travelMinutes} minutes away`)
      .join(", ") +
    `. Teams should be told which venue they start at in the week-of email, ` +
    `and every venue needs its own water, toilets, and a named person on site.`
  );
}
