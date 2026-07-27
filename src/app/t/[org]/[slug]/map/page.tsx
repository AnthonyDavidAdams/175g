import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getTournament } from "@/lib/tournament";
import PublicMap from "./public-map";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  const name = found?.tournament.name ?? "Tournament";
  return buildMetadata({
    title: `Site map — ${name}`,
    description: `Field layout, water, parking, and the trainer's location for ${name}.`,
    path: `/t/${org}/${slug}/map`,
    image: found?.tournament.ogImage ?? undefined,
  });
}

export default async function MapPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();
  const t = found.tournament;

  const fields = db
    .select()
    .from(schema.fields)
    .where(eq(schema.fields.tournamentId, t.id))
    .orderBy(asc(schema.fields.sortOrder))
    .all();
  const points = db
    .select()
    .from(schema.sitePoints)
    .where(eq(schema.sitePoints.tournamentId, t.id))
    .all();

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <Link href={`/t/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {t.name}
      </Link>
      <h1 className="display mt-4 text-4xl">Site map</h1>
      <p className="mt-4 leading-relaxed text-[var(--color-dim)]">
        {[t.venueName, t.venueAddress ?? t.city].filter(Boolean).join(" · ")}
      </p>

      {fields.length === 0 && points.length === 0 ? (
        <p className="mt-8 text-[var(--color-dim)]">
          The field layout hasn&apos;t been published yet.
        </p>
      ) : (
        <>
          <PublicMap
            fields={fields.map((f) => ({
              name: f.name,
              centerLat: Number(f.centerLat),
              centerLng: Number(f.centerLng),
              bearing: f.bearing,
              lengthM: f.lengthM,
              widthM: f.widthM,
              endzoneM: f.endzoneM,
            }))}
            points={points.map((p) => ({
              kind: p.kind,
              label: p.label,
              lat: Number(p.lat),
              lng: Number(p.lng),
              color: p.color,
            }))}
          />
          <p className="mono mt-4 normal-case tracking-normal">
            Pinch or scroll to zoom. Print the two-sided version from{" "}
            <Link
              href={`/t/${org}/${slug}/handout`}
              className="underline hover:text-[var(--color-signal)]"
            >
              the handout
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}
