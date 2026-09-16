import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { sendEmail } from "@/lib/email";

/** Approve-and-send, or discard. Nothing leaves without an explicit approval. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const draft = db
    .select()
    .from(schema.outreach)
    .where(eq(schema.outreach.id, id))
    .get();
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const tournament = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, draft.tournamentId))
    .get();
  if (!tournament) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // Approving outreach puts the program's name on an email. TD and owner only.
  const auth = await requireAccess(tournament.orgId, "outreach");
  if (!auth.ok) return auth.response;
  const { session } = auth.access;

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === "discard") {
    db.update(schema.outreach)
      .set({ status: "discarded" })
      .where(eq(schema.outreach.id, id))
      .run();
    return NextResponse.json({ ok: true, status: "discarded" });
  }

  if (action !== "send") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  if (draft.status === "sent") {
    return NextResponse.json({ error: "Already sent." }, { status: 409 });
  }

  try {
    await sendEmail({
      to: draft.toEmail,
      subject: draft.subject,
      text: draft.body,
      replyTo: session.email,
    });
    db.update(schema.outreach)
      .set({
        status: "sent",
        approvedAt: Math.floor(Date.now() / 1000),
        sentAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(schema.outreach.id, id))
      .run();
    return NextResponse.json({ ok: true, status: "sent" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed.";
    db.update(schema.outreach)
      .set({ status: "failed", error: message })
      .where(eq(schema.outreach.id, id))
      .run();
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
