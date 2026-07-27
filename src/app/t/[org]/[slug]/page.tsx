import Link from "next/link";
import { notFound } from "next/navigation";
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

  return buildMetadata({
    title: t.name,
    description:
      t.description ??
      `${t.name}${bits.length ? ` — ${bits.join(" · ")}` : ""}. Schedule, scores, and standings.`,
    path: `/t/${org}/${slug}`,
    image: t.ogImage ?? undefined,
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

  const nav = [
    ["Schedule", `/t/${org}/${slug}/schedule`],
    ["Standings", `/t/${org}/${slug}/standings`],
    ["Teams", `/t/${org}/${slug}/teams`],
    ["Apply", `/t/${org}/${slug}/apply`],
    ["Volunteer", `/t/${org}/${slug}/volunteer`],
    ["Waiver", `/t/${org}/${slug}/waiver`],
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
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
