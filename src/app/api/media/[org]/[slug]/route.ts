import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { canAdminOrg, getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getTournament } from "@/lib/tournament";

/**
 * Photo upload. Files land on the same volume as the database, so a backup of
 * /data is a complete backup — no second storage account for a college team to
 * set up or forget to pay for.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function mediaDir() {
  const base = process.env.DATABASE_PATH
    ? path.dirname(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data");
  return path.join(base, "uploads");
}

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

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported type "${file.type}". Use JPEG, PNG, WebP, or AVIF.` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1e6).toFixed(1)}MB. The limit is 8MB.` },
      { status: 413 },
    );
  }

  const id = nanoid();
  const ext =
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[
      file.type
    ] ?? "bin";
  const dir = path.join(mediaDir(), found.tournament.id);
  fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, `${id}.${ext}`), buf);

  const kind = String(form?.get("kind") ?? "gallery");
  const existing = db
    .select()
    .from(schema.media)
    .where(eq(schema.media.tournamentId, found.tournament.id))
    .all();

  // Only one hero. Promoting a new one demotes the old rather than silently
  // leaving two and picking arbitrarily.
  if (kind === "hero") {
    for (const m of existing.filter((x) => x.kind === "hero")) {
      db.update(schema.media)
        .set({ kind: "gallery" })
        .where(eq(schema.media.id, m.id))
        .run();
    }
  }

  db.insert(schema.media)
    .values({
      id,
      tournamentId: found.tournament.id,
      kind,
      filename: `${id}.${ext}`,
      mimeType: file.type,
      bytes: file.size,
      caption: (form?.get("caption") as string) || null,
      credit: (form?.get("credit") as string) || null,
      sortOrder: existing.length,
    })
    .run();

  return NextResponse.json({ ok: true, id, url: `/api/media/file/${id}` });
}

export async function DELETE(
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

  const body = await req.json().catch(() => null);
  const row = db
    .select()
    .from(schema.media)
    .where(eq(schema.media.id, String(body?.id)))
    .get();
  if (!row || row.tournamentId !== found.tournament.id) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  try {
    fs.unlinkSync(path.join(mediaDir(), found.tournament.id, row.filename));
  } catch {
    // Already gone from disk; still clear the row.
  }
  db.delete(schema.media).where(eq(schema.media.id, row.id)).run();
  return NextResponse.json({ ok: true });
}
