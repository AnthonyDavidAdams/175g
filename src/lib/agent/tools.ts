import type Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db";
import { advanceTournament } from "../advance";
import { checkCapacity, expand, type CustomFormatSpec } from "../customFormat";
import { buildFormat, layOutSchedule } from "../formats";
import { allocate, fieldCountWarnings } from "../multiDivision";
import { describeSites, travelWarnings } from "../multiSite";
import { applyDoc, toDoc } from "../tournamentDoc";
import { buildTimeline } from "../timeline";
import { formatDateRange } from "../tournament";
import {
  LEGAL_DISCLAIMER,
  TEMPLATES,
  fillTemplate,
  templateByKey,
} from "../waiverTemplates";

/**
 * Tools the TD agent can call. Each one mutates the tournament the director is
 * actually building, so the conversation *is* the product rather than a wrapper
 * around a form.
 *
 * Two rules hold across every tool:
 *   - Outreach is drafted, never sent. `draft_outreach` writes a row with status
 *     "draft"; a human approves before anything leaves.
 *   - Marketing consent is never set by a tool. It comes from the person.
 */

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "update_tournament",
    description:
      "Set or change core tournament facts: dates, venue, division, field count, " +
      "bid fee, deadlines, refund policy, description. Call this as soon as the TD " +
      "tells you something concrete — do not wait until the end of the conversation.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
        venueName: { type: "string" },
        venueAddress: { type: "string" },
        city: { type: "string" },
        fieldCount: { type: "number" },
        surface: { type: "string", description: "grass | turf | beach | indoor" },
        division: {
          type: "string",
          description: "mens | womens | mixed | multiple",
        },
        teamTarget: { type: "number" },
        bidFee: { type: "number", description: "dollars per team" },
        sanctioned: { type: "boolean" },
        applyDeadline: { type: "string" },
        acceptanceDate: { type: "string" },
        paymentDeadline: { type: "string" },
        rosterDeadline: { type: "string" },
        refundPolicy: { type: "string" },
        description: { type: "string" },
        venueLat: { type: "number" },
        venueLng: { type: "number" },
        directions: {
          type: "string",
          description:
            "Getting-there notes. Include the venue coordinates as plain text — " +
            "map links break and phones lose signal, but a printed lat/long can " +
            "be typed into anything. Add the local knowledge a database can't " +
            "know: which gate is unlocked, which lot floods, how long the walk " +
            "from parking really is.",
        },
        paymentNote: { type: "string" },
        paymentOptions: {
          type: "array",
          description:
            "How teams pay. 175g processes no money — these are instructions for " +
            "paying the TD directly. Methods: venmo, paypal, zelle, cashapp, " +
            "invoice, check, transfer, other.",
          items: {
            type: "object",
            properties: {
              method: { type: "string" },
              handle: { type: "string" },
              note: { type: "string" },
            },
            required: ["method"],
          },
        },
      },
    },
  },
  {
    name: "generate_timeline",
    description:
      "Generate the countdown of deadlines from the event date, adapted to how " +
      "much runway actually remains. Replaces any existing task list. Reports what " +
      "is already late and which hard deadlines can no longer be met.",
    input_schema: {
      type: "object",
      properties: {
        eventDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["eventDate"],
    },
  },
  {
    name: "add_team",
    description: "Add or update a team in the field.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        school: { type: "string" },
        division: { type: "string" },
        captainName: { type: "string" },
        captainEmail: { type: "string" },
        captainPhone: { type: "string" },
        status: {
          type: "string",
          description: "applied | accepted | waitlisted | declined | withdrawn",
        },
        seed: { type: "number" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "generate_schedule",
    description:
      "Generate USAU-compliant pools, seeding, brackets, and the round-by-round " +
      "schedule from the accepted teams. Refuses and explains if the plan is " +
      "infeasible — too many teams for the fields and hours available, or more " +
      "games per team than the format manual allows.",
    input_schema: {
      type: "object",
      properties: {
        fields: { type: "number" },
        days: { type: "number" },
        roundMinutes: { type: "number", description: "default 120" },
        roundsPerDay: { type: "number", description: "default 4" },
        startTime: { type: "string", description: "HH:MM, default 09:00" },
        gameTo: { type: "number", description: "default 15" },
      },
    },
  },
  {
    name: "define_custom_format",
    description:
      "Define and apply a NON-standard tournament format when the USAU library " +
      "doesn't fit — hat tournaments, swiss, three-team pools with crossovers, " +
      "showcase games, split divisions, double round robins, consolation ladders, " +
      "beach 2:2. Validates the structure, reports warnings where it departs from " +
      "USAU guidance, and replaces the schedule. Use generate_schedule instead for " +
      "ordinary pools-into-bracket events.\n\n" +
      "Entrants and game sides may be literal team names or placeholders that " +
      "resolve as results land: 'A1' (pool A first place), 'W:G12' (winner of game " +
      "12), 'L:G12' (loser of game 12).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "e.g. 'Three pools of five into crossovers'" },
        description: { type: "string" },
        gameTo: { type: "number" },
        fields: { type: "number" },
        days: { type: "number" },
        roundsPerDay: { type: "number" },
        roundMinutes: { type: "number" },
        startTime: { type: "string", description: "HH:MM" },
        pools: {
          type: "array",
          description: "Named pools with their teams.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              teams: { type: "array", items: { type: "string" } },
            },
            required: ["name", "teams"],
          },
        },
        stages: {
          type: "array",
          description: "Played in order. Each stage occupies one or more rounds.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description: "round_robin | bracket | crossover | games | swiss",
              },
              pool: { type: "string", description: "round_robin: which pool" },
              doubleRound: { type: "boolean", description: "round_robin: play twice" },
              label: { type: "string" },
              kind: { type: "string", description: "bracket: bracket | placement" },
              entrants: {
                type: "array",
                description: "bracket: best seed first",
                items: { type: "string" },
              },
              rounds: { type: "number", description: "swiss: how many rounds" },
              teams: { type: "array", items: { type: "string" } },
              games: {
                type: "array",
                description: "crossover/games: explicit matchups",
                items: {
                  type: "object",
                  properties: {
                    home: { type: "string" },
                    away: { type: "string" },
                  },
                  required: ["home", "away"],
                },
              },
            },
            required: ["type"],
          },
        },
      },
      required: ["name", "stages"],
    },
  },
  {
    name: "pair_swiss_round",
    description:
      "Pair the next swiss round from current results — teams with similar records " +
      "play each other, avoiding rematches. Call after each swiss round is final.",
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string", description: "defaults to 'Swiss'" },
      },
    },
  },
  {
    name: "draft_outreach",
    description:
      "Draft an email and queue it for the TD's approval. NEVER sends. Use for " +
      "team invitations, sponsor asks, facility contacts, and thank-yous. Every " +
      "draft must contain at least one sentence that could only have been written " +
      "to this specific recipient.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          description: "team | sponsor | facility | volunteer | debrief",
        },
        toName: { type: "string" },
        toEmail: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["kind", "toEmail", "subject", "body"],
    },
  },
  {
    name: "add_sponsor",
    description: "Add or update a sponsor prospect in the pipeline.",
    input_schema: {
      type: "object",
      properties: {
        org: { type: "string" },
        contactName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        type: { type: "string", description: "cash | inkind | both" },
        stage: {
          type: "string",
          description:
            "prospect | contacted | in_conversation | committed | paid | declined",
        },
        amount: { type: "number", description: "dollars" },
        inkindDescription: { type: "string" },
        tier: { type: "string" },
        notes: { type: "string" },
      },
      required: ["org"],
    },
  },
  {
    name: "schedule_divisions",
    description:
      "Schedule TWO OR MORE divisions that share the same fields — e.g. a mixed " +
      "and a women's division on four fields. Choose how they share:\n\n" +
      "  alternate — divisions take turns; each uses every field for a round, " +
      "then hands over. Fewer fields needed, longer day.\n" +
      "  split — divisions play concurrently on dedicated fields. Shorter day, " +
      "but each division has fewer fields.\n\n" +
      "Neither is better in the abstract: alternate suits a site short of " +
      "fields, split suits a site short of daylight. Report the trade-off and " +
      "let the TD choose. Replaces the whole schedule.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", description: "alternate | split" },
        divisions: {
          type: "array",
          description:
            "Which divisions to schedule. Omit to use every division that has " +
            "accepted teams.",
          items: { type: "string" },
        },
        fields: { type: "number" },
        days: { type: "number" },
        roundsPerDay: { type: "number" },
        roundMinutes: { type: "number" },
        startTime: { type: "string", description: "HH:MM" },
      },
      required: ["mode"],
    },
  },
  {
    name: "manage_sites",
    description:
      "Manage venues for a tournament spread across more than one location. " +
      "Actions: list, add, update, remove, assign_fields.\n\n" +
      "Travel time between sites is a scheduling constraint, not a footnote — a " +
      "team sent across town between consecutive rounds arrives late and delays " +
      "everyone on that field. Keep a whole pool at one venue wherever possible.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "list | add | update | remove | assign_fields",
        },
        siteId: { type: "string" },
        name: { type: "string" },
        address: { type: "string" },
        travelMinutes: {
          type: "number",
          description: "Door-to-door minutes from the primary site.",
        },
        isPrimary: { type: "boolean" },
        parkingNotes: { type: "string" },
        fieldNames: {
          type: "array",
          description: "assign_fields: which fields belong to this site.",
          items: { type: "string" },
        },
      },
      required: ["action"],
    },
  },
  {
    name: "edit_game",
    description:
      "Override anything about a single game: which field, round, start time, " +
      "venue, which teams, the score, or its status. This is the escape hatch — " +
      "whatever a generator produced, the TD can overrule it, and so can you on " +
      "their behalf.\n\n" +
      "Use it for the real-world fixes generators can't anticipate: a waterlogged " +
      "field, a team stuck in traffic, a showcase game moved to the stadium, a " +
      "captain's agreed swap. Say plainly what you changed and what now needs " +
      "re-announcing.",
    input_schema: {
      type: "object",
      properties: {
        gameCode: {
          type: "string",
          description: "The game's code, e.g. G12. Use get_schedule to find it.",
        },
        field: { type: "string" },
        round: { type: "number" },
        startTime: { type: "string", description: "HH:MM" },
        day: { type: "number" },
        siteName: { type: "string" },
        homeTeam: { type: "string" },
        awayTeam: { type: "string" },
        homeScore: { type: "number" },
        awayScore: { type: "number" },
        status: {
          type: "string",
          description: "scheduled | in_progress | final | forfeit",
        },
      },
      required: ["gameCode"],
    },
  },
  {
    name: "get_schedule",
    description:
      "Read the current schedule with game codes, so you can reference or edit " +
      "specific games. Optionally filter to one round, division, or team.",
    input_schema: {
      type: "object",
      properties: {
        round: { type: "number" },
        division: { type: "string" },
        team: { type: "string" },
        unplayedOnly: { type: "boolean" },
      },
    },
  },
  {
    name: "withdraw_team",
    description:
      "Handle a team dropping out. Call WITHOUT confirm first: it reports the " +
      "damage — which games are affected, whether pools are now uneven, whether " +
      "the format still works — and lists the options. Present those to the TD, " +
      "get a decision, then call again with confirm true and the chosen action.\n\n" +
      "This is the tool for 'Team B just dropped, what do we do?'",
    input_schema: {
      type: "object",
      properties: {
        teamName: { type: "string" },
        confirm: {
          type: "boolean",
          description: "false or omitted = report impact only, change nothing",
        },
        replacementTeam: {
          type: "string",
          description:
            "Name of a waitlisted team to promote into the vacated slot, " +
            "inheriting its seed and pool. The cleanest fix when available.",
        },
        action: {
          type: "string",
          description:
            "forfeit — keep the schedule, mark their remaining games forfeited " +
            "(use when it is too late to reshuffle, e.g. mid-tournament); " +
            "remove — delete their unplayed games and leave the pool short; " +
            "regenerate — rebuild the schedule for the reduced field.",
        },
      },
      required: ["teamName"],
    },
  },
  {
    name: "manage_waiver",
    description:
      "Create a waiver from a template, or rewrite an existing one. Templates: " +
      "'participant' (every player), 'minor' (parent/guardian consent for under " +
      "18s), 'team' (captain signs — rosters, payment, conduct), 'volunteer'. " +
      "Use action 'list' first to see what already exists.\n\n" +
      "Always tell the TD these are a starting point and not legal advice, and " +
      "that their school or field provider may require specific language. Editing " +
      "bumps the version; signatures already collected keep a snapshot of the text " +
      "the person actually agreed to.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "list | create | rewrite",
        },
        templateKey: {
          type: "string",
          description: "create: participant | minor | team | volunteer",
        },
        waiverId: { type: "string", description: "rewrite: which waiver" },
        title: { type: "string" },
        body: { type: "string", description: "rewrite: the full replacement text" },
        required: { type: "boolean" },
      },
      required: ["action"],
    },
  },
  {
    name: "post_announcement",
    description:
      "Post an announcement to the public tournament page, and optionally " +
      "broadcast it to the Telegram group. Use for weather holds, round starts, " +
      "field changes.",
    input_schema: {
      type: "object",
      properties: {
        body: { type: "string" },
        level: { type: "string", description: "info | warning | urgent" },
        broadcastTelegram: { type: "boolean" },
      },
      required: ["body"],
    },
  },
  {
    name: "get_tournament_doc",
    description:
      "Export the entire tournament as one JSON document — venue, sites, fields " +
      "with real geometry, markers, teams, the full schedule, waivers, tasks, " +
      "sponsors. Use it to read the whole state at once, to show the TD what " +
      "they have, or as the basis for a bulk edit.\n\n" +
      "Captain contact details are redacted unless includeContacts is set, and " +
      "it never contains rosters, waiver signatures, or consent flags. The " +
      "default export is safe to paste into a chat or save to a file; only ask " +
      "for contacts when the TD wants a real backup or a platform migration.",
    input_schema: {
      type: "object",
      properties: {
        includeContacts: {
          type: "boolean",
          description: "Include captain emails and phones. Personal data — ask first.",
        },
        section: {
          type: "string",
          description:
            "Optional: return just one section — tournament, sites, fields, " +
            "markers, teams, schedule, waivers, tasks, sponsors.",
        },
      },
    },
  },
  {
    name: "apply_tournament_doc",
    description:
      "Apply a tournament document, replacing the collections it contains. This " +
      "is the most powerful override available: anything the system can express, " +
      "you can write directly.\n\n" +
      "ALWAYS call with dryRun true first and show the TD the report. It " +
      "separates ordinary changes from destructive ones. Applying is refused " +
      "outright if it would erase played results or waivers that people have " +
      "signed, unless allowDestructive is set — and you should only set that " +
      "after the TD has explicitly confirmed they mean it.\n\n" +
      "Send the complete document, not a fragment: collections you omit are " +
      "treated as empty.",
    input_schema: {
      type: "object",
      properties: {
        doc: { type: "object", description: "The complete tournament document." },
        dryRun: { type: "boolean" },
        allowDestructive: { type: "boolean" },
      },
      required: ["doc"],
    },
  },
  {
    name: "get_status",
    description:
      "Read the current state of the tournament: facts, team counts by status, " +
      "payment status, sponsor pipeline, upcoming and late tasks, schedule state. " +
      "Call this at the start of a conversation before asking the TD anything.",
    input_schema: { type: "object", properties: {} },
  },
];

