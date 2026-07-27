import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { advanceTournament } from "@/lib/advance";
import { canAdminOrg, getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const game = db
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .get();
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const tournament = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, game.tournamentId))
    .get();
  if (!tournament || !canAdminOrg(session.personId, tournament.orgId)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const home = Number(body?.homeScore);
  const away = Number(body?.awayScore);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return NextResponse.json({ error: "Scores must be whole numbers." }, { status: 400 });
  }

  db.update(schema.games)
    .set({
      homeScore: home,
      awayScore: away,
      status: "final",
      reportedBy: session.email,
      reportedVia: "admin",
      reportedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(schema.games.id, gameId))
    .run();

  // Fill in any bracket slots this result just decided.
  const { resolved } = advanceTournament(game.tournamentId);

  return NextResponse.json({ ok: true, resolved });
}
