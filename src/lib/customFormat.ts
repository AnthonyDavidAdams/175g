/**
 * Custom tournament formats.
 *
 * The USAU library in formats.ts covers the standard shapes. This covers
 * everything else a TD actually runs: hat tournaments, swiss, three-team pools
 * with crossovers, showcase games, split divisions, round robins that play
 * everyone twice, consolation ladders, beach 2:2.
 *
 * A spec is declarative. Validation separates *errors* (structurally
 * impossible — a team playing itself, a team in two games in one round) from
 * *warnings* (violates a USAU guideline, e.g. more than nine games in two
 * days). Errors block. Warnings are surfaced and the TD decides, because a
 * custom format is a deliberate choice, not a mistake.
 */

export type TeamRef = string;

export type Stage =
  | {
      type: "round_robin";
      /** Pool name from `pools`, or omit to use every team. */
      pool?: string;
      label?: string;
      /** Play the pool through twice. */
      doubleRound?: boolean;
    }
  | {
      type: "bracket";
      label: string;
      /** Entrants, best seed first. May be team names or placeholders. */
      entrants: TeamRef[];
      kind?: "bracket" | "placement";
    }
  | {
      type: "crossover";
      label?: string;
      games: { home: TeamRef; away: TeamRef }[];
    }
  | {
      type: "games";
      label?: string;
      games: { home: TeamRef; away: TeamRef }[];
    }
  | {
      type: "swiss";
      label?: string;
      /** Round one pairs by seed order; later rounds pair from results. */
      rounds: number;
      teams?: TeamRef[];
    };

export type CustomFormatSpec = {
  name: string;
  description?: string;
  pools?: { name: string; teams: TeamRef[] }[];
  stages: Stage[];
  gameTo?: number;
  notes?: string;
};

export type ExpandedGame = {
  gameId: string;
  round: number;
  stage: string;
  pool: string;
  home: TeamRef;
  away: TeamRef;
  /** True when home/away are placeholders to resolve as results land. */
  homeIsRef: boolean;
  awayIsRef: boolean;
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  games: ExpandedGame[];
  rounds: number;
  gamesPerTeam: Record<string, number>;
};

/**
 * Placeholders that resolve once results exist:
 *   "A1"    — pool A, first place after pool play
 *   "W:G12" — winner of game 12
 *   "L:G12" — loser of game 12
 * Anything else is a literal team name.
 */
const POOL_PLACE = /^([A-Z])(\d{1,2})$/;
const RESULT_REF = /^([WL]):(G\d+)$/i;

export function isPlaceholder(ref: string) {
  return POOL_PLACE.test(ref) || RESULT_REF.test(ref);
}

function roundRobinPairs(teams: TeamRef[]): [TeamRef, TeamRef][][] {
  const list: (TeamRef | null)[] = [...teams];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds: [TeamRef, TeamRef][][] = [];
  let rotation = [...list];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [TeamRef, TeamRef][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    rotation = [rotation[0], rotation[n - 1], ...rotation.slice(1, n - 1)];
  }
  return rounds;
}

function bracketOrder(size: number): [number, number][] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    const expanded: number[] = [];
    for (const s of order) expanded.push(s, next - s);
    order = expanded;
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return pairs;
}