type Ctx = { tournamentId: string; orgId: string };

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: Ctx,
): Promise<string> {
  switch (name) {
    case "update_tournament":
      return updateTournament(input, ctx);
    case "generate_timeline":
      return generateTimeline(input, ctx);
    case "add_team":
      return addTeam(input, ctx);
    case "generate_schedule":
      return generateSchedule(input, ctx);
    case "define_custom_format":
      return defineCustomFormat(input, ctx);
    case "pair_swiss_round":
      return pairSwissRound(input, ctx);
    case "draft_outreach":
      return draftOutreach(input, ctx);
    case "add_sponsor":
      return addSponsor(input, ctx);
    case "schedule_divisions":
      return scheduleDivisions(input, ctx);
    case "manage_sites":
      return manageSites(input, ctx);
    case "edit_game":
      return editGame(input, ctx);
    case "get_schedule":
      return getSchedule(input, ctx);
    case "withdraw_team":
      return withdrawTeam(input, ctx);
    case "manage_waiver":
      return manageWaiver(input, ctx);
    case "post_announcement":
      return postAnnouncement(input, ctx);
    case "get_tournament_doc":
      return getTournamentDoc(input, ctx);
    case "apply_tournament_doc":
      return applyTournamentDoc(input, ctx);
    case "get_status":
      return getStatus(ctx);
    default:
      return `Unknown tool: ${name}`;
  }
}

