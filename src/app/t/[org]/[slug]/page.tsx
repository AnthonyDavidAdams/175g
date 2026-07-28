import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import {
  PAYMENT_DISCLAIMER,
  formatCoords,
  mapLinks,
  methodLabel,
  parsePaymentOptions,
} from "@/lib/directions";
import { buildMetadata } from "@/lib/seo";
import {
  formatDateRange,
  getAnnouncements,
  getTeams,
  getTournament,
} from "@/lib/tournament";

type Params = { params: Promise<{ org: string; slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) return buildMetadata({ title: "Tournament not found", path: "/" });

  const { tournament: t } = found;
  const dates = formatDateRange(t.startDate, t.endDate);
  const bits = [
    dates,
    t.city,
    t.division ? `${t.division} division` : null,
    t.teamTarget ? `${t.teamTarget} teams` : null,
  ].filter(Boolean);

  const hero = db
    .select()
    .from(schema.media)
    .where(eq(schema.media.tournamentId, t.id))
    .all()
    .find((m) => m.kind === "hero");

  return buildMetadata({
    title: t.name,
    description:
      t.description ??
      `${t.name}${bits.length ? ` — ${bits.join(" · ")}` : ""}. Schedule, scores, and standings.`,
    path: `/t/${org}/${slug}`,
    image: hero ? `/api/media/file/${hero.id}` : (t.ogImage ?? undefined),
    type: "article",
  });
}

