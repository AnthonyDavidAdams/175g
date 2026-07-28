import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canAdminOrg, getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { PAYMENT_METHODS, parsePaymentOptions } from "@/lib/directions";
import { buildMetadata } from "@/lib/seo";
import { getTournament } from "@/lib/tournament";
import PageSetup from "./page-setup";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Page setup",
  description: "Photos, directions, and how teams pay.",
  path: "/td",
});

export default async function PageSetupPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const session = await getSession();
  if (!session) redirect(`/login?next=/td/${org}/${slug}/page-setup`);
  if (!canAdminOrg(session.personId, found.org.id)) notFound();

  const t = found.tournament;
  const photos = db
    .select()
    .from(schema.media)
    .where(eq(schema.media.tournamentId, t.id))
    .orderBy(asc(schema.media.sortOrder))
    .all();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/td/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {t.name}
      </Link>
      <h1 className="display mt-3 text-3xl">Page setup</h1>
      <p className="mt-3 leading-relaxed text-[var(--color-dim)]">
        Photos, getting-there notes, and how teams pay you. All of it shows on the
        public page and in the printed handout.
      </p>

      <PageSetup
        org={org}
        slug={slug}
        directions={t.directions ?? ""}
        venueLat={t.venueLat ? Number(t.venueLat) : null}
        venueLng={t.venueLng ? Number(t.venueLng) : null}
        paymentNote={t.paymentNote ?? ""}
        paymentOptions={parsePaymentOptions(t.paymentOptions)}
        methods={PAYMENT_METHODS}
        photos={photos.map((p) => ({
          id: p.id,
          kind: p.kind,
          caption: p.caption ?? "",
          url: `/api/media/file/${p.id}`,
        }))}
      />
    </main>
  );
}
