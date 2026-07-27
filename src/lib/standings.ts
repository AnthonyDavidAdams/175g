/**
 * USAU nine-rule round-robin tiebreak procedure.
 *
 * A TypeScript port of scripts/standings.py from the Pull plugin, so live
 * standings on the public page and the Telegram bot use the same procedure the
 * TD would get from the command line. Verified against the worked examples in
 * the UPA Manual of Championship Series Tournament Formats.
 *
 * The two meta-rules do the real work:
 *   Rule 1a -- if all teams remain tied after a rule, advance to the next rule
 *   Rule 1b -- if a rule splits the tied set, each subgroup restarts from Rule 2
 */

export type Game = {
  pool?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
};

export type Record = {
  team: string;
  w: number;
  l: number;
  pf: number;
  pa: number;
  diff: number;
};

export const RULES = [
  "Rule 2: won-loss record among tied teams",
  "Rule 3: point differential among tied teams",
  "Rule 4: point differential vs all common opponents",
  "Rule 5: point differential vs common opponents, dropping best and worst",
  "Rule 6: points scored among tied teams",
  "Rule 7: points scored vs all common opponents",
  "Rule 8: points scored vs common opponents, dropping best and worst",
  "Rule 9: sum of signed square roots of differentials vs common opponents",
];

type Result = { opp: string; scored: number; allowed: number };

function finals(games: Game[]): Game[] {
  return games.filter((g) => g.status === "final");
}

function resultsFor(team: string, games: Game[]): Result[] {
  const out: Result[] = [];
  for (const g of games) {
    if (g.homeTeam === team) {
      out.push({ opp: g.awayTeam, scored: g.homeScore, allowed: g.awayScore });
    } else if (g.awayTeam === team) {
      out.push({ opp: g.homeTeam, scored: g.awayScore, allowed: g.homeScore });
    }
  }
  return out;
}

export function overallRecord(team: string, games: Game[]): Record {
  let w = 0,
    l = 0,
    pf = 0,
    pa = 0;
  for (const r of resultsFor(team, games)) {
    pf += r.scored;
    pa += r.allowed;
    if (r.scored > r.allowed) w++;
    else if (r.allowed > r.scored) l++;
  }
  return { team, w, l, pf, pa, diff: pf - pa };
}

function commonOpponents(tied: string[], games: Game[]): Set<string> {
  const sets = tied.map((t) => {
    const s = new Set(resultsFor(t, games).map((r) => r.opp));
    for (const x of tied) s.delete(x);
    return s;
  });
  if (!sets.length) return new Set();
  return sets.reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))));
}

/** Repeat meetings with the same common opponent are averaged into one entry. */
function vsCommon(team: string, opponents: Set<string>, games: Game[]) {
  const buckets = new Map<string, { diff: number; scored: number }[]>();
  for (const r of resultsFor(team, games)) {
    if (!opponents.has(r.opp)) continue;
    const list = buckets.get(r.opp) ?? [];
    list.push({ diff: r.scored - r.allowed, scored: r.scored });
    buckets.set(r.opp, list);
  }
  return [...buckets.values()].map((entries) => ({
    diff: entries.reduce((a, e) => a + e.diff, 0) / entries.length,
    scored: entries.reduce((a, e) => a + e.scored, 0) / entries.length,
  }));
}

function dropExtremes(values: number[]): number[] {
  if (values.length <= 2) return values;
  return [...values].sort((a, b) => a - b).slice(1, -1);
}