function updateTournament(input: Record<string, any>, ctx: Ctx) {
  const patch: Record<string, unknown> = {};
  const passthrough = [
    "name", "startDate", "endDate", "venueName", "venueAddress", "city",
    "fieldCount", "surface", "division", "teamTarget", "sanctioned",
    "applyDeadline", "acceptanceDate", "paymentDeadline", "rosterDeadline",
    "refundPolicy", "description", "directions", "paymentNote",
  ];
  for (const k of passthrough) if (input[k] !== undefined) patch[k] = input[k];
  if (input.bidFee !== undefined) patch.bidFee = Math.round(input.bidFee * 100);
  if (input.venueLat !== undefined) patch.venueLat = String(input.venueLat);
  if (input.venueLng !== undefined) patch.venueLng = String(input.venueLng);
  if (input.paymentOptions !== undefined) {
    patch.paymentOptions = input.paymentOptions?.length
      ? JSON.stringify(input.paymentOptions)
      : null;
  }

  if (!Object.keys(patch).length) return "Nothing to update.";

  db.update(schema.tournaments)
    .set(patch)
    .where(eq(schema.tournaments.id, ctx.tournamentId))
    .run();

  return `Updated: ${Object.keys(patch).join(", ")}.`;
}

function generateTimeline(input: Record<string, any>, ctx: Ctx) {
  const rows = buildTimeline(input.eventDate, new Date());

  db.delete(schema.tasks)
    .where(eq(schema.tasks.tournamentId, ctx.tournamentId))
    .run();

  for (const r of rows) {
    db.insert(schema.tasks)
      .values({
        id: nanoid(),
        tournamentId: ctx.tournamentId,
        phase: r.phase,
        task: r.task,
        owner: r.owner,
        dueDate: r.due,
        hardDeadline: r.hard,
      })
      .run();
  }

  const late = rows.filter((r) => r.status === "LATE" && r.weeksBefore > 0);
  const lateHard = late.filter((r) => r.hard);
  const soon = rows.filter((r) => r.status === "THIS WEEK");

  const lines = [
    `Generated ${rows.length} deadlines from event date ${input.eventDate}.`,
    `${late.length} already late, ${soon.length} due this week.`,
  ];
  if (lateHard.length) {
    lines.push("", "Hard deadlines already passed (cannot be fixed by working harder):");
    for (const r of lateHard) lines.push(`  - ${r.task} (was due ${r.due})`);
  }
  if (soon.length) {
    lines.push("", "Due this week:");
    for (const r of soon) lines.push(`  - ${r.task} (${r.owner})`);
  }
  return lines.join("\n");
}

function addTeam(input: Record<string, any>, ctx: Ctx) {
  const existing = db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.tournamentId, ctx.tournamentId),
        eq(schema.teams.name, input.name),
      ),
    )
    .get();

  const values: Record<string, unknown> = {};
  for (const k of [
    "school", "division", "captainName", "captainEmail", "captainPhone",
    "status", "seed", "notes",
  ]) {
    if (input[k] !== undefined) values[k] = input[k];
  }

  if (existing) {
    db.update(schema.teams)
      .set(values)
      .where(eq(schema.teams.id, existing.id))
      .run();
    return `Updated team "${input.name}".`;
  }

  db.insert(schema.teams)
    .values({
      id: nanoid(),
      tournamentId: ctx.tournamentId,
      name: input.name,
      status: (input.status as string) ?? "applied",
      ...values,
    })
    .run();
  return `Added team "${input.name}".`;
}

function generateSchedule(input: Record<string, any>, ctx: Ctx) {
  const t = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, ctx.tournamentId))
    .get();
  if (!t) return "Tournament not found.";

  const accepted = db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.tournamentId, ctx.tournamentId),
        eq(schema.teams.status, "accepted"),
      ),
    )
    .all();

  if (accepted.length < 3) {
    return `Only ${accepted.length} accepted team(s). Need at least 3 to build a format. ` +
      `Accept teams first, or tell me the team count you're planning for and I'll model it.`;
  }

  const fields = input.fields ?? t.fieldCount ?? 4;
  const days = input.days ?? 2;
  const roundMinutes = input.roundMinutes ?? 120;
  const roundsPerDay = input.roundsPerDay ?? 4;
  const gameTo = input.gameTo ?? 15;

  const fmt = buildFormat({
    teams: accepted.length,
    days,
    fields,
    roundMinutes,
    hoursPerDay: (roundsPerDay * roundMinutes) / 60,
    gameTo,
  });

  if (fmt.problems.length) {
    return [
      "That plan does not fit. The format manual's limits are being violated:",
      ...fmt.problems.map((p) => `  - ${p}`),
      "",
      "Options: add a field, add hours or a day, play to 11 instead of 15, or " +
        "reduce the field size. Which do you want?",
    ].join("\n");
  }

  // Seed by explicit seed where set, otherwise by insertion order.
  const seeded = [...accepted].sort(
    (a, b) => (a.seed ?? 999) - (b.seed ?? 999),
  );
  const games = layOutSchedule(fmt, {
    startTime: input.startTime ?? "09:00",
    roundMinutes,
    fields,
    roundsPerDay,
    days,
    teamNames: seeded.map((t) => t.name),
  });

  const byName = new Map(seeded.map((t) => [t.name, t.id]));

  db.delete(schema.games)
    .where(eq(schema.games.tournamentId, ctx.tournamentId))
    .run();

  for (const g of games) {
    db.insert(schema.games)
      .values({
        id: nanoid(),
        tournamentId: ctx.tournamentId,
        gameCode: g.gameId,
        day: g.day,
        round: g.round,
        startTime: g.startTime,
        field: String(g.field),
        stage: g.stage,
        pool: g.pool,
        homeTeamId: byName.get(g.homeTeam) ?? null,
        awayTeamId: byName.get(g.awayTeam) ?? null,
        homeLabel: byName.has(g.homeTeam) ? null : g.homeTeam,
        awayLabel: byName.has(g.awayTeam) ? null : g.awayTeam,
      })
      .run();
  }

  // Persist pool assignments back onto the teams.
  for (const [poolName, seeds] of Object.entries(fmt.pools)) {
    for (const seed of seeds) {
      const team = seeded[seed - 1];
      if (team) {
        db.update(schema.teams)
          .set({ pool: poolName, seed })
          .where(eq(schema.teams.id, team.id))
          .run();
      }
    }
  }

  const poolSummary = Object.entries(fmt.pools)
    .map(([n, s]) => `Pool ${n}: ${s.map((x) => seeded[x - 1]?.name ?? x).join(", ")}`)
    .join("\n  ");

  return [
    `Generated ${games.length} games for ${accepted.length} teams on ${fields} fields ` +
      `over ${days} day(s).`,
    `Guaranteed games per team: ${fmt.gamesGuaranteed}. Worst case: ` +
      `${fmt.worstCaseGamesPerTeam}.`,
    "",
    "  " + poolSummary,
    "",
    "Schedule is live on the public page.",
  ].join("\n");
}

