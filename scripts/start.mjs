#!/usr/bin/env node
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.DATABASE_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/data/175g.db"
    : path.join(process.cwd(), "data", "175g.db"));

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
console.log(`[175g] ensured directory ${path.dirname(dbPath)} (db: ${dbPath})`);

// Pin DATABASE_PATH so drizzle-kit and the runtime can't drift apart.
const childEnv = { ...process.env, DATABASE_PATH: dbPath };
const push = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
  stdio: "inherit",
  env: childEnv,
});
if (push.status !== 0) {
  console.error(`[175g] drizzle-kit push exited with status ${push.status}`);
  process.exit(push.status ?? 1);
}
console.log("[175g] schema up to date");

// Best-effort seed (idempotent). Never blocks startup.
const seed = spawnSync("node", ["scripts/seed.mjs"], { stdio: "inherit", env: childEnv });
if (seed.status !== 0) console.warn(`[175g] seed exited ${seed.status} (continuing)`);

const next = spawn("npx", ["next", "start", "-p", process.env.PORT || "3000"], {
  stdio: "inherit",
  env: childEnv,
});
next.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => next.kill("SIGTERM"));
process.on("SIGINT", () => next.kill("SIGINT"));
