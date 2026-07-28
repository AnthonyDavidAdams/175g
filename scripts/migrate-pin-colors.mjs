/**
 * One-time: markers created before per-kind defaults existed were all stamped
 * "#ffffff" by the old hardcoded default, not by anyone choosing white. Null
 * them so they inherit their kind's colour. Deliberate white choices made after
 * this point are unaffected, because they are only stored once a TD picks.
 */
import Database from "better-sqlite3";
const db = new Database(process.env.DATABASE_PATH || "/data/175g.db");
const before = db.prepare("SELECT kind, color FROM site_points").all();
const white = before.filter((r) => r.color === "#ffffff");
console.log(`markers: ${before.length}, stamped legacy white: ${white.length}`);
if (white.length) {
  const info = db
    .prepare("UPDATE site_points SET color = NULL WHERE color = '#ffffff'")
    .run();
  console.log(`cleared ${info.changes} — they now use their kind's default`);
}
console.log(
  "by kind:",
  Object.entries(
    before.reduce((a, r) => ({ ...a, [r.kind]: (a[r.kind] ?? 0) + 1 }), {}),
  )
    .map(([k, n]) => `${k}=${n}`)
    .join(" "),
);