export default async function TournamentPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();

  const { tournament: t } = found;
  const teams = getTeams(t.id);
  const accepted = teams.filter((x) => x.status === "accepted");
  const announcements = getAnnouncements(t.id, 5);
  const dates = formatDateRange(t.startDate, t.endDate);

  const photos = db
    .select()
    .from(schema.media)
    .where(eq(schema.media.tournamentId, t.id))
    .orderBy(asc(schema.media.sortOrder))
    .all();
  const hero = photos.find((m) => m.kind === "hero");
  const gallery = photos.filter((m) => m.id !== hero?.id);

  const payments = parsePaymentOptions(t.paymentOptions);
  const lat = t.venueLat ? Number(t.venueLat) : null;
  const lng = t.venueLng ? Number(t.venueLng) : null;
  const coords = formatCoords(lat, lng);
  const links = mapLinks(lat, lng, t.venueName ?? t.name);

  const nav = [
    ["Schedule", `/t/${org}/${slug}/schedule`],
    ["Standings", `/t/${org}/${slug}/standings`],
    ["Teams", `/t/${org}/${slug}/teams`],
    ["Apply", `/t/${org}/${slug}/apply`],
    ["Volunteer", `/t/${org}/${slug}/volunteer`],
    ["Waiver", `/t/${org}/${slug}/waiver`],
    ["Site map", `/t/${org}/${slug}/map`],
    ["Handout", `/t/${org}/${slug}/handout`],
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      {hero && (
        <img
          src={`/api/media/file/${hero.id}`}
          alt={hero.caption ?? t.name}
          className="mb-8 h-56 w-full rounded-lg object-cover sm:h-72"
        />
      )}

      <header>
        <h1 className="display text-4xl sm:text-5xl">{t.name}</h1>
        <p className="mt-3 text-lg text-[var(--color-dim)]">
          {[dates, t.venueName, t.city].filter(Boolean).join(" · ") ||
            "Details coming soon"}
        </p>
      </header>

      <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-y border-[var(--color-line)] py-3 text-sm">
        {nav.map(([label, href]) => (
          <Link key={href} href={href} className="hover:text-[var(--color-signal)]">
            {label}
          </Link>
        ))}
      </nav>

      {announcements.length > 0 && (
        <section className="mt-8 space-y-2">
          {announcements.map((a) => (
            <div
              key={a.id}
              className={`rounded-md border px-4 py-3 text-sm ${
                a.level === "urgent"
                  ? "border-[var(--color-signal)]/60 bg-[var(--color-signal)]/10"
                  : a.level === "warning"
                    ? "border-[var(--color-warn)]/50 bg-[var(--color-warn)]/10"
                    : "border-[var(--color-line)]"
              }`}
            >
              {a.body}
            </div>
          ))}
        </section>
      )}

      {t.description && (
        <section className="mt-10 leading-relaxed whitespace-pre-line">
          {t.description}
        </section>
      )}

      <section className="mt-10 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
        <Fact label="Division" value={t.division} />
        <Fact label="Teams" value={accepted.length ? `${accepted.length} accepted` : t.teamTarget ? `${t.teamTarget} target` : null} />
        <Fact label="Fields" value={t.fieldCount ? `${t.fieldCount} ${t.surface ?? ""}`.trim() : null} />
        <Fact label="Bid fee" value={t.bidFee ? `$${(t.bidFee / 100).toFixed(0)}` : null} />
        <Fact label="Games guaranteed" value={t.gamesGuaranteed} />
        <Fact label="Sanctioned" value={t.sanctioned ? "USA Ultimate" : "No"} />
        <Fact label="Apply by" value={t.applyDeadline} />
        <Fact label="Payment due" value={t.paymentDeadline} />
        <Fact label="Rosters due" value={t.rosterDeadline} />
      </section>

      {t.refundPolicy && (
        <section className="mt-10 border-t border-[var(--color-line)] pt-6">
          <h2 className="mono">
            Refund policy
          </h2>
          <p className="mt-3 leading-relaxed whitespace-pre-line">{t.refundPolicy}</p>
        </section>
      )}

      {t.telegramInviteUrl && (
        <section className="mt-10">
          <a
            href={t.telegramInviteUrl}
            className="btn btn-ghost"
          >
            Join the tournament group chat
          </a>
        </section>
      )}

      {(t.directions || coords) && (
        <section className="mt-10 border-t border-[var(--color-line)] pt-6">
          <h2 className="mono">Getting there</h2>
          {coords && (
            <p className="mt-3 text-sm">
              <span className="tabular">{coords}</span>
              {links && (
                <span className="ml-3 text-[var(--color-dim)]">
                  <a href={links.google} className="hover:text-[var(--color-signal)]">
                    Google
                  </a>
                  {" · "}
                  <a href={links.apple} className="hover:text-[var(--color-signal)]">
                    Apple
                  </a>
                  {" · "}
                  <a href={links.osm} className="hover:text-[var(--color-signal)]">
                    OSM
                  </a>
                </span>
              )}
            </p>
          )}
          {t.directions && (
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-[var(--color-dim)]">
              {t.directions}
            </p>
          )}
        </section>
      )}

      {payments.length > 0 && (
        <section className="mt-10 border-t border-[var(--color-line)] pt-6">
          <h2 className="mono">Paying your bid</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {payments.map((p, i) => (
              <li key={i}>
                <span className="font-medium">{methodLabel(p.method)}</span>
                {p.handle && (
                  <span className="tabular ml-2 text-[var(--color-dim)]">{p.handle}</span>
                )}
                {p.note && (
                  <span className="ml-2 text-[var(--color-dim)]">{p.note}</span>
                )}
              </li>
            ))}
          </ul>
          {t.paymentNote && (
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-dim)]">
              {t.paymentNote}
            </p>
          )}
          <p className="mono mt-3 normal-case tracking-normal">
            {PAYMENT_DISCLAIMER}
          </p>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="mt-10 grid gap-3 sm:grid-cols-2">
          {gallery.map((m) => (
            <figure key={m.id}>
              <img
                src={`/api/media/file/${m.id}`}
                alt={m.caption ?? ""}
                className="h-44 w-full rounded-lg object-cover"
              />
              {m.caption && <figcaption className="mono mt-1.5">{m.caption}</figcaption>}
            </figure>
          ))}
        </section>
      )}

      <footer className="mt-16 border-t border-[var(--color-line)] pt-8 text-sm text-[var(--color-dim)]">
        <Link href="/">Run your own tournament with 175g</Link>
      </footer>
    </main>
  );
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="mono">
        {label}
      </dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