function clockFrom(start: string, roundIndex: number, minutes: number) {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + roundIndex * minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
}

function defineCustomFormat(input: Record<string, any>, ctx: Ctx) {
  const t = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, ctx.tournamentId))
    .get();
  if (!t) return "Tournament not found.";

  const teams = db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.tournamentId, ctx.tournamentId),
        eq(schema.teams.status, "accepted"),
      ),
    )
    .all();
  if (teams.length < 2) {
    return `Only ${teams.length} accepted team(s). Accept teams before building a format.`;
  }

  const spec: CustomFormatSpec = {
    name: input.name,
    description: input.description,
    pools: input.pools,
    stages: input.stages,
    gameTo: input.gameTo,
  };

  const teamNames = teams.map((x) => x.name);
  const result = expand(spec, teamNames);

  const fields = input.fields ?? t.fieldCount ?? 4;
  const roundsPerDay = input.roundsPerDay ?? 4;
  const days = input.days ?? 2;
  const roundMinutes = input.roundMinutes ?? 120;
  const startTime = input.startTime ?? "09:00";

  const capacity = checkCapacity(result, { fields, roundsPerDay, days });

  if (!result.ok || capacity.length) {
    return [
      `Format "${spec.name}" was NOT applied.`,
      "",
      ...(result.errors.length ? ["Errors:", ...result.errors.map((e) => `  - ${e}`)] : []),
      ...(capacity.length ? ["Capacity:", ...capacity.map((e) => `  - ${e}`)] : []),
      ...(result.warnings.length
        ? ["", "Warnings:", ...result.warnings.map((w) => `  - ${w}`)]
        : []),
      "",
      "Fix the errors and call again.",
    ].join("\n");
  }

  const idByName = new Map(teams.map((x) => [x.name, x.id]));

  db.delete(schema.games)
    .where(eq(schema.games.tournamentId, ctx.tournamentId))
    .run();

  const perRound = new Map<number, number>();
  for (const g of result.games) {
    const used = perRound.get(g.round) ?? 0;
    perRound.set(g.round, used + 1);
    const day = Math.floor((g.round - 1) / roundsPerDay) + 1;
    const slot = (g.round - 1) % roundsPerDay;

    const homeId = idByName.get(g.home) ?? null;
    const awayId = idByName.get(g.away) ?? null;

    db.insert(schema.games)
      .values({
        id: nanoid(),
        tournamentId: ctx.tournamentId,
        gameCode: g.gameId,
        day,
        round: g.round,
        startTime: clockFrom(startTime, slot, roundMinutes),
        field: String(used + 1),
        stage: g.stage,
        pool: g.pool,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeLabel: homeId ? null : g.home,
        awayLabel: awayId ? null : g.away,
      })
      .run();
  }

  // Record pool assignments so standings group correctly.
  for (const p of spec.pools ?? []) {
    for (const name of p.teams) {
      const id = idByName.get(name);
      if (id) {
        db.update(schema.teams)
          .set({ pool: p.name })
          .where(eq(schema.teams.id, id))
          .run();
      }
    }
  }

  advanceTournament(ctx.tournamentId);

  const counts = Object.values(result.gamesPerTeam);
  return [
    `Applied custom format "${spec.name}".`,
    `${result.games.length} games over ${result.rounds} rounds on ${fields} fields.`,
    counts.length
      ? `Games per team: ${Math.min(...counts)}–${Math.max(...counts)}.`
      : "",
    ...(result.warnings.length
      ? ["", "Warnings (applied anyway — your call):", ...result.warnings.map((w) => `  - ${w}`)]
      : []),
    "",
    "Live on the public schedule. Placeholders resolve automatically as scores land.",
  ]
    .filter(Boolean)
    .join("\n");
}

