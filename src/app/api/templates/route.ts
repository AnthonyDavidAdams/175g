import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { getSession } from "@/lib/auth";
import {
  VISIBILITIES,
  buildTemplate,
  createTemplate,
  listTemplatesFor,
  parseTemplate,
  summarize,
} from "@/lib/templates";
import { getTournament } from "@/lib/tournament";

/** GET lists templates the signed-in person can use. POST saves one from a tournament. */

export async function GET() {
  const session = await getSession();
  const rows = listTemplatesFor(session?.personId ?? null);
  return NextResponse.json({
    templates: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      visibility: r.visibility,
      builtIn: r.orgId === null,
      useCount: r.useCount,
      summary: summarize(parseTemplate(r)),
    })),
  });
}

const Save = z.object({
  org: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().trim().min(2, "Give the template a name."),
  description: z.string().trim().max(2000).nullish(),
  includeVenue: z.boolean().default(false),
  visibility: z.enum(VISIBILITIES).default("org"),
});

export async function POST(req: Request) {
  const parsed = Save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const found = getTournament(input.org, input.slug);
  if (!found) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });

  // Saving a template reads the tournament; it changes nothing. Advisors can.
  const auth = await requireAccess(found.org.id, "templates.save");
  if (!auth.ok) return auth.response;

  const doc = buildTemplate(found.tournament.id, { includeVenue: input.includeVenue });
  const row = createTemplate({
    orgId: found.org.id,
    createdBy: auth.access.session.personId,
    sourceTournamentId: found.tournament.id,
    name: input.name,
    description: input.description ?? null,
    doc,
    visibility: input.visibility,
  });

  return NextResponse.json({
    ok: true,
    id: row.id,
    url: `/templates/${row.id}`,
    shareUrl:
      row.visibility === "link"
        ? `/templates/${row.id}?token=${row.shareToken}`
        : `/templates/${row.id}`,
    summary: summarize(doc),
  });
}
