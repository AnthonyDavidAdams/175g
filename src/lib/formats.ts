/**
 * USAU-compliant pools, seeding, brackets, and round layout.
 *
 * TypeScript port of scripts/formats.py and scripts/schedule.py from the Pull
 * plugin. Encodes the structural rules from the UPA Manual of Championship
 * Series Tournament Formats so the agent generates the same schedule a TD would
 * get from the command line.
 */

const MAX_GAMES_TWO_DAYS = 9;
const MAX_GAMES_PER_DAY = 4;
const MAX_GAMES_PER_DAY_SHORT = 5;

/** Splits the manual states a preference for, which the generic rule misses. */
const PREFERRED_SPLITS: Record<number, number[]> = {
  6: [6],
  10: [5, 5],
  11: [5, 6],
  12: [6, 6],
  13: [6, 7],
  14: [7, 7],
};

export type Format = {
  teams: number;
  days: number;
  fields: number;
  roundMinutes: number;
  gameTo: number;
  pools: Record<string, number[]>;
  poolRounds: Record<string, [number, number][][]>;
  nPoolRounds: number;
  advancing: number;
  brackets: Bracket[];
  worstCaseGamesPerTeam: number;
  gamesGuaranteed: number;
  gamesTotal: number;
  problems: string[];
};

type Bracket = {
  label: string;
  stage: string;
  rounds: { round: number; games: BracketGame[] }[];
};

type BracketGame = { seedA?: number | null; seedB?: number | null; bye?: boolean };

function poolSplit(teams: number): number[] {
  if (PREFERRED_SPLITS[teams]) return [...PREFERRED_SPLITS[teams]];
  if (teams <= 5) return [teams];
  for (const size of [4, 5, 6]) {
    if (teams % size === 0) {
      const count = teams / size;
      if (count >= 2 && count <= 6) return Array(count).fill(size);
    }
  }
  for (const count of [2, 3, 4, 5, 6]) {
    const base = Math.floor(teams / count);
    if (base >= 4 && base <= 6 && count * 4 <= teams && teams <= count * 6) {
      const rem = teams % count;
      return [
        ...Array(rem).fill(base + 1),
        ...Array(count - rem).fill(base),
      ];
    }
  }
  const count = Math.max(2, Math.ceil(teams / 6));
  const base = Math.floor(teams / count);
  const rem = teams % count;
  return [...Array(rem).fill(base + 1), ...Array(count - rem).fill(base)];
}

/**
 * Serpentine distribution, then the manual's documented departures from it.
 * Pure snaking plus a traditional bracket reproduces pool matchups in the
 * bracket; the published tables deviate to push those matchups later.
 */
function seedPools(teams: number, sizes: number[]): Record<string, number[]> {
  const nPools = sizes.length;
  let pools: number[][] = Array.from({ length: nPools }, () => []);
  let seed = 1;
  let row = 0;
  while (seed <= teams) {
    const order =
      row % 2 === 0
        ? [...Array(nPools).keys()]
        : [...Array(nPools).keys()].reverse();
    for (const p of order) {
      if (pools[p].length < sizes[p] && seed <= teams) pools[p].push(seed++);
    }
    row++;
  }

  if (teams === 8 && nPools === 2) pools = [[1, 4, 5, 8], [2, 3, 6, 7]];
  if (teams === 12 && nPools === 2)
    pools = [[1, 4, 5, 8, 9, 12], [2, 3, 6, 7, 10, 11]];
  if (teams === 16 && nPools === 4)
    pools = [[1, 8, 9, 16], [2, 7, 10, 15], [3, 6, 11, 14], [4, 5, 12, 13]];

  const out: Record<string, number[]> = {};
  pools.forEach((p, i) => (out[String.fromCharCode(65 + i)] = p));
  return out;
}

/** Circle method. An odd pool produces a bye each round, as the manual accepts. */
function roundRobin(poolSeeds: number[]): [number, number][][] {
  let teams: (number | null)[] = [...poolSeeds];
  if (teams.length % 2) teams.push(null);
  const n = teams.length;
  const rounds: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    teams = [teams[0], teams[n - 1], ...teams.slice(1, n - 1)];
  }
  return rounds;
}