function pairSwissRound(input: Record<string, any>, ctx: Ctx) {
  const label = input.label ?? "Swiss";
  const teams = db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.tournamentId, ctx.tournamentId),
        eq(schema.teams.status, "accepted"),
      ),
    )
    .all();
  const games = db
    .select()
    .from(schema.games)
    .where(eq(schema.games.tournamentId, ctx.tournamentId))
    .all();

  const pending = games.filter((g) => g.status !== "final");
  if (pending.length) {
    return `${pending.length} game(s) are not final yet. Finish the round before pairing the next one.`;
  }

  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  const record = new Map<string, { w: number; diff: number }>();
  for (const t of teams) record.set(t.id, { w: 0, diff: 0 });

  const played = new Set<string>();
  for (const g of games) {
    if (g.status !== "final" || !g.homeTeamId || !g.awayTeamId) continue;
    played.add([g.homeTeamId, g.awayTeamId].sort().join("|"));
    const hs = g.homeScore ?? 0;
    const as = g.awayScore ?? 0;
    const h = record.get(g.homeTeamId);
    const a = record.get(g.awayTeamId);
    if (h) {
      h.diff += hs - as;
      if (hs > as) h.w++;
    }
    if (a) {
      a.diff += as - hs;
      if (as > hs) a.w++;
    }
  }

  const ranked = [...record.entries()].sort(
    ([, x], [, y]) => y.w - x.w || y.diff - x.diff,
  );

  // Greedy pairing down the standings, skipping rematches where possible.
  const unpaired = ranked.map(([id]) => id);
  const pairs: [string, string][] = [];
  const rematches: string[] = [];
  while (unpaired.length > 1) {
    const a = unpaired.shift()!;
    let idx = unpaired.findIndex(
      (b) => !played.has([a, b].sort().join("|")),
    );
    if (idx === -1) {
      idx = 0;
      rematches.push(`${nameById.get(a)} v ${nameById.get(unpaired[0])}`);
    }
    const b = unpaired.splice(idx, 1)[0];
    pairs.push([a, b]);
  }
  const bye = unpaired[0];

  const nextRound = Math.max(0, ...games.map((g) => g.round ?? 0)) + 1;
  const nextCode = games.length + 1;
  const roundsPerDay = 4;
  const day = Math.floor((nextRound - 1) / roundsPerDay) + 1;
  const sample = games.find((g) => g.round === nextRound - 1);

  pairs.forEach(([a, b], i) => {
    db.insert(schema.games)
      .values({
        id: nanoid(),
        tournamentId: ctx.tournamentId,
        gameCode: `G${nextCode + i}`,
        day,
        round: nextRound,
        startTime: sample?.startTime ?? "09:00",
        field: String(i + 1),
        stage: "pool",
        pool: label,
        homeTeamId: a,
        awayTeamId: b,
      })
      .run();
  });

  return [
    `Paired swiss round ${nextRound}: ${pairs.length} games.`,
    ...pairs.map(
      ([a, b], i) => `  F${i + 1}  ${nameById.get(a)} v ${nameById.get(b)}`,
    ),
    bye ? `  Bye: ${nameById.get(bye)}` : "",
    rematches.length
      ? `\nUnavoidable rematches: ${rematches.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}


function scheduleDivisions(input: Record<string, any>, ctx: Ctx) {
  const t = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, ctx.tournamentId))
    .get();
  if (!t) return "Tournament not found.";

  const accepted = db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.tournamentId, ctx.tournamentId),
        eq(schema.teams.status, "accepted"),
      ),
    )
    .all();

  const byDivision = new Map<string, typeof accepted>();
  for (const team of accepted) {
    const d = team.division || t.division || "Open";
    byDivision.set(d, [...(byDivision.get(d) ?? []), team]);
  }

  const wanted: string[] = input.divisions?.length
    ? input.divisions
    : [...byDivision.keys()];
  const divisions = wanted.filter((d) => (byDivision.get(d)?.length ?? 0) >= 3);

  if (divisions.length < 2) {
    return (
      `Only ${divisions.length} division has 3+ accepted teams ` +
      `(${[...byDivision.entries()].map(([d, x]) => `${d}: ${x.length}`).join(", ") || "none"}). ` +
      `Use generate_schedule for a single-division event.`
    );
  }

  const mode = input.mode === "split" ? "split" : "alternate";
  const fields = input.fields ?? t.fieldCount ?? 4;
  const days = input.days ?? 2;
  const roundsPerDay = input.roundsPerDay ?? 4;
  const roundMinutes = input.roundMinutes ?? 120;
  const startTime = input.startTime ?? "09:00";

  // Build each division's own format, then hand the lot to the allocator.
  const plans = [];
  const perDivisionNotes: string[] = [];
  for (const d of divisions) {
    const teams = (byDivision.get(d) ?? []).sort(
      (a, b) => (a.seed ?? 999) - (b.seed ?? 999),
    );
    const fmt = buildFormat({
      teams: teams.length,
      days,
      fields,
      roundMinutes,
      hoursPerDay: (roundsPerDay * roundMinutes) / 60,
      gameTo: 15,
    });
    const laid = layOutSchedule(fmt, {
      startTime,
      roundMinutes,
      fields,
      roundsPerDay,
      days,
      teamNames: teams.map((x) => x.name),
    });
    plans.push({
      division: d,
      games: laid.map((g) => ({
        gameId: `${d.slice(0, 2).toUpperCase()}-${g.gameId}`,
        round: g.round,
        stage: g.stage,
        pool: `${d} ${g.pool}`,
        home: g.homeTeam,
        away: g.awayTeam,
      })),
    });
    perDivisionNotes.push(
      `  ${d}: ${teams.length} teams, ${laid.length} games, ` +
        `${fmt.gamesGuaranteed} guaranteed`,
    );

    // Record pool assignments for this division's teams.
    for (const [poolName, seeds] of Object.entries(fmt.pools)) {
      for (const seed of seeds) {
        const team = teams[seed - 1];
        if (team) {
          db.update(schema.teams)
            .set({ pool: `${d} ${poolName}`, seed })
            .where(eq(schema.teams.id, team.id))
            .run();
        }
      }
    }
  }

  const result = allocate(plans, {
    mode,
    fields,
    roundsPerDay,
    roundMinutes,
    startTime,
    days,
  });

  const nameToId = new Map(accepted.map((x) => [x.name, x.id]));

  db.delete(schema.games)
    .where(eq(schema.games.tournamentId, ctx.tournamentId))
    .run();

  for (const g of result.games) {
    const homeId = nameToId.get(g.home) ?? null;
    const awayId = nameToId.get(g.away) ?? null;
    db.insert(schema.games)
      .values({
        id: nanoid(),
        tournamentId: ctx.tournamentId,
        gameCode: g.gameId,
        day: g.day,
        round: g.globalRound,
        startTime: g.startTime,
        field: String(g.field),
        stage: g.stage,
        pool: g.pool,
        division: g.division,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeLabel: homeId ? null : g.home,
        awayLabel: awayId ? null : g.away,
      })
      .run();
  }

  db.update(schema.tournaments)
    .set({ divisionMode: mode, division: "multiple" })
    .where(eq(schema.tournaments.id, ctx.tournamentId))
    .run();

  advanceTournament(ctx.tournamentId);

  return [
    `Scheduled ${divisions.length} divisions in ${mode} mode on ${fields} fields.`,
    ...perDivisionNotes,
    "",
    result.summary,
    ...(result.problems.length
      ? ["", "Warnings:", ...result.problems.map((p) => `  - ${p}`)]
      : []),
    "",
    mode === "alternate"
      ? "Switch to split mode if the day runs too long."
      : "Switch to alternate mode if a division needs more fields at once.",
  ].join("\n");
}


function siteList(tournamentId: string) {
  return db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.tournamentId, tournamentId))
    .all();
}

function manageSites(input: Record<string, any>, ctx: Ctx) {
  const sites = siteList(ctx.tournamentId);

  if (input.action === "list") {
    if (!sites.length) {
      return (
        "No sites defined — the tournament is treated as a single venue. Add one " +
        "only if fields are genuinely at separate locations."
      );
    }
    const fields = db
      .select()
      .from(schema.fields)
      .where(eq(schema.fields.tournamentId, ctx.tournamentId))
      .all();
    return [
      ...sites.map((x) => {
        const mine = fields.filter((f) => f.siteId === x.id);
        return (
          `  ${x.id} — ${x.name}${x.isPrimary ? " (primary)" : ""}, ` +
          `${x.travelMinutes ?? 0} min from primary, ${mine.length} field(s)` +
          (mine.length ? `: ${mine.map((f) => f.name).join(", ")}` : "")
        );
      }),
      "",
      describeSites(
        sites.map((x) => ({
          id: x.id,
          name: x.name,
          travelMinutes: x.travelMinutes ?? 0,
          isPrimary: !!x.isPrimary,
        })),
      ),
    ].join("\n");
  }

  if (input.action === "add") {
    if (!input.name) return "A site needs a name.";
    const id = nanoid();
    const isPrimary = input.isPrimary ?? sites.length === 0;
    if (isPrimary) {
      db.update(schema.sites)
        .set({ isPrimary: false })
        .where(eq(schema.sites.tournamentId, ctx.tournamentId))
        .run();
    }
    db.insert(schema.sites)
      .values({
        id,
        tournamentId: ctx.tournamentId,
        name: input.name,
        address: input.address ?? null,
        travelMinutes: Math.round(input.travelMinutes ?? 0),
        isPrimary,
        parkingNotes: input.parkingNotes ?? null,
        sortOrder: sites.length,
      })
      .run();
    return (
      `Added site "${input.name}"${isPrimary ? " as the primary venue" : ""} ` +
      `(id ${id}). Assign fields to it with action assign_fields, then reschedule ` +
      `so pools stay at one venue.`
    );
  }

  if (input.action === "update") {
    const site =
      sites.find((x) => x.id === input.siteId) ??
      sites.find((x) => x.name === input.name);
    if (!site) return "Site not found. Call with action list first.";
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "address", "parkingNotes"]) {
      if (input[k] !== undefined) patch[k] = input[k];
    }
    if (input.travelMinutes !== undefined) {
      patch.travelMinutes = Math.round(input.travelMinutes);
    }
    if (input.isPrimary) {
      db.update(schema.sites)
        .set({ isPrimary: false })
        .where(eq(schema.sites.tournamentId, ctx.tournamentId))
        .run();
      patch.isPrimary = true;
    }
    db.update(schema.sites).set(patch).where(eq(schema.sites.id, site.id)).run();
    return `Updated ${site.name}: ${Object.keys(patch).join(", ")}.`;
  }

  if (input.action === "remove") {
    const site = sites.find(
      (x) => x.id === input.siteId || x.name === input.name,
    );
    if (!site) return "Site not found.";
    db.update(schema.fields)
      .set({ siteId: null })
      .where(eq(schema.fields.siteId, site.id))
      .run();
    db.update(schema.games)
      .set({ siteId: null })
      .where(eq(schema.games.siteId, site.id))
      .run();
    db.delete(schema.sites).where(eq(schema.sites.id, site.id)).run();
    return `Removed ${site.name}. Its fields and games are now unassigned.`;
  }

  if (input.action === "assign_fields") {
    const site = sites.find(
      (x) => x.id === input.siteId || x.name === input.name,
    );
    if (!site) return "Site not found. Call with action list first.";
    const names: string[] = input.fieldNames ?? [];
    if (!names.length) return "Give fieldNames to assign.";

    const fields = db
      .select()
      .from(schema.fields)
      .where(eq(schema.fields.tournamentId, ctx.tournamentId))
      .all();
    const assigned: string[] = [];
    const missing: string[] = [];
    for (const n of names) {
      const f = fields.find((x) => x.name.toLowerCase() === n.toLowerCase());
      if (!f) {
        missing.push(n);
        continue;
      }
      db.update(schema.fields)
        .set({ siteId: site.id })
        .where(eq(schema.fields.id, f.id))
        .run();
      assigned.push(f.name);
      // Keep existing games pointing at the right venue.
      db.update(schema.games)
        .set({ siteId: site.id })
        .where(
          and(
            eq(schema.games.tournamentId, ctx.tournamentId),
            eq(schema.games.field, f.name.replace(/^Field\s*/i, "")),
          ),
        )
        .run();
    }
    return [
      `Assigned ${assigned.length} field(s) to ${site.name}: ${assigned.join(", ")}.`,
      missing.length ? `Not found: ${missing.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return 'Unknown action. Use list, add, update, remove, or assign_fields.';
}

function getSchedule(input: Record<string, any>, ctx: Ctx) {
  const teams = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, ctx.tournamentId))
    .all();
  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  const sites = new Map(siteList(ctx.tournamentId).map((s) => [s.id, s.name]));

  let games = db
    .select()
    .from(schema.games)
    .where(eq(schema.games.tournamentId, ctx.tournamentId))
    .all();

  if (input.round !== undefined) games = games.filter((g) => g.round === input.round);
  if (input.division) games = games.filter((g) => g.division === input.division);
  if (input.unplayedOnly) games = games.filter((g) => g.status !== "final");
  if (input.team) {
    const t = teams.find(
      (x) => x.name.toLowerCase() === String(input.team).toLowerCase(),
    );
    if (!t) return `No team called "${input.team}".`;
    games = games.filter((g) => g.homeTeamId === t.id || g.awayTeamId === t.id);
  }

  if (!games.length) return "No games match that filter.";

  return games
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || Number(a.field) - Number(b.field))
    .map((g) => {
      const home = nameById.get(g.homeTeamId ?? "") ?? g.homeLabel ?? "TBD";
      const away = nameById.get(g.awayTeamId ?? "") ?? g.awayLabel ?? "TBD";
      const score = g.status === "final" ? ` ${g.homeScore}-${g.awayScore}` : "";
      const site = g.siteId ? ` @${sites.get(g.siteId) ?? "?"}` : "";
      return (
        `  ${g.gameCode ?? g.id.slice(0, 6)}  D${g.day ?? 1} R${g.round} ` +
        `${g.startTime ?? ""} F${g.field}${site}  ${home} v ${away}${score}  ` +
        `[${g.status}]`
      );
    })
    .join("\n");
}

