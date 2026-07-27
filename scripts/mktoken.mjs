// Mint a short-lived device token for automated verification of the API.
import Database from "better-sqlite3";
const db = new Database(process.env.DATABASE_PATH || "/data/175g.db");
const now = Math.floor(Date.now()/1000);
const p = db.prepare("SELECT id FROM people WHERE email=?").get("a@175g.com");
if (!p) { console.log("NOPERSON"); process.exit(1); }
const tok = "verify-" + Math.random().toString(36).slice(2,14);
db.prepare(`INSERT INTO trusted_devices (token,person_id,device_name,last_used,expires_at,created_at)
  VALUES (?,?,?,?,?,?)`).run(tok, p.id, "automated verification", now, now+3600, now);
console.log(tok);
