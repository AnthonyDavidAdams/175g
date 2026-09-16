import { NextResponse } from "next/server";
import { runAgent, threadFor } from "@/lib/agent/runner";
import { requireAccess } from "@/lib/access";
import { getTournament } from "@/lib/tournament";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;

  const found = getTournament(org, slug);
  if (!found) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }
  const auth = await requireAccess(found.org.id, "agent.chat");
  if (!auth.ok) return auth.response;
  const { session, role } = auth.access;

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Empty message." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const turn = await runAgent(found.tournament.id, found.org.id, message, {
      role,
      personId: session.personId,
      thread: threadFor(role, session.personId),
    });
    return NextResponse.json(turn);
  } catch (err) {
    console.error("[agent]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent failed." },
      { status: 500 },
    );
  }
}