/** Traditional bracket ordering: strongest plays weakest remaining. */
function bracketPairs(size: number): [number, number][] {
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

function buildBracket(
  advancing: number,
  label: string,
  stage: string,
  seedOffset = 0,
): Bracket {
  if (advancing < 2) return { label, stage, rounds: [] };
  const size = 1 << (32 - Math.clz32(advancing - 1));
  const first: BracketGame[] = bracketPairs(size).map(([a, b]) => {
    const ta = a <= advancing ? a + seedOffset : null;
    const tb = b <= advancing ? b + seedOffset : null;
    return { seedA: ta, seedB: tb, bye: ta === null || tb === null };
  });

  const rounds: Bracket["rounds"] = [{ round: 1, games: first }];
  let remaining = size / 4;
  let rnd = 2;
  while (remaining >= 1) {
    rounds.push({
      round: rnd,
      games: Array.from({ length: remaining }, () => ({})),
    });
    remaining = Math.floor(remaining / 2);
    rnd++;
  }
  return { label, stage, rounds };
}

export function buildFormat({
  teams,
  days,
  fields,
  roundMinutes,
  hoursPerDay,
  gameTo,
}: {
  teams: number;
  days: number;
  fields: number;
  roundMinutes: number;
  hoursPerDay: number;
  gameTo: number;
}): Format {
  const sizes = poolSplit(teams);
  const pools = seedPools(teams, sizes);

  const poolRounds: Record<string, [number, number][][]> = {};
  for (const [name, seeds] of Object.entries(pools)) {
    poolRounds[name] = roundRobin(seeds);
  }
  const nPoolRounds = Math.max(...Object.values(poolRounds).map((r) => r.length));

  // Largest power of two that fits, matching the manual's published shapes.
  const advancing = Math.max(2, Math.min(1 << (31 - Math.clz32(teams)), teams));

  const champ = buildBracket(advancing, "Championship", "bracket");
  const champRounds = champ.rounds.length;
  const remainder = teams - advancing;
  const placement =
    remainder >= 2
      ? buildBracket(remainder, `Placement (${advancing + 1}th+)`, "placement", advancing)
      : { label: "Placement", stage: "placement", rounds: [] };

  const largestPool = Math.max(...Object.values(pools).map((p) => p.length));
  const worstCase = largestPool - 1 + champRounds;

  const roundsNeeded = nPoolRounds + champRounds;
  const roundsAvailable = Math.floor((hoursPerDay * 60) / roundMinutes) * days;
  const poolGames = Object.values(pools).reduce(
    (a, p) => a + (p.length * (p.length - 1)) / 2,
    0,
  );
  const gamesTotal = poolGames + (advancing - 1) + Math.max(0, remainder - 1);
  const slotsAvailable = roundsAvailable * fields;

  const problems: string[] = [];
  if (worstCase > MAX_GAMES_TWO_DAYS && days <= 2) {
    problems.push(
      `Worst-case ${worstCase} games per team exceeds the ${MAX_GAMES_TWO_DAYS}-game ` +
        `limit for a two-day event.`,
    );
  }
  const perDay = Math.ceil(worstCase / days);
  const cap = gameTo >= 13 ? MAX_GAMES_PER_DAY : MAX_GAMES_PER_DAY_SHORT;
  if (perDay > cap) {
    problems.push(
      `${perDay} games per day exceeds the limit of ${cap} for games to ${gameTo}. ` +
        `Play to 11 to allow 5, or add a day.`,
    );
  }
  if (roundsNeeded > roundsAvailable) {
    problems.push(
      `Format needs ${roundsNeeded} rounds; ${roundsAvailable} available.`,
    );
  }
  if (gamesTotal > slotsAvailable) {
    problems.push(
      `${gamesTotal} games need more than the ${slotsAvailable} available slots ` +
        `(${fields} fields x ${roundsAvailable} rounds).`,
    );
  }

  return {
    teams,
    days,
    fields,
    roundMinutes,
    gameTo,
    pools,
    poolRounds,
    nPoolRounds,
    advancing,
    brackets: [champ, placement],
    worstCaseGamesPerTeam: worstCase,
    gamesGuaranteed: Math.min(...Object.values(pools).map((p) => p.length)) - 1 + 1,
    gamesTotal,
    problems,
  };
}

export type ScheduledGame = {
  gameId: string;
  day: number;
  round: number;
  startTime: string;
  field: number;
  stage: string;
  pool: string;
  homeTeam: string;
  awayTeam: string;
};

function clock(start: string, roundIndex: number, minutes: number) {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + roundIndex * minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function layOutSchedule(
  fmt: Format,
  opts: {
    startTime: string;
    roundMinutes: number;
    fields: number;
    roundsPerDay: number;
    days: number;
    teamNames: string[];
  },
): ScheduledGame[] {
  const name = (seed: number | null | undefined) =>
    seed && opts.teamNames[seed - 1] ? opts.teamNames[seed - 1] : `Seed ${seed}`;

  const rows: Omit<ScheduledGame, "day" | "field" | "startTime">[] = [];
  let gid = 1;

  // All pools advance together so standings stay comparable round to round.
  for (let r = 0; r < fmt.nPoolRounds; r++) {
    for (const [poolName, rounds] of Object.entries(fmt.poolRounds)) {
      if (r >= rounds.length) continue;
      for (const [a, b] of rounds[r]) {
        rows.push({
          gameId: `G${gid++}`,
          round: r + 1,
          stage: "pool",
          pool: poolName,
          homeTeam: name(a),
          awayTeam: name(b),
        });
      }
    }
  }

  const offset = fmt.nPoolRounds;
  const maxBracketRounds = Math.max(0, ...fmt.brackets.map((b) => b.rounds.length));
  for (let br = 0; br < maxBracketRounds; br++) {
    for (const bracket of fmt.brackets) {
      if (br >= bracket.rounds.length) continue;
      for (const g of bracket.rounds[br].games) {
        if (g.bye) continue;
        rows.push({
          gameId: `G${gid++}`,
          round: offset + br + 1,
          stage: bracket.stage,
          pool: bracket.label,
          homeTeam: br === 0 ? name(g.seedA) : "TBD",
          awayTeam: br === 0 ? name(g.seedB) : "TBD",
        });
      }
    }
  }

  const byRound = new Map<number, typeof rows>();
  for (const row of rows) {
    byRound.set(row.round, [...(byRound.get(row.round) ?? []), row]);
  }

  const out: ScheduledGame[] = [];
  for (const roundNo of [...byRound.keys()].sort((a, b) => a - b)) {
    const games = byRound.get(roundNo)!;
    const day = Math.floor((roundNo - 1) / opts.roundsPerDay) + 1;
    const slot = (roundNo - 1) % opts.roundsPerDay;
    games.forEach((row, i) => {
      out.push({
        ...row,
        day,
        field: (i % opts.fields) + 1,
        startTime: clock(opts.startTime, slot, opts.roundMinutes),
      });
    });
  }
  return out;
}