function editGame(input: Record<string, any>, ctx: Ctx) {
  const game = db
    .select()
    .from(schema.games)
    .where(
      and(
        eq(schema.games.tournamentId, ctx.tournamentId),
        eq(schema.games.gameCode, input.gameCode),
      ),
    )
    .get();
  if (!game) {
    return `No game with code "${input.gameCode}". Call get_schedule to list them.`;
  }

  const teams = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, ctx.tournamentId))
    .all();
  const byName = (n: string) =>
    teams.find((t) => t.name.toLowerCase() === String(n).toLowerCase());

  const patch: Record<string, unknown> = {};
  const changed: string[] = [];

  if (input.field !== undefined) {
    patch.field = String(input.field);
    changed.push(`field -> ${input.field}`);
  }
  if (input.round !== undefined) {
    patch.round = input.round;
    changed.push(`round -> ${input.round}`);
  }
  if (input.day !== undefined) {
    patch.day = input.day;
    changed.push(`day -> ${input.day}`);
  }
  if (input.startTime !== undefined) {
    patch.startTime = input.startTime;
    changed.push(`start -> ${input.startTime}`);
  }
  if (input.siteName !== undefined) {
    const site = siteList(ctx.tournamentId).find(
      (s) => s.name.toLowerCase() === String(input.siteName).toLowerCase(),
    );
    if (!site) return `No site called "${input.siteName}".`;
    patch.siteId = site.id;
    changed.push(`venue -> ${site.name}`);
  }
  if (input.homeTeam !== undefined) {
    const t = byName(input.homeTeam);
    if (!t) return `No team called "${input.homeTeam}".`;
    patch.homeTeamId = t.id;
    patch.homeLabel = null;
    changed.push(`home -> ${t.name}`);
  }
  if (input.awayTeam !== undefined) {
    const t = byName(input.awayTeam);
    if (!t) return `No team called "${input.awayTeam}".`;
    patch.awayTeamId = t.id;
    patch.awayLabel = null;
    changed.push(`away -> ${t.name}`);
  }
  if (input.homeScore !== undefined) {
    patch.homeScore = input.homeScore;
    changed.push(`home score -> ${input.homeScore}`);
  }
  if (input.awayScore !== undefined) {
    patch.awayScore = input.awayScore;
    changed.push(`away score -> ${input.awayScore}`);
  }
  if (input.status !== undefined) {
    patch.status = input.status;
    changed.push(`status -> ${input.status}`);
  }
  if (
    (input.homeScore !== undefined || input.awayScore !== undefined) &&
    input.status === undefined
  ) {
    patch.status = "final";
    changed.push("status -> final");
  }

  if (!changed.length) return "Nothing to change.";

  patch.reportedVia = "admin";
  patch.reportedAt = Math.floor(Date.now() / 1000);

  db.update(schema.games)
    .set(patch)
    .where(eq(schema.games.id, game.id))
    .run();

  advanceTournament(ctx.tournamentId);

  // An override can create a clash the generator would never have produced,
  // so re-check rather than assuming the TD spotted it.
  const all = db
    .select()
    .from(schema.games)
    .where(eq(schema.games.tournamentId, ctx.tournamentId))
    .all();
  const updated = all.find((g) => g.id === game.id)!;
  const clashes = all.filter(
    (g) =>
      g.id !== updated.id &&
      g.round === updated.round &&
      g.field === updated.field &&
      (g.siteId ?? null) === (updated.siteId ?? null),
  );

  const sites = siteList(ctx.tournamentId);
  const travel = sites.length > 1
    ? travelWarnings(
        all.map((g) => ({
          gameId: g.gameCode ?? g.id,
          round: g.round ?? 0,
          siteId: g.siteId,
          homeTeamId: g.homeTeamId,
          awayTeamId: g.awayTeamId,
          pool: g.pool,
        })),
        sites.map((x) => ({
          id: x.id,
          name: x.name,
          travelMinutes: x.travelMinutes ?? 0,
          isPrimary: !!x.isPrimary,
        })),
        { roundMinutes: 120 },
      )
    : [];

  return [
    `${input.gameCode}: ${changed.join(", ")}.`,
    clashes.length
      ? `\nCLASH: ${clashes.length} other game(s) now sit on field ${updated.field} ` +
        `in round ${updated.round} (${clashes.map((c) => c.gameCode).join(", ")}). ` +
        `Move one of them.`
      : "",
    travel.length ? `\nTravel:\n${travel.map((w) => `  - ${w}`).join("\n")}` : "",
    "\nThe published schedule updates immediately. Tell the affected captains.",
  ]
    .filter(Boolean)
    .join("\n");
}

