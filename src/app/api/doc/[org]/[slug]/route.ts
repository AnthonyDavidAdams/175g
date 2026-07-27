import { NextResponse } from "next/server";
import { canAdminOrg, getSession } from "@/lib/auth";
import { applyDoc, toDoc } from "@/lib/tournamentDoc";
import { getTournament } from "@/lib/tournament";

/** GET exports the tournament document. POST validates and applies one. */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ org: string; slug: string }> },
) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const session = await getSession();
  if (!session || !canAdminOrg(session.personId, found.org.id)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  // Contacts are personal data: opt in explicitly for a true backup.
  const includeContacts =
    new URL(_req.url).searchParams.get("contacts") === "include";

  return NextResponse.json(toDoc(found.tournament.id, { includeContacts }), {
    headers: {
      "content-disposition": `inline; filename="${slug}.175g.json"`,
    },
  });
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

  const body = await req.json().catch(() => null);
  if (!body?.doc) {
    return NextResponse.json({ error: "Send { doc, dryRun?, allowDestructive? }" }, { status: 400 });
  }

  try {
    const report = applyDoc(found.tournament.id, body.doc, {
      dryRun: !!body.dryRun,
      allowDestructive: !!body.allowDestructive,
    });
    return NextResponse.json(report, { status: report.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Apply failed." },
      { status: 500 },
    );
  }
}
