/** Remove throwaway verification data. Pass slugs as args. */
import Database from "better-sqlite3";
const db = new Database(process.env.DATABASE_PATH || "/data/175g.db");
const TABLES = ["games","teams","tasks","sponsors","outreach","announcements","fields",
  "site_points","sites","waivers","waiver_signatures","media","shifts","roster_entries",
  "agent_messages","survey_responses"];

function dropTournament(id, label) {
  for (const tbl of TABLES) {
    try { db.prepare(`DELETE FROM ${tbl} WHERE tournament_id=?`).run(id); } catch {}
  }
  db.prepare("DELETE FROM tournaments WHERE id=?").run(id);
  console.log("removed tournament", label);
}

for (const arg of process.argv.slice(2)) {
  const [orgSlug, tSlug] = arg.split("/");
  const org = db.prepare("SELECT id,slug FROM orgs WHERE slug=?").get(orgSlug);
  if (!org) { console.log("no org", orgSlug); continue; }
  if (tSlug) {
    const t = db.prepare("SELECT id,slug FROM tournaments WHERE org_id=? AND slug=?")
      .get(org.id, tSlug);
    if (t) dropTournament(t.id, `${orgSlug}/${t.slug}`);
    continue;
  }
  for (const t of db.prepare("SELECT id,slug FROM tournaments WHERE org_id=?").all(org.id)) {
    dropTournament(t.id, `${orgSlug}/${t.slug}`);
  }
  db.prepare("DELETE FROM org_members WHERE org_id=?").run(org.id);
  db.prepare("DELETE FROM orgs WHERE id=?").run(org.id);
  console.log("removed org", orgSlug);
}
