import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { getTournament } from "@/lib/tournament";
import SignupList from "./signup-list";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  const name = found?.tournament.name ?? "Tournament";
  return buildMetadata({
    title: `Volunteer — ${name}`,
    description: `Sign up for a volunteer shift at ${name}.`,
    path: `/t/${org}/${slug}/volunteer`,
    image: found?.tournament.ogImage ?? undefined,
  });
}

export default async function VolunteerPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const shifts = db
    .select()
    .from(schema.shifts)
    .where(eq(schema.shifts.tournamentId, found.tournament.id))
    .orderBy(asc(schema.shifts.day), asc(schema.shifts.startTime))
    .all();

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <Link href={`/t/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {found.tournament.name}
      </Link>
      <h1 className="display mt-4 text-4xl">Volunteer</h1>
      <p className="mt-4 leading-relaxed text-[var(--color-dim)]">
        Tournaments run on volunteers. Take a shift and we&apos;ll feed you.
      </p>

      {shifts.length === 0 ? (
        <p className="mt-8 text-[var(--color-dim)]">
          Shifts haven&apos;t been posted yet. Check back closer to the event.
        </p>
      ) : (
        <SignupList
          org={org}
          slug={slug}
          shifts={shifts.map((s) => ({
            id: s.id,
            day: s.day,
            role: s.role,
            startTime: s.startTime,
            endTime: s.endTime,
            taken: !!s.personId,
          }))}
        />
      )}
    </main>
  );
}
