// Place four fields on real grass at Swope Park so the map/handout can be
// verified against actual imagery.
import Database from "better-sqlite3";
const db = new Database(process.env.DATABASE_PATH || "/data/175g.db");
const t = db.prepare("SELECT id FROM tournaments WHERE slug='midwest-throwdown'").get();
if (!t) { console.log("no tournament"); process.exit(0); }
if (db.prepare("SELECT 1 FROM fields WHERE tournament_id=?").get(t.id)) {
  console.log("fields already placed"); process.exit(0);
}
const id = () => Math.random().toString(36).slice(2,14);
const now = Math.floor(Date.now()/1000);
const baseLat = 38.99929, baseLng = -94.52260;
// ~45m apart across, which is a field width plus a real tent buffer.
for (let i=0;i<4;i++){
  db.prepare(`INSERT INTO fields (id,tournament_id,name,preset,center_lat,center_lng,bearing,length_m,width_m,endzone_m,sort_order,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id(), t.id, `Field ${i+1}`, "usau",
    String(baseLat), String(baseLng + i*0.00052), 90, 100, 37, 18, i, now);
}
const pts = [["hq","HQ",0.0002,-0.0006],["water","Water",0.0004,0.0003],
             ["trainer","Trainer",-0.0003,-0.0004],["parking","Parking",-0.0006,0.0009],
             ["toilets","Toilets",0.0005,-0.0007]];
for (const [kind,label,dLat,dLng] of pts){
  db.prepare(`INSERT INTO site_points (id,tournament_id,kind,label,lat,lng,color,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(id(), t.id, kind, label,
    String(baseLat+dLat), String(baseLng+dLng), "#ffffff", now);
}
db.prepare("UPDATE tournaments SET field_count=4 WHERE id=?").run(t.id);
console.log("placed 4 fields + 5 markers at Swope Park");
