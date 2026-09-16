# 175g

An AI tournament director for ultimate frisbee. Multi-tenant, and free for
college and community tournaments.

The name is the weight of a regulation disc.

**Licence: AGPL-3.0.** Fork it, self-host it for your league, send a pull request.
If you run a modified version as a service, share those changes back.

## What it is

Most college tournaments are run by a student who has never done it before.
175g is a tournament director that already knows how — a conversational agent
that does the work with the TD, from the first field email to the archive handed
to next year's TD.

The agent is the product. It has tools that mutate the real tournament: it sets
dates, generates the deadline countdown, adds teams, builds a USAU-compliant
schedule, drafts outreach for approval, tracks sponsors, and posts announcements.

## Who built this

In 2001 the UPA — now USA Ultimate — brought the author out to headquarters to
teach their staff the frameworks for organising tournaments at the professional
level. He also founded Don't Give Up the Disc, now in its 26th year and one of
the best beach tournaments in the world.

The domain logic here is that experience written down, checked against the
published manuals rather than recalled from memory. Where the two disagree, the
manual wins and the code cites it.

## Architecture

```
src/
  app/
    page.tsx                    the landing page IS the agent: talk before sign-in
    start/                      where the front-page sign-in link lands; turns the
                                conversation into a program + tournament
    login/                      magic-link sign-in
    dashboard/                  a TD's tournaments (one tournament → straight to it)
    templates/                  event template gallery + detail/share pages
    t/[org]/[slug]/             PUBLIC: info, schedule, standings, teams,
                                apply, volunteer, waiver
    td/[org]/[slug]/            PRIVATE: agent console, score entry, outreach
                                queue, field map, waivers, access, notes,
                                save-as-template
    api/
      agent/[org]/[slug]/       the TD agent turn loop
      auth/{request,verify}/    magic link issue + consume
      apply/[org]/[slug]/       team bid application
      volunteer/[org]/[slug]/   shift signup
      scores/[gameId]/          score entry
      outreach/[id]/            approve-and-send or discard
      waivers/[org]/[slug]/     manage templates, and public signing
      fields/[org]/[slug]/      save the field layout
      access/[org]/             add, remove, re-role org members
      notes/[org]/[slug]/       advisor and staff notes for the organisers
      templates/                save, list, share, apply event templates
      intake/                   the front-page agent (anonymous, rate-limited)
      telegram/                 bot webhook
  lib/
    db/schema.ts                Drizzle schema (see Tenancy below)
    agent/{tools,runner}.ts     tool definitions + the turn loop, role-filtered
    agent/intake.ts             the pre-sign-in agent and its limits
    access.ts                   roles → permissions; the one place they are defined
    templates.ts                tournament ↔ template (dates become offsets)
    formats.ts                  USAU pools, seeding, brackets, round layout
    customFormat.ts             everything the USAU library doesn't cover
    advance.ts                  resolves bracket placeholders as scores land
    standings.ts                USAU nine-rule tiebreak engine
    timeline.ts                 dynamic deadline countdown
    waiverTemplates.ts          editable waiver drafts
    fieldGeometry.ts            true-scale field polygons from centre + bearing
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

## Roles

Access is granted per program, so it carries across editions. Four roles,
defined once in `src/lib/access.ts` and enforced in every API route, every
private page, and the agent's tool set:

| role | can |
|---|---|
| **owner** | everything, including who has access and who owns the program |
| **td** | run the tournament: agent, outreach, waivers, publishing, scores |
| **staff** | gameday hands: scores, tasks, announcements, the field map |
| **advisor** | see everything, change nothing, leave notes, share templates |

Advisors are the alumni who ran it before, the faculty sponsor, the mentor
from another program. They see every private page read-only, read the
organisers' conversation with the agent, and get their own agent thread with
read-only tools. Their way of helping is **notes** — which the TD sees in the
console and the agent raises in `get_status` — and **templates**.

## Event templates

A template is a tournament with the edition taken out: no teams, no games, no
dates. Deadlines and tasks become offsets from the event date. What travels is
the part that took years to learn: the refund policy, waiver text, the task
list with real lead times, which sponsors to approach, and optionally the venue
and field layout. Nothing personal travels — no contacts, no payment handles.

Anyone in a program can save one (`/td/…/template`, or ask the agent). Owners,
TDs and advisors can share it: program-only, by link, or in the public gallery
at `/templates`. Starting a tournament from a template (`/new?template=…`, or
the front-page agent) applies it through the same document machinery as
`applyDoc`, so the destructive-change guard still holds.

Two built-in templates seed on boot (`scripts/seed-templates.mjs`).

## The landing page is the agent

Visitors talk to the tournament director before they have an account. The
intake agent (`src/lib/agent/intake.ts`) works out what they want to run,
records a draft, and when there is enough, asks for an email and sends the
sign-in link. Clicking it lands on `/start`, which creates the program and the
tournament from the draft, applies a chosen template, and copies the
conversation into the console's main thread.

It spends API tokens for anonymous visitors, so it is capped per session, per
IP per hour, and per day (`PUBLIC_AGENT_*`), and `PUBLIC_AGENT=0` turns it off
in favour of a plain start form.

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

## Custom formats

`generate_schedule` covers the standard shapes. `define_custom_format` covers
everything else: hat tournaments, swiss, three-team pools into crossovers,
showcase games, split divisions, double round robins, consolation ladders,
beach 2:2.

Validation separates errors from warnings on purpose. Structural impossibilities
block — a team playing itself, a team in two games in one round, a placeholder
pointing at nothing. Departures from USAU guidance are surfaced as warnings and
applied anyway, because a custom format is a deliberate choice by someone who
knows their event.

Consecutive round-robin stages on different pools interleave into shared rounds,
so three pools of three is five rounds, not eleven.

Game sides accept placeholders that resolve as results land: `A1` (pool A first
place), `W:G12`, `L:G12`. `advance.ts` fills them in after every score from any
source. Pool placings resolve only once the whole pool is final, because the
tiebreak procedure can reorder a pool on the last result.

## Waivers

Four editable templates — participant, parent/guardian for minors, team
agreement, volunteer. Both the TD and the agent can rewrite them.

Each signature stores `bodySnapshot` and `versionSigned`, so editing a waiver
never rewrites what somebody already agreed to. Every surface says plainly that
the templates are a starting point and not legal advice.

## Field layout

`fieldGeometry.ts` stores a field as a centre point, a bearing, and dimensions in
metres, then derives the corners. A field is therefore always exactly regulation
size however it is dragged or rotated, and the map matches what gets lined on the
grass. Spacing warnings fire below 5m, and again below 9m, because the minimum
buffer does not leave room for team tents.

The map uses Esri World Imagery rather than Google Maps — no API key, which
matters for anyone self-hosting.

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

## Operations

- `/admin` — operator view, HTTP basic auth against `ADMIN_PASSWORD`.
- Umami analytics via `NEXT_PUBLIC_UMAMI_SRC` + `NEXT_PUBLIC_UMAMI_WEBSITE_ID`.
- The demo tournament seeds only with `SEED_DEMO=1`;
  `node scripts/remove-demo.mjs --yes` removes it from an existing database.

## Deploy

Railway, with a volume mounted at `/data`. `npm run start` pushes the schema,
runs the idempotent seed, and starts Next. Set the env vars in `.env.example`.

## Companion plugin

`pull-suite` is the Claude Code plugin version of the same knowledge — thirteen
skills and six dependency-free Python tools a TD can run locally. The plugin's
skill files are the source of the agent's playbook.