export function expand(spec: CustomFormatSpec, knownTeams: string[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const games: ExpandedGame[] = [];
  const poolByName = new Map((spec.pools ?? []).map((p) => [p.name, p.teams]));

  let gid = 1;
  let round = 0;

  const push = (
    r: number,
    stage: string,
    pool: string,
    home: TeamRef,
    away: TeamRef,
  ) => {
    games.push({
      gameId: `G${gid++}`,
      round: r,
      stage,
      pool,
      home,
      away,
      homeIsRef: isPlaceholder(home),
      awayIsRef: isPlaceholder(away),
    });
  };

  if (!spec.stages?.length) {
    errors.push("The format has no stages.");
  }

  const stages = spec.stages ?? [];
  for (let si = 0; si < stages.length; si++) {
    const stage = stages[si];

    if (stage.type === "round_robin") {
      // Consecutive round-robin stages on different pools play CONCURRENTLY:
      // round 1 is pool A's first game and pool B's first game at the same
      // time, not one pool finishing before the next starts. Collect the run
      // and overlay it onto shared round numbers.
      const run: typeof stages = [];
      while (si < stages.length && stages[si].type === "round_robin") {
        run.push(stages[si]);
        si++;
      }
      si--;

      const schedules: { pool: string; rounds: [TeamRef, TeamRef][][] }[] = [];
      for (const s of run) {
        if (s.type !== "round_robin") continue;
        if (s.pool && !poolByName.has(s.pool)) {
          errors.push(`Stage references pool "${s.pool}", which is not defined.`);
          continue;
        }
        const teams = s.pool ? (poolByName.get(s.pool) ?? []) : knownTeams;
        if (teams.length < 2) {
          errors.push(
            `Pool "${s.pool ?? "all"}" needs at least 2 teams, has ${teams.length}.`,
          );
          continue;
        }
        if (teams.length === 3) {
          warnings.push(
            `Pool "${s.pool ?? "all"}" has three teams. Announce in advance that ` +
              `three-team pools play an extra point — otherwise a 1-1-1 tie with ` +
              `zero point differential is unbreakable.`,
          );
        }
        let rounds = roundRobinPairs(teams);
        if (s.doubleRound) {
          // Second pass flips home/away so nobody is always "home".
          rounds = [
            ...rounds,
            ...roundRobinPairs(teams).map((r) =>
              r.map(([a, b]) => [b, a] as [TeamRef, TeamRef]),
            ),
          ];
        }
        schedules.push({ pool: s.pool ?? s.label ?? "RR", rounds });
      }

      const longest = Math.max(0, ...schedules.map((s) => s.rounds.length));
      for (let r = 0; r < longest; r++) {
        round++;
        for (const s of schedules) {
          for (const [a, b] of s.rounds[r] ?? []) {
            push(round, "pool", s.pool, a, b);
          }
        }
      }
      continue;
    }

    if (stage.type === "bracket") {
      const entrants = stage.entrants ?? [];
      if (entrants.length < 2) {
        errors.push(`Bracket "${stage.label}" needs at least 2 entrants.`);
        continue;
      }
      const size = 1 << (32 - Math.clz32(entrants.length - 1));
      round++;
      const firstRound = round;
      const winners: string[] = [];
      for (const [a, b] of bracketOrder(size)) {
        const ta = a <= entrants.length ? entrants[a - 1] : null;
        const tb = b <= entrants.length ? entrants[b - 1] : null;
        if (ta && tb) {
          push(firstRound, stage.kind ?? "bracket", stage.label, ta, tb);
          winners.push(`W:${games[games.length - 1].gameId}`);
        } else if (ta || tb) {
          // Bye: the present team advances, favouring the higher seed.
          winners.push((ta ?? tb) as string);
        }
      }
      let current = winners;
      while (current.length > 1) {
        round++;
        const next: string[] = [];
        for (let i = 0; i < current.length; i += 2) {
          if (current[i + 1] === undefined) {
            next.push(current[i]);
            continue;
          }
          push(round, stage.kind ?? "bracket", stage.label, current[i], current[i + 1]);
          next.push(`W:${games[games.length - 1].gameId}`);
        }
        current = next;
      }
    }

    if (stage.type === "crossover" || stage.type === "games") {
      if (!stage.games?.length) {
        errors.push(`Stage "${stage.label ?? stage.type}" has no games.`);
        continue;
      }
      round++;
      for (const g of stage.games) {
        push(round, stage.type === "crossover" ? "bracket" : "pool",
             stage.label ?? stage.type, g.home, g.away);
      }
    }

    if (stage.type === "swiss") {
      const teams = stage.teams?.length ? stage.teams : knownTeams;
      if (teams.length < 4) {
        errors.push(`Swiss needs at least 4 teams, has ${teams.length}.`);
        continue;
      }
      // Only round one can be laid out in advance; later rounds pair from
      // results via pair_swiss_round.
      round++;
      const half = Math.floor(teams.length / 2);
      for (let i = 0; i < half; i++) {
        push(round, "pool", stage.label ?? "Swiss", teams[i], teams[i + half]);
      }
      if (stage.rounds > 1) {
        warnings.push(
          `Swiss round 1 is scheduled. Rounds 2–${stage.rounds} pair from results — ` +
            `use pair_swiss_round after each round completes.`,
        );
      }
    }
  }

  // --- structural checks -------------------------------------------------

  const perRound = new Map<number, Set<string>>();
  const gamesPerTeam: Record<string, number> = {};

  for (const g of games) {
    if (g.home === g.away) {
      errors.push(`${g.gameId}: a team cannot play itself (${g.home}).`);
    }
    for (const side of [g.home, g.away]) {
      if (!isPlaceholder(side)) {
        gamesPerTeam[side] = (gamesPerTeam[side] ?? 0) + 1;
        if (knownTeams.length && !knownTeams.includes(side)) {
          errors.push(`${g.gameId}: "${side}" is not a team in this tournament.`);
        }
        const seen = perRound.get(g.round) ?? new Set();
        if (seen.has(side)) {
          errors.push(`Round ${g.round}: "${side}" is scheduled twice.`);
        }
        seen.add(side);
        perRound.set(g.round, seen);
      }
    }
  }

  const counts = Object.values(gamesPerTeam);
  if (counts.length) {
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max > 9) {
      warnings.push(
        `A team plays ${max} games. The formats manual caps a two-day event at 9.`,
      );
    }
    if (max - min > 1) {
      warnings.push(
        `Uneven schedule: some teams play ${max} games and others ${min}. Every ` +
          `team's path should be equivalent.`,
      );
    }
  }

  const unresolvable = new Set<string>();
  const validGameIds = new Set(games.map((g) => g.gameId));
  for (const g of games) {
    for (const side of [g.home, g.away]) {
      const m = side.match(RESULT_REF);
      if (m && !validGameIds.has(m[2].toUpperCase())) unresolvable.add(side);
      const p = side.match(POOL_PLACE);
      if (p && spec.pools && !poolByName.has(p[1])) unresolvable.add(side);
    }
  }
  for (const u of unresolvable) {
    errors.push(`Placeholder "${u}" does not refer to anything in this format.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    games,
    rounds: round,
    gamesPerTeam,
  };
}

/** Check the expanded format fits the available fields, rounds, and days. */
export function checkCapacity(
  result: ValidationResult,
  opts: { fields: number; roundsPerDay: number; days: number },
) {
  const problems: string[] = [];
  const byRound = new Map<number, number>();
  for (const g of result.games) {
    byRound.set(g.round, (byRound.get(g.round) ?? 0) + 1);
  }
  for (const [round, count] of byRound) {
    if (count > opts.fields) {
      problems.push(
        `Round ${round} has ${count} games but only ${opts.fields} fields. ` +
          `Add a field or split the round.`,
      );
    }
  }
  const capacity = opts.roundsPerDay * opts.days;
  if (result.rounds > capacity) {
    problems.push(
      `Format needs ${result.rounds} rounds; ${capacity} available ` +
        `(${opts.roundsPerDay}/day over ${opts.days} day(s)).`,
    );
  }
  return problems;
}
