import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  PUBLIC_AGENT_ENABLED,
  checkLimits,
  createIntake,
  getIntake,
  parseIntake,
  runIntake,
} from "@/lib/agent/intake";

const COOKIE = "g175_intake";
const TTL = 7 * 24 * 60 * 60;

async function session(create: boolean) {
  const jar = await cookies();
  const hdrs = await headers();
  const ip = hdrs.get("x-real-ip") ?? null; // never raw x-forwarded-for behind Railway
  const id = jar.get(COOKIE)?.value;
  let row = id ? getIntake(id) : undefined;
  if (!row && create) {
    row = createIntake(ip);
    jar.set(COOKIE, row.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: TTL,
      path: "/",
    });
  }
  return { row, ip };
}

/** GET: the visitor's conversation so far, so a returning visitor continues. */
export async function GET() {
  const { row } = await session(false);
  if (!row) {
    return NextResponse.json({ enabled: PUBLIC_AGENT_ENABLED, messages: [], draft: {}, email: null });
  }
  const { messages, draft } = parseIntake(row);
  return NextResponse.json({
    enabled: PUBLIC_AGENT_ENABLED,
    messages,
    draft,
    email: row.email,
    claimed: !!row.claimedTournamentId,
  });
}

/** POST { message }: one turn with the front-page agent. */
export async function POST(req: Request) {
  if (!PUBLIC_AGENT_ENABLED) {
    return NextResponse.json(
      { error: "The front-page agent is off on this deployment. Sign in to use the console." },
      { status: 503 },
    );
  }
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (!message) return NextResponse.json({ error: "Empty message." }, { status: 400 });

  const { row, ip } = await session(true);
  if (!row) return NextResponse.json({ error: "Could not start a session." }, { status: 500 });
  if (row.claimedTournamentId) {
    return NextResponse.json({
      text: "This conversation already became a tournament. Sign in and it's waiting in your console.",
      limited: true,
    });
  }

  const limit = checkLimits(ip);
  if (!limit.ok) return NextResponse.json({ text: limit.reason, limited: true });

  try {
    const turn = await runIntake(row.id, message, ip);
    return NextResponse.json(turn);
  } catch (err) {
    console.error("[intake]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent failed." },
      { status: 500 },
    );
  }
}
