import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

function resolvePath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  // In production the Railway volume is mounted at /data. Fall back to a local
  // file when it isn't there, so `next build` page collection doesn't try to
  // mkdir /data on a developer machine.
  if (process.env.NODE_ENV === "production" && fs.existsSync("/data")) {
    return "/data/175g.db";
  }
  return path.join(process.cwd(), "data", "175g.db");
}

let instance: BetterSQLite3Database<typeof schema> | null = null;

function connect() {
  if (instance) return instance;
  const dbPath = resolvePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  instance = drizzle(sqlite, { schema });
  return instance;
}

/**
 * Lazy proxy: the connection opens on first query rather than at module
 * evaluation, so importing this module during the build is free.
 */
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(connect(), prop, receiver);
  },
});

export { schema };
