import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { can, requireAccess } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { getTournament } from "@/lib/tournament";

/**
 * Notes for the people running the tournament. Any member can leave one;
 * advisors, who can change nothing else, use it most. Resolving is for the
 * people who act on notes (anyone who can work the task list) and for the
 * author, who may withdraw their own.
 */

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), body: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("resolve"), id: z.string() }),
  z.object({ action: z.literal("reopen"), id: z.string() }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const auth = await requireAccess(found.org.id, "notes");
  if (!auth.ok) return auth.response;
  const { session, role } = auth.access;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const now = Math.floor(Date.now() / 1000);

  if (input.action === "add") {
    const id = nanoid();
    db.insert(schema.advisorNotes)
      .values({
        id,
        tournamentId: found.tournament.id,
        personId: session.personId,
        body: input.body,
      })
      .run();
    return NextResponse.json({
      ok: true,
      note: {
        id,
        body: input.body,
        author: session.name ?? session.email,
        role,
        createdAt: now,
        resolvedAt: null,
      },
    });
  }

  const note = db
    .select()
    .from(schema.advisorNotes)
    .where(eq(schema.advisorNotes.id, input.id))
    .get();
  if (!note || note.tournamentId !== found.tournament.id) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  const mayResolve = can(role, "tasks") || note.personId === session.personId;
  if (!mayResolve) {
    return NextResponse.json(
      { error: "Only the organisers, or the note's author, can resolve it." },
      { status: 403 },
    );
  }

  db.update(schema.advisorNotes)
    .set(
      input.action === "resolve"
        ? { resolvedAt: now, resolvedBy: session.personId }
        : { resolvedAt: null, resolvedBy: null },
    )
    .where(eq(schema.advisorNotes.id, note.id))
    .run();
  return NextResponse.json({ ok: true });
}
