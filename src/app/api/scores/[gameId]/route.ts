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

  // Everything a generator produced is overrideable by the TD. Scores are the
  // common case; field, round, time, and status are the ones that matter when
  // a pitch floods or a team is stuck in traffic.
  const patch: Record<string, unknown> = {};

  if (body?.homeScore !== undefined || body?.awayScore !== undefined) {
    const home = Number(body.homeScore);
    const away = Number(body.awayScore);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
      return NextResponse.json(
        { error: "Scores must be whole numbers." },
        { status: 400 },
      );
    }
    patch.homeScore = home;
    patch.awayScore = away;
    patch.status = body.status ?? "final";
  }

  if (typeof body?.field === "string" && body.field.trim()) {
    patch.field = body.field.trim();
  }
  if (Number.isInteger(body?.round) && body.round > 0) patch.round = body.round;
  if (typeof body?.startTime === "string" && /^\d{1,2}:\d{2}$/.test(body.startTime)) {
    patch.startTime = body.startTime;
  }
  if (
    typeof body?.status === "string" &&
    ["scheduled", "in_progress", "final", "forfeit"].includes(body.status)
  ) {
    patch.status = body.status;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  patch.reportedBy = session.email;
  patch.reportedVia = "admin";
  patch.reportedAt = Math.floor(Date.now() / 1000);

  db.update(schema.games).set(patch).where(eq(schema.games.id, gameId)).run();

  // An override can create a clash a generator never would have. Report it
  // rather than silently accepting a double-booked field.
  const after = db
    .select()
    .from(schema.games)
    .where(eq(schema.games.tournamentId, game.tournamentId))
    .all();
  const updated = after.find((g) => g.id === gameId)!;
  const clashes = after
    .filter(
      (g) =>
        g.id !== gameId &&
        g.round === updated.round &&
        g.field === updated.field,
    )
    .map((g) => g.gameCode ?? g.id.slice(0, 6));

  // Fill in any bracket slots this result just decided.
  const { resolved } = advanceTournament(game.tournamentId);

  return NextResponse.json({
    ok: true,
    resolved,
    clashes: clashes.length ? clashes : undefined,
  });
}
