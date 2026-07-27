#!/usr/bin/env node
/**
 * Idempotent demo seed: one org, one tournament, sixteen teams, a generated
 * schedule with pool play played out, so the public pages and the TD console
 * have something real to show.
 *
 * Safe to run on every boot — it no-ops if the demo org already exists.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.DATABASE_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/data/175g.db"
    : path.join(process.cwd(), "data", "175g.db"));

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const has = db
  .prepare("SELECT 1 FROM orgs WHERE slug = ?")
  .get("demo-university");
if (has) {
  console.log("[seed] demo data already present, skipping");
  process.exit(0);
}

const id = () => Math.random().toString(36).slice(2, 14);
const nowSec = Math.floor(Date.now() / 1000);

const orgId = id();
db.prepare(
  "INSERT INTO orgs (id, slug, name, school, city, created_at) VALUES (?,?,?,?,?,?)",
).run(orgId, "demo-university", "Demo University Ultimate", "Demo University", "Kansas City", nowSec);

const tId = id();
db.prepare(
  `INSERT INTO tournaments
   (id, org_id, slug, name, year, start_date, end_date, venue_name, city,
    field_count, surface, division, team_target, bid_fee, games_guaranteed,
    sanctioned, apply_deadline, acceptance_date, payment_deadline, roster_deadline,
    refund_policy, description, published, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
).run(
  tId, orgId, "midwest-throwdown", "Midwest Throwdown", 2027,
  "2027-02-27", "2027-02-28", "Swope Park Soccer Complex", "Kansas City",
  8, "grass", "mixed", 16, 35000, 6, 1,
  "2027-01-15", "2027-01-22", "2027-02-05", "2027-02-24",
  "Full refund through January 22. Fifty percent through February 5. No refund after February 5.\nIf the whole event is cancelled for weather before play begins, teams receive a refund less committed costs. If one day is lost to weather, there is no refund — most of our costs are spent by then.",
  "A two-day mixed tournament on eight grass fields, twenty minutes from KCI. Six games guaranteed, certified athletic trainer on site both days, and a Saturday night social at the fields.",
  1, nowSec,
);

const TEAMS = [
  "Kansas City Chaos", "Iowa Backhand", "Nebraska Sandstorm", "Missouri Mules",
  "Wichita Wind", "Tulsa Torrent", "Springfield Surge", "Columbia Cutters",
  "Lawrence Layout", "Omaha Overhead", "Des Moines Drift", "Manhattan Mayhem",
  "Fayetteville Flick", "Joplin Jetstream", "Topeka Turnover", "Ames Anhyzer",
];

const teamIds = [];
TEAMS.forEach((name, i) => {
  const teamId = id();
  teamIds.push(teamId);
  db.prepare(
    `INSERT INTO teams
     (id, tournament_id, name, school, division, captain_name, captain_email,
      status, seed, fee_paid, amount_paid, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    teamId, tId, name, name.split(" ")[0], "mixed",
    `Captain ${i + 1}`, `captain${i + 1}@example.edu`,
    "accepted", i + 1, 1, 35000, nowSec,
  );
});

// Four pools of four, seeded from the manual's Table 16.1 version 1.
const POOLS = {
  A: [1, 8, 9, 16],
  B: [2, 7, 10, 15],
  C: [3, 6, 11, 14],
  D: [4, 5, 12, 13],
};

for (const [pool, seeds] of Object.entries(POOLS)) {
  for (const s of seeds) {
    db.prepare("UPDATE teams SET pool = ? WHERE id = ?").run(pool, teamIds[s - 1]);
  }
}

// Round robin within each pool, three rounds, deterministic scores so the
// standings and tiebreak display have something to chew on.
const RR = [
  [[0, 3], [1, 2]],
  [[0, 2], [3, 1]],
  [[0, 1], [2, 3]],
];

let gameNo = 1;
let field = 1;
for (let round = 0; round < 3; round++) {
  for (const [pool, seeds] of Object.entries(POOLS)) {
    for (const [a, b] of RR[round]) {
      const home = teamIds[seeds[a] - 1];
      const away = teamIds[seeds[b] - 1];
      // Higher seed usually wins, with enough variation to create ties.
      const homeSeed = seeds[a];
      const awaySeed = seeds[b];
      const homeWins = homeSeed < awaySeed ? gameNo % 5 !== 0 : gameNo % 4 === 0;
      const winner = homeWins ? 15 : 11 + (gameNo % 4);
      const loser = homeWins ? 10 + (gameNo % 5) : 15;

      db.prepare(
        `INSERT INTO games
         (id, tournament_id, game_code, day, round, start_time, field, stage, pool,
          home_team_id, away_team_id, home_score, away_score, status,
          reported_via, reported_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id(), tId, `G${gameNo}`, 1, round + 1,
        ["09:00", "11:00", "13:00"][round], String(field),
        "pool", pool, home, away,
        homeWins ? winner : loser,
        homeWins ? loser : winner,
        "final", "admin", nowSec, nowSec,
      );
      gameNo++;
      field = (field % 8) + 1;
    }
  }
}

// Sunday: quarters onward, unplayed.
for (let i = 0; i < 4; i++) {
  db.prepare(
    `INSERT INTO games
     (id, tournament_id, game_code, day, round, start_time, field, stage, pool,
      home_label, away_label, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id(), tId, `G${gameNo++}`, 2, 4, "09:00", String(i + 1),
    "bracket", "Championship",
    `${["A", "B", "C", "D"][i]}1`, `${["D", "C", "B", "A"][i]}2`,
    "scheduled", nowSec,
  );
}

db.prepare(
  `INSERT INTO announcements (id, tournament_id, body, level, created_at)
   VALUES (?,?,?,?,?)`,
).run(
  id(), tId,
  "Pool play is complete. Brackets are posted — quarters start at 9:00 on Sunday. Check your field assignment, it changed from the printed sheet.",
  "info", nowSec,
);

console.log(`[seed] demo tournament created: /t/demo-university/midwest-throwdown`);
