import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import {
  VISIBILITIES,
  canSeeTemplate,
  getTemplate,
  parseTemplate,
  summarize,
} from "@/lib/templates";

/** GET one template (full document). POST edits, re-shares, or deletes it. */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = getTemplate(id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const session = await getSession();
  const token = new URL(req.url).searchParams.get("token");
  if (!canSeeTemplate(row, session?.personId ?? null, token)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }
  const doc = parseTemplate(row);
  return NextResponse.json(
    {
      id: row.id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      builtIn: row.orgId === null,
      useCount: row.useCount,
      summary: summarize(doc),
      doc,
    },
    { headers: { "content-disposition": `inline; filename="${row.id}.175g-template.json"` } },
  );
}

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    name: z.string().trim().min(2).optional(),
    description: z.string().trim().max(2000).nullish(),
    visibility: z.enum(VISIBILITIES).optional(),
  }),
  z.object({ action: z.literal("rotate_link") }),
  z.object({ action: z.literal("delete") }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = getTemplate(id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!row.orgId) {
    return NextResponse.json({ error: "Built-in templates can't be edited." }, { status: 403 });
  }

  const auth = await requireAccess(row.orgId, "templates.manage");
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const now = Math.floor(Date.now() / 1000);

  if (input.action === "delete") {
    db.delete(schema.templates).where(eq(schema.templates.id, id)).run();
    return NextResponse.json({ ok: true });
  }

  if (input.action === "rotate_link") {
    const { nanoid } = await import("nanoid");
    const shareToken = nanoid(24);
    db.update(schema.templates)
      .set({ shareToken, updatedAt: now })
      .where(eq(schema.templates.id, id))
      .run();
    return NextResponse.json({ ok: true, shareUrl: `/templates/${id}?token=${shareToken}` });
  }

  const patch: Record<string, unknown> = { updatedAt: now };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  db.update(schema.templates).set(patch).where(eq(schema.templates.id, id)).run();

  const updated = getTemplate(id)!;
  return NextResponse.json({
    ok: true,
    visibility: updated.visibility,
    shareUrl:
      updated.visibility === "link"
        ? `/templates/${id}?token=${updated.shareToken}`
        : `/templates/${id}`,
  });
}
