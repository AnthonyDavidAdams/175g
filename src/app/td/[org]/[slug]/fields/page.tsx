import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, getAccess } from "@/lib/access";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getTournament } from "@/lib/tournament";
import FieldMap from "./field-map";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Field layout",
  description: "Place fields on the map at true scale.",
  path: "/td",
});

export default async function FieldsPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const access = await getAccess(found.org.id);
  if (!access) redirect(`/login?next=/td/${org}/${slug}/fields`);
  const readOnly = !can(access.role, "fields");

  const rows = db
    .select()
    .from(schema.fields)
    .where(eq(schema.fields.tournamentId, found.tournament.id))
    .orderBy(asc(schema.fields.sortOrder))
    .all();

  const points = db
    .select()
    .from(schema.sitePoints)
    .where(eq(schema.sitePoints.tournamentId, found.tournament.id))
    .all();

  // Centre on the existing layout, else Kansas City as a neutral default the
  // TD will immediately pan away from.
  const center = rows.length
    ? { lat: Number(rows[0].centerLat), lng: Number(rows[0].centerLng) }
    : { lat: 39.0997, lng: -94.5786 };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href={`/td/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-3 text-3xl">Field layout</h1>
      <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
        Find your site on the satellite image, then place fields at true regulation
        scale. Use it to work out how many fields actually fit before you promise a
        field size to teams — and to hand volunteers a site map that matches the
        ground.
      </p>

      {readOnly ? (
        <div className="mt-8 space-y-4">
          <p className="mono">View only — the layout is the organisers&apos; to change</p>
          <p className="text-[var(--color-dim)]">
            {rows.length} field{rows.length === 1 ? "" : "s"} and {points.length} site
            marker{points.length === 1 ? "" : "s"} on the map. See it on the{" "}
            <Link href={`/t/${org}/${slug}/map`} className="underline hover:text-[var(--color-signal)]">
              public site map
            </Link>
            .
          </p>
          {rows.length > 0 && (
            <ul className="divide-y divide-[var(--color-line)] text-sm">
              {rows.map((f) => (
                <li key={f.id} className="flex justify-between gap-4 py-2">
                  <span>{f.name}{f.showcase ? " · showcase" : ""}</span>
                  <span className="mono">
                    {f.preset} · {f.lengthM}×{f.widthM}m · {f.bearing}°
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
      <FieldMap
        org={org}
        slug={slug}
        centerLat={center.lat}
        centerLng={center.lng}
        initialFields={rows.map((f) => ({
          id: f.id,
          name: f.name,
          preset: f.preset,
          centerLat: Number(f.centerLat),
          centerLng: Number(f.centerLng),
          bearing: f.bearing,
          lengthM: f.lengthM,
          widthM: f.widthM,
          endzoneM: f.endzoneM,
          showcase: !!f.showcase,
        }))}
        initialPoints={points.map((p) => ({
          id: p.id,
          kind: p.kind,
          label: p.label,
          lat: Number(p.lat),
          lng: Number(p.lng),
          color: p.color,
        }))}
      />
      )}
    </main>
  );
}
