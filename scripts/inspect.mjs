import Database from "better-sqlite3";
const db = new Database(process.env.DATABASE_PATH || "/data/175g.db");
const show = (label, rows) => {
  console.log(`--- ${label} (${rows.length}) ---`);
  for (const r of rows) console.log("   ", JSON.stringify(r));
};
show("people", db.prepare("SELECT id,email,name FROM people").all());
show("orgs", db.prepare("SELECT id,slug,name FROM orgs").all());
show("org_members", db.prepare("SELECT * FROM org_members").all());
show("trusted_devices", db.prepare("SELECT person_id,last_used,revoked_at,expires_at FROM trusted_devices").all());
show("magic_tokens", db.prepare("SELECT email,used_at,expires_at FROM magic_tokens").all());
