import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import NewTournamentForm from "./new-form";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Start a tournament",
  description: "Create a tournament on 175g. Free for college and community events.",
  path: "/new",
});

export default async function NewTournamentPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/new");

  const memberships = db
    .select()
    .from(schema.orgMembers)
    .where(eq(schema.orgMembers.personId, session.personId))
    .all();
  const orgs = memberships.length
    ? db
        .select()
        .from(schema.orgs)
        .where(inArray(schema.orgs.id, memberships.map((m) => m.orgId)))
        .all()
    : [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <Link href="/dashboard" className="mono hover:text-[var(--color-signal)]">
        ← Your tournaments
      </Link>
      <h1 className="display mt-4 text-4xl">Start a tournament</h1>
      <p className="mt-4 leading-relaxed text-[var(--color-dim)]">
        Just enough to get going. The agent takes it from here and asks for the
        rest one thing at a time — you don&apos;t need dates or a venue yet.
      </p>

      <NewTournamentForm
        orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))}
      />
    </main>
  );
}
