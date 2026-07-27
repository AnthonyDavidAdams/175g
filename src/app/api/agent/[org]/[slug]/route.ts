import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/runner";
import { canAdminOrg, getSession } from "@/lib/auth";
import { getTournament } from "@/lib/tournament";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const found = getTournament(org, slug);
  if (!found) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }
  if (!canAdminOrg(session.personId, found.org.id)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

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
    const turn = await runAgent(found.tournament.id, found.org.id, message);
    return NextResponse.json(turn);
  } catch (err) {
    console.error("[agent]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent failed." },
      { status: 500 },
    );
  }
}