function withdrawTeam(input: Record<string, any>, ctx: Ctx) {
  const team = db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.tournamentId, ctx.tournamentId),
        eq(schema.teams.name, input.teamName),
      ),
    )
    .get();
  if (!team) return `No team called "${input.teamName}" in this tournament.`;

  const allGames = db
    .select()
    .from(schema.games)
    .where(eq(schema.games.tournamentId, ctx.tournamentId))
    .all();
  const theirs = allGames.filter(
    (g) => g.homeTeamId === team.id || g.awayTeamId === team.id,
  );
  const played = theirs.filter((g) => g.status === "final");
  const unplayed = theirs.filter((g) => g.status !== "final");

  const poolmates = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, ctx.tournamentId))
    .all()
    .filter(
      (x) => x.pool && x.pool === team.pool && x.id !== team.id && x.status === "accepted",
    );

  const waitlist = db
    .select()
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.tournamentId, ctx.tournamentId),
        eq(schema.teams.status, "waitlisted"),
      ),
    )
    .all();

  // --- report only ---------------------------------------------------------
  if (!input.confirm) {
    const lines = [
      `IMPACT OF "${team.name}" WITHDRAWING — nothing has been changed yet.`,
      "",
      `  Pool: ${team.pool ?? "unassigned"} (${poolmates.length} other teams)`,
      `  Seed: ${team.seed ?? "unseeded"}`,
      `  Paid: ${team.feePaid ? `yes, $${((team.amountPaid ?? 0) / 100).toFixed(0)}` : "no"}`,
      `  Games played: ${played.length}`,
      `  Games not yet played: ${unplayed.length}`,
    ];

    if (played.length && unplayed.length) {
      lines.push(
        "",
        "  They are mid-tournament. Removing completed results would change the",
        "  standings of teams that already played them, which is unfair to those",
        "  teams. Forfeiting the remainder is usually the right call.",
      );
    }

    lines.push("", "OPTIONS:");
    if (waitlist.length) {
      lines.push(
        `  1. Promote a waitlisted team into the slot — ${waitlist
          .map((w) => w.name)
          .join(", ")}. Cleanest: the schedule is untouched, they inherit the seed`,
        `     and pool. Only works before play starts, and only if they can get there.`,
      );
    } else {
      lines.push("  1. No waitlisted teams available to promote.");
    }
    lines.push(
      `  2. Forfeit — keep the schedule, mark their ${unplayed.length} remaining`,
      `     game(s) as forfeits. Right answer once play has begun.`,
      `  3. Remove — delete their unplayed games. The pool runs short and their`,
      `     poolmates each get one fewer game.`,
      `  4. Regenerate — rebuild the whole schedule for the reduced field. Only`,
      `     sensible before play starts; it invalidates anything already printed.`,
      "",
      `Tell me which, and whether to refund. Then I'll call this again with confirm.`,
    );
    return lines.join("\n");
  }

  // --- apply ---------------------------------------------------------------
  db.update(schema.teams)
    .set({ status: "withdrawn" })
    .where(eq(schema.teams.id, team.id))
    .run();

  if (input.replacementTeam) {
    const rep = db
      .select()
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.tournamentId, ctx.tournamentId),
          eq(schema.teams.name, input.replacementTeam),
        ),
      )
      .get();
    if (!rep) return `Withdrew ${team.name}, but no team called "${input.replacementTeam}" to promote.`;

    db.update(schema.teams)
      .set({ status: "accepted", seed: team.seed, pool: team.pool })
      .where(eq(schema.teams.id, rep.id))
      .run();

    for (const g of unplayed) {
      db.update(schema.games)
        .set({
          homeTeamId: g.homeTeamId === team.id ? rep.id : g.homeTeamId,
          awayTeamId: g.awayTeamId === team.id ? rep.id : g.awayTeamId,
        })
        .where(eq(schema.games.id, g.id))
        .run();
    }
    return (
      `${team.name} withdrew. ${rep.name} promoted from the waitlist into seed ` +
      `${team.seed ?? "?"}, pool ${team.pool ?? "?"}, and slotted into all ` +
      `${unplayed.length} remaining game(s). The schedule is otherwise unchanged — ` +
      `nothing printed needs reprinting except the team list.`
    );
  }

  if (input.action === "forfeit") {
    for (const g of unplayed) {
      const isHome = g.homeTeamId === team.id;
      db.update(schema.games)
        .set({
          status: "forfeit",
          homeScore: isHome ? 0 : 15,
          awayScore: isHome ? 15 : 0,
          reportedVia: "admin",
          reportedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(schema.games.id, g.id))
        .run();
    }
    advanceTournament(ctx.tournamentId);
    return (
      `${team.name} withdrew. Their ${unplayed.length} remaining game(s) are ` +
      `recorded as forfeits (15-0). Completed results are untouched, so nobody's ` +
      `existing standings move. Tell the affected captains — they now have a bye ` +
      `where they expected a game.`
    );
  }

  if (input.action === "remove") {
    for (const g of unplayed) {
      db.delete(schema.games).where(eq(schema.games.id, g.id)).run();
    }
    return (
      `${team.name} withdrew and their ${unplayed.length} unplayed game(s) were ` +
      `removed. Pool ${team.pool ?? "?"} now has ${poolmates.length} teams, and ` +
      `those teams each play one fewer game. Check the guaranteed-games number ` +
      `you promised in the bid announcement still holds.`
    );
  }

  if (input.action === "regenerate") {
    return (
      `${team.name} is marked withdrawn. Now call generate_schedule (or ` +
      `schedule_divisions) to rebuild for the reduced field. Anything already ` +
      `printed or sent to captains is now out of date and must be re-sent.`
    );
  }

  return (
    `${team.name} is marked withdrawn. No schedule changes were made — call again ` +
    `with an action (forfeit, remove, regenerate) or a replacementTeam.`
  );
}

function draftOutreach(input: Record<string, any>, ctx: Ctx) {
  db.insert(schema.outreach)
    .values({
      id: nanoid(),
      tournamentId: ctx.tournamentId,
      kind: input.kind,
      toName: input.toName ?? null,
      toEmail: input.toEmail,
      subject: input.subject,
      body: input.body,
      status: "draft",
    })
    .run();
  return (
    `Drafted "${input.subject}" to ${input.toEmail}. It is queued for your approval ` +
    `and will not send until you approve it.`
  );
}

function addSponsor(input: Record<string, any>, ctx: Ctx) {
  const existing = db
    .select()
    .from(schema.sponsors)
    .where(
      and(
        eq(schema.sponsors.tournamentId, ctx.tournamentId),
        eq(schema.sponsors.org, input.org),
      ),
    )
    .get();

  const values: Record<string, unknown> = {};
  for (const k of [
    "contactName", "email", "phone", "type", "stage", "inkindDescription",
    "tier", "notes",
  ]) {
    if (input[k] !== undefined) values[k] = input[k];
  }
  if (input.amount !== undefined) values.amount = Math.round(input.amount * 100);

  if (existing) {
    db.update(schema.sponsors)
      .set(values)
      .where(eq(schema.sponsors.id, existing.id))
      .run();
    return `Updated sponsor "${input.org}".`;
  }
  db.insert(schema.sponsors)
    .values({
      id: nanoid(),
      tournamentId: ctx.tournamentId,
      org: input.org,
      ...values,
    })
    .run();
  return `Added sponsor prospect "${input.org}".`;
}

