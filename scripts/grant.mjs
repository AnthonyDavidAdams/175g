#!/usr/bin/env node
/**
 * Grant a person admin access to an org, creating both if needed.
 *   node scripts/grant.mjs <email> [orgSlug] [orgName]
 * Idempotent.
 */
import Database from "better-sqlite3";
import path from "node:path";

const [email, orgSlug = "earthpilot", orgName = "EarthPilot"] = process.argv.slice(2);
if (!email) {
  console.error("usage: node scripts/grant.mjs <email> [orgSlug] [orgName]");
  process.exit(1);
}

const dbPath =
  process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "175g.db");
const db = new Database(dbPath);
const id = () => Math.random().toString(36).slice(2, 14);
const now = Math.floor(Date.now() / 1000);
const normalized = email.trim().toLowerCase();

let person = db.prepare("SELECT * FROM people WHERE email = ?").get(normalized);
if (!person) {
  const pid = id();
  db.prepare(
    "INSERT INTO people (id, email, created_at) VALUES (?,?,?)",
  ).run(pid, normalized, now);
  person = { id: pid };
  console.log(`created person ${normalized}`);
}

let org = db.prepare("SELECT * FROM orgs WHERE slug = ?").get(orgSlug);
if (!org) {
  const oid = id();
  db.prepare(
    "INSERT INTO orgs (id, slug, name, created_at) VALUES (?,?,?,?)",
  ).run(oid, orgSlug, orgName, now);
  org = { id: oid };
  console.log(`created org ${orgSlug}`);
}

db.prepare(
  "INSERT OR IGNORE INTO org_members (org_id, person_id, role, created_at) VALUES (?,?,?,?)",
).run(org.id, person.id, "owner", now);

// Also grant on every existing org, so the demo tournament is reachable.
for (const o of db.prepare("SELECT id, slug FROM orgs").all()) {
  db.prepare(
    "INSERT OR IGNORE INTO org_members (org_id, person_id, role, created_at) VALUES (?,?,?,?)",
  ).run(o.id, person.id, "owner", now);
  console.log(`  granted owner on ${o.slug}`);
}
console.log("done");
