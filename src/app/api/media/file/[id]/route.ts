import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

function mediaDir() {
  const base = process.env.DATABASE_PATH
    ? path.dirname(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data");
  return path.join(base, "uploads");
}

/** Serve an uploaded photo. Public: these appear on the tournament page. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = db.select().from(schema.media).where(eq(schema.media.id, id)).get();
  if (!row) return new NextResponse("Not found", { status: 404 });

  const file = path.join(mediaDir(), row.tournamentId, row.filename);
  // Never let a stored filename escape its directory.
  if (!path.resolve(file).startsWith(path.resolve(mediaDir()))) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "content-type": row.mimeType,
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(row.bytes),
    },
  });
}
