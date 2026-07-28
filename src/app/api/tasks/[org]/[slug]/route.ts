import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canAdminOrg, getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getTournament } from "@/lib/tournament";

const TaskInput = z.object({
  id: z.string().nullish(),
  phase: z.string().nullish(),
  task: z.string().min(1),
  owner: z.string().nullish(),
  assignee: z.string().nullish(),
  startDate: z.string().nullish(),
  dueDate: z.string().nullish(),
  hardDeadline: z.boolean().nullish(),
  done: z.boolean().nullish(),
  notes: z.string().nullish(),
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upsert"), task: TaskInput }),
  z.object({ action: z.literal("delete"), id: z.string() }),
  z.object({
    action: z.literal("bulk"),
    ids: z.array(z.string()),
    set: z.object({
      done: z.boolean().nullish(),
      assignee: z.string().nullish(),
      owner: z.string().nullish(),
    }),
  }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const session = await getSession();
  if (!session || !canAdminOrg(session.personId, found.org.id)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const t = found.tournament;
  const now = Math.floor(Date.now() / 1000);

  if (parsed.data.action === "upsert") {
    const x = parsed.data.task;
    const values = {
      phase: x.phase ?? null,
      task: x.task,
      owner: x.owner ?? null,
      assignee: x.assignee ?? null,
      startDate: x.startDate ?? null,
      dueDate: x.dueDate ?? null,
      hardDeadline: x.hardDeadline ?? false,
      done: x.done ?? false,
      doneAt: x.done ? now : null,
      notes: x.notes ?? null,
    };

    if (x.id) {
      const existing = db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, x.id))
        .get();
      if (!existing || existing.tournamentId !== t.id) {
        return NextResponse.json({ error: "Task not found." }, { status: 404 });
      }
      // Preserve the original completion time rather than resetting it on edit.
      db.update(schema.tasks)
        .set({ ...values, doneAt: x.done ? (existing.doneAt ?? now) : null })
        .where(eq(schema.tasks.id, x.id))
        .run();
      return NextResponse.json({ ok: true, id: x.id });
    }

    const id = nanoid();
    db.insert(schema.tasks)
      .values({ id, tournamentId: t.id, ...values })
      .run();
    return NextResponse.json({ ok: true, id });
  }

  if (parsed.data.action === "delete") {
    const existing = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, parsed.data.id))
      .get();
    if (!existing || existing.tournamentId !== t.id) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }
    db.delete(schema.tasks).where(eq(schema.tasks.id, parsed.data.id)).run();
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.set.done !== undefined && parsed.data.set.done !== null) {
    patch.done = parsed.data.set.done;
    patch.doneAt = parsed.data.set.done ? now : null;
  }
  if (parsed.data.set.assignee !== undefined) {
    patch.assignee = parsed.data.set.assignee ?? null;
  }
  if (parsed.data.set.owner !== undefined) patch.owner = parsed.data.set.owner ?? null;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  for (const id of parsed.data.ids) {
    const existing = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, id))
      .get();
    if (existing?.tournamentId !== t.id) continue;
    db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, id)).run();
  }
  return NextResponse.json({ ok: true, updated: parsed.data.ids.length });
}
