import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { methodLabel, parsePaymentOptions } from "@/lib/directions";
import { formatDateRange, getTournament } from "@/lib/tournament";
import ApplyForm from "./apply-form";

type Params = { params: Promise<{ org: string; slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  const name = found?.tournament.name ?? "Tournament";
  return buildMetadata({
    title: `Apply — ${name}`,
    description: `Apply for a bid to ${name}.`,
    path: `/t/${org}/${slug}/apply`,
    image: found?.tournament.ogImage ?? undefined,
  });
}

export default async function ApplyPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();
  const t = found.tournament;

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <Link href={`/t/${org}/${slug}`} className="mono hover:text-[var(--color-signal)]">
        ← {t.name}
      </Link>
      <h1 className="display mt-4 text-4xl">Apply for a bid</h1>
      <p className="mt-4 leading-relaxed text-[var(--color-dim)]">
        {[formatDateRange(t.startDate, t.endDate), t.venueName, t.city]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <ApplyForm
        org={org}
        slug={slug}
        bidFee={t.bidFee}
        applyDeadline={t.applyDeadline}
        payments={parsePaymentOptions(t.paymentOptions).map((p) => ({
          label: methodLabel(p.method),
          handle: p.handle,
        }))}
      />

      {t.refundPolicy && (
        <section className="mt-12">
          <hr className="rule" />
          <p className="mono mt-6">Refund policy</p>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-[var(--color-dim)]">
            {t.refundPolicy}
          </p>
        </section>
      )}
    </main>
  );
}
