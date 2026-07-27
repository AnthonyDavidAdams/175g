/**
 * Sharing fields between divisions.
 *
 * A mixed + women's event on four fields is normal, and the naive answer —
 * schedule each division as if it owned the site — double-books every field.
 * Two honest ways to share:
 *
 *   alternate  Divisions take turns. Each division uses every field for a whole
 *              round, then hands over. Fewer fields needed, but the day is
 *              longer and each division has gaps between its games.
 *
 *   split      Divisions play at the same time on dedicated fields. Shorter
 *              day, no waiting, but each division gets fewer fields, so its
 *              rounds take longer to clear.
 *
 * Neither is better in the abstract. The choice depends on whether the site is
 * short of fields or short of daylight, so both are offered and the trade is
 * stated plainly.
 */

export type DivisionPlan = {
  division: string;
  games: {
    gameId: string;
    round: number;
    stage: string;
    pool: string;
    home: string;
    away: string;
  }[];
};

export type Allocated = {
  gameId: string;
  division: string;
  globalRound: number;
  day: number;
  field: number;
  startTime: string;
  stage: string;
  pool: string;
  home: string;
  away: string;
};

function clock(start: string, roundIndex: number, minutes: number) {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + roundIndex * minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
}

export function allocate(
  plans: DivisionPlan[],
  opts: {
    mode: "alternate" | "split";
    fields: number;
    roundsPerDay: number;
    roundMinutes: number;
    startTime: string;
    days: number;
  },
): { games: Allocated[]; problems: string[]; summary: string } {
  const problems: string[] = [];
  const out: Allocated[] = [];

  const byDivisionRounds = plans.map((p) => {
    const rounds = new Map<number, DivisionPlan["games"]>();
    for (const g of p.games) {
      rounds.set(g.round, [...(rounds.get(g.round) ?? []), g]);
    }
    return {
      division: p.division,
      rounds: [...rounds.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, list]) => list),
    };
  });

  if (opts.mode === "alternate") {
    // Interleave: division A round 1, division B round 1, A round 2, ...
    const maxRounds = Math.max(0, ...byDivisionRounds.map((d) => d.rounds.length));
    let globalRound = 0;

    for (let r = 0; r < maxRounds; r++) {
      for (const d of byDivisionRounds) {
        const list = d.rounds[r];
        if (!list?.length) continue;
        globalRound++;
        if (list.length > opts.fields) {
          problems.push(
            `${d.division} round ${r + 1} has ${list.length} games but only ` +
              `${opts.fields} fields.`,
          );
        }
        list.forEach((g, k) => {
          out.push({
            ...g,
            division: d.division,
            globalRound,
            day: Math.floor((globalRound - 1) / opts.roundsPerDay) + 1,
            field: (k % opts.fields) + 1,
            startTime: clock(
              opts.startTime,
              (globalRound - 1) % opts.roundsPerDay,
              opts.roundMinutes,
            ),
          });
        });
      }
    }
  } else {
    // Split the fields between divisions, proportional to how much each has
    // left to play, so the bigger division doesn't finish hours after the other.
    const weights = byDivisionRounds.map((d) =>
      d.rounds.reduce((a, r) => a + r.length, 0),
    );
    const total = weights.reduce((a, b) => a + b, 0) || 1;

    let assigned = 0;
    const share = byDivisionRounds.map((d, i) => {
      const n =
        i === byDivisionRounds.length - 1
          ? opts.fields - assigned
          : Math.max(1, Math.round((weights[i] / total) * opts.fields));
      assigned += n;
      return { division: d.division, fields: n, offset: assigned - n };
    });

    if (share.some((s) => s.fields < 1)) {
      problems.push(
        `Not enough fields to split between ${plans.length} divisions. Use ` +
          `alternate mode, or add fields.`,
      );
    }

    byDivisionRounds.forEach((d, i) => {
      const lane = share[i];
      const width = Math.max(1, lane.fields);
      let localRound = 0;

      d.rounds.forEach((list, r) => {
        // A division's round can't fit in fewer fields than it has games, so
        // spill it across consecutive rounds rather than double-booking a
        // field. Teams in that round simply play in two waves.
        const waves = Math.ceil(list.length / width);
        if (waves > 1) {
          problems.push(
            `${d.division} round ${r + 1} has ${list.length} games but only ` +
              `${width} field${width === 1 ? "" : "s"} in split mode, so it runs as ` +
              `${waves} waves. Alternate mode would give it all ${opts.fields}.`,
          );
        }

        for (let w = 0; w < waves; w++) {
          localRound++;
          const slice = list.slice(w * width, (w + 1) * width);
          slice.forEach((g, k) => {
            out.push({
              ...g,
              division: d.division,
              globalRound: localRound,
              day: Math.floor((localRound - 1) / opts.roundsPerDay) + 1,
              field: lane.offset + k + 1,
              startTime: clock(
                opts.startTime,
                (localRound - 1) % opts.roundsPerDay,
                opts.roundMinutes,
              ),
            });
          });
        }
      });
    });
  }

  const rounds = Math.max(0, ...out.map((g) => g.globalRound));
  const capacity = opts.roundsPerDay * opts.days;
  if (rounds > capacity) {
    problems.push(
      `Needs ${rounds} rounds; ${capacity} available (${opts.roundsPerDay}/day ` +
        `over ${opts.days} day(s)). ${
          opts.mode === "alternate"
            ? "Split mode would run the divisions concurrently and halve this."
            : "Add a day or lengthen the playing day."
        }`,
    );
  }

  const summary =
    opts.mode === "alternate"
      ? `Divisions alternate: each takes all ${opts.fields} fields for a round, ` +
        `then hands over. ${rounds} rounds total — a longer day, but every ` +
        `division gets the full field allocation for its games.`
      : `Divisions run concurrently on dedicated fields. ${rounds} rounds total — ` +
        `a shorter day, but each division has fewer fields, so nobody plays at ` +
        `once within a division.`;

  return { games: out, problems, summary };
}

/**
 * Cross-check the schedule against the fields actually drawn on the site map.
 * A schedule that uses Field 6 when only four are marked out is how a round
 * starts twenty minutes late while someone hunts for cones.
 */
export function fieldCountWarnings(opts: {
  mapped: number;
  scheduleMax: number;
  declared?: number | null;
}) {
  const out: string[] = [];
  const { mapped, scheduleMax, declared } = opts;

  if (mapped > 0 && scheduleMax > mapped) {
    out.push(
      `The schedule uses ${scheduleMax} fields but only ${mapped} are placed on ` +
        `the site map. Either draw the missing ${scheduleMax - mapped}, or ` +
        `regenerate the schedule for ${mapped}.`,
    );
  }
  if (mapped > 0 && scheduleMax > 0 && scheduleMax < mapped) {
    out.push(
      `${mapped} fields are on the map but the schedule only uses ${scheduleMax}. ` +
        `You may be able to shorten the day by regenerating for ${mapped}.`,
    );
  }
  if (declared && mapped > 0 && declared !== mapped) {
    out.push(
      `The tournament says ${declared} fields but ${mapped} are on the map. ` +
        `Teams read the declared number when they decide to come.`,
    );
  }
  if (mapped === 0 && scheduleMax > 0) {
    out.push(
      `No fields are placed on the site map yet, but the schedule uses ` +
        `${scheduleMax}. Volunteers will have nothing to set up from.`,
    );
  }
  return out;
}