function scoreRule(
  ruleIndex: number,
  team: string,
  tied: string[],
  games: Game[],
): number | null {
  const tiedSet = new Set(tied);
  const among = games.filter(
    (g) => tiedSet.has(g.homeTeam) && tiedSet.has(g.awayTeam),
  );

  if (ruleIndex === 0) {
    const rs = resultsFor(team, among);
    return (
      rs.filter((r) => r.scored > r.allowed).length -
      rs.filter((r) => r.allowed > r.scored).length
    );
  }
  if (ruleIndex === 1) {
    return resultsFor(team, among).reduce((a, r) => a + r.scored - r.allowed, 0);
  }
  if (ruleIndex === 4) {
    return resultsFor(team, among).reduce((a, r) => a + r.scored, 0);
  }

  const common = commonOpponents(tied, games);
  if (!common.size) return null;
  const entries = vsCommon(team, common, games);
  if (!entries.length) return null;
  const diffs = entries.map((e) => e.diff);
  const scored = entries.map((e) => e.scored);

  switch (ruleIndex) {
    case 2:
      return diffs.reduce((a, b) => a + b, 0);
    case 3:
      return dropExtremes(diffs).reduce((a, b) => a + b, 0);
    case 5:
      return scored.reduce((a, b) => a + b, 0);
    case 6:
      return dropExtremes(scored).reduce((a, b) => a + b, 0);
    case 7:
      return diffs.reduce((a, d) => a + Math.sign(d) * Math.sqrt(Math.abs(d)), 0);
    default:
      return null;
  }
}

function breakTie(
  tied: string[],
  games: Game[],
  trace: string[],
  depth = 0,
): string[] {
  if (tied.length === 1) return [...tied];
  const pad = "  ".repeat(depth);

  for (let i = 0; i < RULES.length; i++) {
    const values = new Map<string, number | null>();
    for (const t of tied) values.set(t, scoreRule(i, t, tied, games));

    if ([...values.values()].some((v) => v === null)) {
      trace.push(`${pad}${RULES[i]}: not applicable`);
      continue;
    }

    const groups = new Map<number, string[]>();
    for (const [t, v] of values) {
      const list = groups.get(v as number) ?? [];
      list.push(t);
      groups.set(v as number, list);
    }

    if (groups.size === 1) {
      trace.push(`${pad}${RULES[i]}: all tied, next rule`);
      continue;
    }

    const detail = [...tied]
      .sort((a, b) => (values.get(b) as number) - (values.get(a) as number))
      .map((t) => `${t}=${values.get(t)}`)
      .join(", ");
    trace.push(`${pad}${RULES[i]}: ${detail}`);

    const ordered: string[] = [];
    for (const value of [...groups.keys()].sort((a, b) => b - a)) {
      const subgroup = groups.get(value)!;
      if (subgroup.length === 1) {
        ordered.push(...subgroup);
      } else {
        // Rule 1b -- restart this subgroup from Rule 2.
        trace.push(`${pad}  still tied: ${subgroup.join(", ")} -- restarting`);
        ordered.push(...breakTie(subgroup, games, trace, depth + 1));
      }
    }
    return ordered;
  }

  trace.push(
    `${pad}UNBROKEN after all nine rules: ${tied.join(", ")}. In a three-team pool ` +
      `this is the case the extra point resolves — it must be announced in advance.`,
  );
  return [...tied].sort();
}

export function standings(rawGames: Game[]): {
  ordered: Record[];
  trace: string[];
} {
  const games = finals(rawGames);
  const teams = [
    ...new Set([...games.map((g) => g.homeTeam), ...games.map((g) => g.awayTeam)]),
  ].sort();
  const records = new Map(teams.map((t) => [t, overallRecord(t, games)]));

  const byWins = new Map<number, string[]>();
  for (const t of teams) {
    const r = records.get(t)!;
    const key = r.w - r.l;
    byWins.set(key, [...(byWins.get(key) ?? []), t]);
  }

  const trace: string[] = [];
  const ordered: string[] = [];
  for (const key of [...byWins.keys()].sort((a, b) => b - a)) {
    const group = byWins.get(key)!;
    if (group.length === 1) {
      ordered.push(...group);
    } else {
      trace.push(`Tie at ${key >= 0 ? "+" : ""}${key}: ${[...group].sort().join(", ")}`);
      ordered.push(...breakTie(group, games, trace));
      trace.push("");
    }
  }

  return { ordered: ordered.map((t) => records.get(t)!), trace };
}

/** Group games by pool and compute standings for each. */
export function standingsByPool(games: Game[]) {
  const pools = new Map<string, Game[]>();
  for (const g of games) {
    if (g.status !== "final") continue;
    const key = g.pool ?? "-";
    pools.set(key, [...(pools.get(key) ?? []), g]);
  }
  return [...pools.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pool, poolGames]) => ({ pool, ...standings(poolGames) }));
}
