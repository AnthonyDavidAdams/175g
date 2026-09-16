import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, getAccess } from "@/lib/access";
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

  const access = await getAccess(found.org.id);
  if (!access) redirect(`/login?next=/td/${org}/${slug}/page-setup`);
  const readOnly = !can(access.role, "page");

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

      {readOnly ? (
        <div className="mt-8 space-y-6">
          <p className="mono">View only — the public page is the TD&apos;s to change</p>
          <section className="panel p-5">
            <p className="mono">Directions</p>
            <pre className="mt-3 font-sans text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-dim)]">
              {t.directions || "Not written yet."}
            </pre>
          </section>
          <section className="panel p-5">
            <p className="mono">Payment</p>
            <p className="mt-3 text-sm text-[var(--color-dim)]">
              {t.paymentNote || "No payment note."}
            </p>
            <ul className="mt-2 text-sm text-[var(--color-dim)]">
              {parsePaymentOptions(t.paymentOptions).map((o, i) => (
                <li key={i}>
                  {o.method}
                  {o.handle ? ` · ${o.handle}` : ""}
                  {o.note ? ` — ${o.note}` : ""}
                </li>
              ))}
            </ul>
          </section>
          <section className="panel p-5">
            <p className="mono">Photos · {photos.length}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={`/api/media/file/${p.id}`}
                  alt={p.caption ?? ""}
                  className="h-20 w-28 rounded object-cover"
                />
              ))}
            </div>
          </section>
        </div>
      ) : (
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
      )}
    </main>
  );
}