function manageWaiver(input: Record<string, any>, ctx: Ctx) {
  const t = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, ctx.tournamentId))
    .get();
  if (!t) return "Tournament not found.";

  const existing = db
    .select()
    .from(schema.waivers)
    .where(eq(schema.waivers.tournamentId, ctx.tournamentId))
    .all();

  if (input.action === "list") {
    if (!existing.length) {
      return [
        "No waivers yet. Available templates:",
        ...TEMPLATES.map((x) => `  ${x.key} — ${x.title}: ${x.description}`),
        "",
        LEGAL_DISCLAIMER,
      ].join("\n");
    }
    return [
      "Waivers on this tournament:",
      ...existing.map(
        (w) => `  ${w.id} — "${w.title}" (${w.audience}, v${w.version})`,
      ),
    ].join("\n");
  }

  if (input.action === "create") {
    const tpl = templateByKey(input.templateKey);
    if (!tpl) {
      return `Unknown template "${input.templateKey}". Available: ${TEMPLATES.map((x) => x.key).join(", ")}.`;
    }
    if (existing.some((w) => w.templateKey === tpl.key)) {
      return `A "${tpl.title}" already exists on this tournament. Rewrite it instead.`;
    }
    const body = fillTemplate(tpl.body, {
      tournament_name: t.name,
      dates: formatDateRange(t.startDate, t.endDate) ?? undefined,
      venue: t.venueName ?? undefined,
      venue_owner: t.venueName ?? undefined,
      roster_deadline: t.rosterDeadline ?? undefined,
      payment_deadline: t.paymentDeadline ?? undefined,
      bid_fee: t.bidFee ? `$${(t.bidFee / 100).toFixed(0)}` : undefined,
    });
    const id = nanoid();
    db.insert(schema.waivers)
      .values({
        id,
        tournamentId: ctx.tournamentId,
        title: input.title ?? tpl.title,
        body,
        audience: tpl.audience,
        templateKey: tpl.key,
      })
      .run();
    return [
      `Created "${input.title ?? tpl.title}" (id ${id}).`,
      "Participants can sign it now on the public waiver page.",
      "",
      LEGAL_DISCLAIMER,
    ].join("\n");
  }

  if (input.action === "rewrite") {
    const w = existing.find((x) => x.id === input.waiverId);
    if (!w) {
      return `No waiver with id "${input.waiverId}". Call with action "list" first.`;
    }
    const patch: Record<string, unknown> = {
      updatedAt: Math.floor(Date.now() / 1000),
    };
    if (input.title) patch.title = input.title;
    if (input.required !== undefined) patch.required = input.required;
    if (input.body && input.body !== w.body) {
      patch.body = input.body;
      patch.version = w.version + 1;
    }
    db.update(schema.waivers)
      .set(patch)
      .where(eq(schema.waivers.id, w.id))
      .run();

    const signed = db
      .select()
      .from(schema.waiverSignatures)
      .where(eq(schema.waiverSignatures.waiverId, w.id))
      .all();

    return [
      `Updated "${input.title ?? w.title}"${patch.version ? ` to v${patch.version}` : ""}.`,
      signed.length
        ? `${signed.length} existing signature(s) keep a snapshot of the text they ` +
          `actually agreed to — they are unaffected.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return 'Unknown action. Use "list", "create", or "rewrite".';
}

function postAnnouncement(input: Record<string, any>, ctx: Ctx) {
  db.insert(schema.announcements)
    .values({
      id: nanoid(),
      tournamentId: ctx.tournamentId,
      body: input.body,
      level: input.level ?? "info",
      broadcastTelegram: !!input.broadcastTelegram,
    })
    .run();
  return input.broadcastTelegram
    ? "Posted to the tournament page and queued for the Telegram group."
    : "Posted to the tournament page.";
}


function getTournamentDoc(input: Record<string, any>, ctx: Ctx) {
  const doc = toDoc(ctx.tournamentId, {
    includeContacts: !!input.includeContacts,
  }) as Record<string, unknown>;
  if (input.section) {
    if (!(input.section in doc)) {
      return `Unknown section "${input.section}". Sections: ${Object.keys(doc).join(", ")}.`;
    }
    return JSON.stringify({ [input.section]: doc[input.section] }, null, 2);
  }
  return JSON.stringify(doc, null, 2);
}

function applyTournamentDoc(input: Record<string, any>, ctx: Ctx) {
  const report = applyDoc(ctx.tournamentId, input.doc, {
    dryRun: !!input.dryRun,
    allowDestructive: !!input.allowDestructive,
  });

  const lines: string[] = [];
  lines.push(
    report.applied
      ? "APPLIED."
      : report.ok
        ? "DRY RUN — nothing changed."
        : "NOT APPLIED.",
  );

  if (report.errors.length) {
    lines.push("", "Errors:", ...report.errors.map((e) => `  - ${e}`));
  }
  if (report.destructive.length) {
    lines.push("", "DESTRUCTIVE:", ...report.destructive.map((e) => `  - ${e}`));
  }
  if (report.warnings.length) {
    lines.push("", "Warnings:", ...report.warnings.map((e) => `  - ${e}`));
  }
  if (report.changes.length) {
    lines.push("", "Changes:", ...report.changes.map((e) => `  - ${e}`));
  } else if (report.ok) {
    lines.push("", "No differences from the current state.");
  }

  if (!report.applied && report.ok) {
    lines.push("", "Show this to the TD, then call again without dryRun.");
  }
  if (report.destructive.length && !report.applied) {
    lines.push(
      "",
      "Do not set allowDestructive unless the TD has explicitly confirmed they " +
        "want those records gone.",
    );
  }
  return lines.join("\n");
}

function getStatus(ctx: Ctx) {
  const t = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, ctx.tournamentId))
    .get();
  if (!t) return "Tournament not found.";

  const teams = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, ctx.tournamentId))
    .all();
  const sponsorRows = db
    .select()
    .from(schema.sponsors)
    .where(eq(schema.sponsors.tournamentId, ctx.tournamentId))
    .all();
  const taskRows = db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.tournamentId, ctx.tournamentId))
    .all();
  const gameRows = db
    .select()
    .from(schema.games)
    .where(eq(schema.games.tournamentId, ctx.tournamentId))
    .all();

  const today = new Date().toISOString().slice(0, 10);
  const open = taskRows.filter((x) => !x.done);
  const late = open.filter((x) => x.dueDate && x.dueDate < today);
  const next = open
    .filter((x) => x.dueDate && x.dueDate >= today)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 5);

  const count = (s: string) => teams.filter((x) => x.status === s).length;

  const facts = [
    ["Name", t.name],
    ["Dates", t.startDate ? `${t.startDate} to ${t.endDate ?? t.startDate}` : "NOT SET"],
    ["Venue", t.venueName ?? "NOT SET"],
    ["Fields", t.fieldCount ?? "NOT SET"],
    ["Division", t.division ?? "NOT SET"],
    ["Team target", t.teamTarget ?? "NOT SET"],
    ["Bid fee", t.bidFee ? `$${(t.bidFee / 100).toFixed(0)}` : "NOT SET"],
    ["Sanctioned", t.sanctioned ? "yes" : "no"],
    ["Refund policy", t.refundPolicy ? "written" : "NOT WRITTEN"],
    ["Published", t.published ? "yes" : "no"],
  ]
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  const mapped = db
    .select()
    .from(schema.fields)
    .where(eq(schema.fields.tournamentId, ctx.tournamentId))
    .all();
  const scheduleMax = Math.max(
    0,
    ...gameRows.map((g) => Number(g.field) || 0),
  );
  const fieldIssues = fieldCountWarnings({
    mapped: mapped.length,
    scheduleMax,
    declared: t.fieldCount,
  });

  const divisions = [...new Set(gameRows.map((g) => g.division).filter(Boolean))];

  const lines = [
    "TOURNAMENT",
    facts,
    "",
    "TEAMS",
    `  applied ${count("applied")} | accepted ${count("accepted")} | ` +
      `waitlisted ${count("waitlisted")} | paid ${teams.filter((x) => x.feePaid).length}`,
    "",
    "SPONSORS",
    `  ${sponsorRows.length} in pipeline | ` +
      `committed ${sponsorRows.filter((s) => ["committed", "paid"].includes(s.stage)).length}`,
    "",
    "SCHEDULE",
    `  ${gameRows.length} games generated | ` +
      `${gameRows.filter((g) => g.status === "final").length} final` +
      (divisions.length > 1 ? ` | divisions: ${divisions.join(", ")}` : ""),
    `  ${mapped.length} field(s) on the site map, schedule uses ${scheduleMax}`,
    "",
    "TASKS",
    `  ${open.length} open, ${late.length} late`,
  ];

  if (fieldIssues.length) {
    lines.push("", "FIELD COUNT MISMATCH:");
    for (const w of fieldIssues) lines.push(`  - ${w}`);
  }

  if (late.length) {
    lines.push("", "  LATE:");
    for (const x of late.slice(0, 8)) lines.push(`    - ${x.task} (due ${x.dueDate})`);
  }
  if (next.length) {
    lines.push("", "  NEXT UP:");
    for (const x of next) lines.push(`    - ${x.dueDate} ${x.task} (${x.owner})`);
  }
  return lines.join("\n");
}
