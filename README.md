# 175g

An AI tournament director for college ultimate frisbee. Multi-tenant, free for
college teams, hosted at 175g.com.

The name is the weight of a regulation disc.

## What it is

Most college tournaments are run by a sophomore who has never done it before.
175g is a tournament director that already knows how — a conversational agent
that does the work with the TD, from the first field email to the archive handed
to next year's TD.

The agent is the product. It has tools that mutate the real tournament: it sets
dates, generates the deadline countdown, adds teams, builds a USAU-compliant
schedule, drafts outreach for approval, tracks sponsors, and posts announcements.

## Architecture

```
src/
  app/
    page.tsx                    marketing site
    login/                      magic-link sign-in
    dashboard/                  a TD's tournaments
    t/[org]/[slug]/             PUBLIC: info, schedule, standings, teams,
                                apply, volunteer
    td/[org]/[slug]/            PRIVATE: agent console, score entry,
                                outreach approval queue
    api/
      agent/[org]/[slug]/       the TD agent turn loop
      auth/{request,verify}/    magic link issue + consume
      apply/[org]/[slug]/       team bid application
      volunteer/[org]/[slug]/   shift signup
      scores/[gameId]/          score entry
      outreach/[id]/            approve-and-send or discard
      telegram/                 bot webhook
  lib/
    db/schema.ts                Drizzle schema (see Tenancy below)
    agent/{tools,runner}.ts     tool definitions + the turn loop
    formats.ts                  pools, seeding, brackets, round layout
    standings.ts                USAU nine-rule tiebreak engine
    timeline.ts                 dynamic deadline countdown
    telegram.ts                 score reporting and broadcast
    auth.ts                     magic link + 60-day trusted device
    seo.ts                      buildMetadata — every page ships full OG
```

**Stack:** Next.js 16 (App Router), better-sqlite3 + Drizzle, Tailwind 4,
Anthropic SDK, SES, Railway.

## Tenancy

An `org` is durable — a college program, a club, a league. A `tournament` is one
edition of an event. Institutional memory (`archive_notes`) hangs off the org,
which is what lets year two start from year one instead of from nothing.

The `people` table is the cross-tournament directory. Role tags (`player`,
`captain`, `coach`, `organizer`, `volunteer`) live on `roster_entries`, not on
the person, so someone can be a captain one year and an organizer the next.

## Two invariants

**Outreach is drafted, never sent.** The agent's `draft_outreach` tool writes a
row with status `draft`. A human approves it in the outreach queue before
anything leaves. This is a product other people run from their own accounts; an
agent that blasts a bad list from a student's address is a disaster with their
name on it.

**Marketing consent comes from the person.** It is captured at registration,
specific, and revocable. No tool sets it, and it is never upgraded by an import.

## Correctness

Pools, seeding, brackets, and tiebreaks follow the UPA Manual of Championship
Series Tournament Formats:

- Pools use the manual's published seeding tables rather than naive snaking —
  snaking plus a traditional bracket reproduces pool matchups in the bracket.
- The largest power of two advances, matching the manual's published shapes
  (twelve teams into an eight-team bracket with the bottom four placing).
- The generator refuses infeasible plans rather than producing a bad schedule:
  nine games in two days maximum, four per day to 15, five only to 11.
- The nine-rule tiebreak ladder is implemented in full, including the meta-rules
  (all-still-tied advances a rule; a split subgroup restarts from Rule 2).

The tiebreak engine is verified against the manual's own worked examples 3.1,
3.2, and 4.1, in both the TypeScript (`src/lib/standings.ts`) and Python
(`pull-suite` plugin) implementations.

## Telegram

One group per tournament. Bind it once with `/link <slug>`, then:

```
/score Pitt 15 - 12 CMU     report a final
/next Pitt                  that team's next game
/schedule                   the current round
/standings                  live pool standings
```

Scores land in the same table as web entry, so standings recompute either way.
Register the webhook with `secret_token` set to `TELEGRAM_WEBHOOK_SECRET`.

## Local development

```bash
npm install
npx drizzle-kit push --force
node scripts/seed.mjs        # demo tournament, 16 teams, pool play played out
npm run dev
```

Then open `/t/demo-university/midwest-throwdown`.

Without `AWS_ACCESS_KEY_ID`, emails are logged to the console rather than sent —
magic links still work, you just copy them from the terminal.

The TD console needs `ANTHROPIC_API_KEY`; everything else works without it.

## Deploy

Railway, with a volume mounted at `/data`. `npm run start` pushes the schema,
runs the idempotent seed, and starts Next. Set the env vars in `.env.example`.

## Companion plugin

`~/pull-suite` is the Claude Code plugin version of the same knowledge — twelve
skills and six Python tools a TD can run locally. The plugin's skill files are
the source of the agent's playbook.
