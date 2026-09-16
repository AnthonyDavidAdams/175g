#!/usr/bin/env node
/**
 * Remove the seeded demo tournament and its org. Destructive, so it refuses
 * to run without --yes. Deletes every child row (games, teams, waivers,
 * signatures, notes, agent messages…) then the tournament and the org, and
 * finally the demo org's memberships. People rows are left alone — they are
 * the cross-tournament directory.
 *
 *   DATABASE_PATH=/data/175g.db node scripts/remove-demo.mjs --yes
 */
import Database from "better-sqlite3";
import path from "node:path";

if (!process.argv.includes("--yes")) {
  console.error("Refusing: this deletes the demo org and everything under it. Re-run with --yes.");
  process.exit(2);
}
const dbPath =
  process.env.DATABASE_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/data/175g.db"
    : path.join(process.cwd(), "data", "175g.db"));
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const org = db.prepare("SELECT id, name FROM orgs WHERE slug = ?").get("demo-university");
if (!org) {
  console.log("[demo] no demo org present");
  process.exit(0);
}
const tournaments = db.prepare("SELECT id, name FROM tournaments WHERE org_id = ?").all(org.id);

const childTables = [
  "waiver_signatures", "waivers", "roster_entries", "games", "teams", "shifts", "tasks",
  "sponsors", "outreach", "announcements", "sites", "fields", "site_points",
  "survey_responses", "agent_messages", "media", "advisor_notes",
];

const run = db.transaction(() => {
  for (const t of tournaments) {
    for (const table of childTables) {
      db.prepare(`DELETE FROM ${table} WHERE tournament_id = ?`).run(t.id);
    }
    db.prepare("UPDATE templates SET source_tournament_id = NULL WHERE source_tournament_id = ?").run(t.id);
    db.prepare("DELETE FROM tournaments WHERE id = ?").run(t.id);
    console.log(`[demo] removed tournament ${t.name}`);
  }
  db.prepare("DELETE FROM archive_notes WHERE org_id = ?").run(org.id);
  db.prepare("DELETE FROM templates WHERE org_id = ?").run(org.id);
  db.prepare("DELETE FROM org_members WHERE org_id = ?").run(org.id);
  db.prepare("DELETE FROM orgs WHERE id = ?").run(org.id);
  console.log(`[demo] removed org ${org.name}`);
});
run();
