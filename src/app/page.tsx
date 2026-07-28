import Link from "next/link";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "175g",
  description:
    "An AI tournament director for ultimate. Dates, fields, insurance, teams, schedules, sponsors, swag, gameday, and the institutional memory your program keeps losing. Free for college and community tournaments.",
  path: "/",
});

const CAPABILITIES = [
  {
    n: "01",
    title: "Dates and fields",
    body: "Finds the weekend that survives the season window, competing bids, and finals. Then finds the person at campus rec or the parks department who actually controls the fields — by name.",
  },
  {
    n: "02",
    title: "Sanctioning and insurance",
    body: "USA Ultimate sanctioning, certificates of insurance for the university, waivers, rosters, the medical plan, the weather plan. The paperwork that gates everything else.",
  },
  {
    n: "03",
    title: "Budget and bid fee",
    body: "A real budget from the TD Manual's own categories, break-even at every attendance level, and a fee priced so two teams dropping doesn't come out of your pocket.",
  },
  {
    n: "04",
    title: "Teams",
    body: "Target lists three times the size of your field, bid announcements, applications, a waitlist weighted toward local teams, and the payment chase you'd rather not do.",
  },
  {
    n: "05",
    title: "Sponsors and swag",
    body: "Local sponsors for cash or product — 300 hungry athletes is the pitch. Discs, jerseys, Nalgenes, stickers, ordered before the lead time bites.",
  },
  {
    n: "06",
    title: "Format and schedule",
    body: "USAU-compliant pools, published seeding tables, brackets, and the nine-rule tiebreak procedure. Regenerated in seconds when a team drops on Thursday.",
  },
  {
    n: "07",
    title: "Gameday",
    body: "Score reporting from the field by Telegram, live standings, weather calls with a pre-decided degradation order, and the hour-by-hour runbook.",
  },
  {
    n: "08",
    title: "Memory",
    body: "Every contact, vendor, cost, and mistake written down and handed to next year's TD. The thing college ultimate loses every four years.",
  },
];

export default function Home() {
  return (
    <main>
      <div className="mx-auto max-w-5xl px-6">
        {/* Masthead */}
        <div className="flex items-center justify-between py-6">
          <span className="mono text-[var(--color-dim)]">175g</span>
          <Link href="/login" className="mono hover:text-[var(--color-signal)]">
            Sign in
          </Link>
        </div>

        {/* Hero */}
        <section className="py-20 sm:py-28">
          <p className="mono live">Tournament director, running</p>
          <h1 className="display mt-6 text-[clamp(2.75rem,8vw,5.5rem)]">
            Run a world-class
            <br />
            <span className="text-[var(--color-signal)]">ultimate tournament.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-[var(--color-dim)]">
            Most college tournaments are run by a sophomore who has never done it
            before, learning by getting it wrong in public. 175g is a tournament
            director that already knows — and does the work with you, from the first
            field email to the archive you hand the next TD.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/new" className="btn btn-primary">
              Start a tournament
            </Link>
            <span className="mono">Free for college &amp; community tournaments</span>
          </div>
        </section>

        <hr className="rule" />

        {/* Console preview */}
        <section className="py-20">
          <p className="mono">How it works</p>
          <h2 className="display mt-4 text-[clamp(1.75rem,4vw,2.75rem)]">
            You talk. It builds.
          </h2>

          <div className="panel mt-10 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
              <span className="mono">td console</span>
            </div>
            <div className="space-y-5 p-5 font-mono text-[13px] leading-relaxed sm:p-6">
              <p className="text-[var(--color-dim)]">
                <span className="text-[var(--color-signal)]">›</span> we want to host
                something in late february, maybe 16 teams
              </p>
              <p>
                Late February is inside the college regular season, so it can be
                sanctioned and count toward rankings. Sixteen teams needs eight fields
                over two days.
                <br />
                <br />
                First real question: do you have fields, or is that still unknown?
              </p>
              <p className="text-[var(--color-dim)]">
                <span className="text-[var(--color-signal)]">›</span> unknown. we
                usually practice on the rec fields
              </p>
              <p>
                Then the person you need is the Facilities Coordinator at Campus
                Recreation — not the club sports office, which is where most teams
                start and lose three weeks.
                <br />
                <br />
                I&apos;ve drafted the first email. It leads with insurance and cleanup,
                because those are the two questions they were about to ask. Review it
                and I&apos;ll queue it.
              </p>
              <p className="text-[var(--color-faint)]">
                <span className="text-[var(--color-signal)]">✓</span> update_tournament
                · dates, division, teamTarget
                <br />
                <span className="text-[var(--color-signal)]">✓</span> generate_timeline
                · 56 deadlines, 4 due this week
                <br />
                <span className="text-[var(--color-signal)]">✓</span> draft_outreach ·
                queued for your approval
              </p>
            </div>
          </div>

          <p className="mt-6 max-w-2xl leading-relaxed text-[var(--color-dim)]">
            One decision at a time. It records what you tell it, drafts what you need,
            generates the schedule, and ends every session telling you what is due
            next. Nothing sends without your approval.
          </p>
        </section>

        <hr className="rule" />

        {/* Capabilities */}
        <section className="py-20">
          <p className="mono">Coverage</p>
          <h2 className="display mt-4 text-[clamp(1.75rem,4vw,2.75rem)]">
            The whole tournament.
          </h2>

          <div className="mt-12 grid gap-px sm:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <div key={c.n} className="panel panel-hover p-6">
                <span className="mono text-[var(--color-signal)]">{c.n}</span>
                <h3 className="mt-3 text-lg font-medium">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-dim)]">
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* Provenance */}
        <section className="py-20">
          <p className="mono">Grounding</p>
          <h2 className="display mt-4 max-w-2xl text-[clamp(1.5rem,3.5vw,2.25rem)]">
            It isn&apos;t improvising.
          </h2>
          <p className="mt-6 max-w-2xl leading-relaxed text-[var(--color-dim)]">
            Built on the USA Ultimate Tournament Director Manual and the UPA Manual of
            Championship Series Tournament Formats. Pools are seeded from the published
            tables rather than naive snaking, so bracket matchups don&apos;t repeat pool
            play. Nobody plays more than nine games in two days. Ties break by the
            nine-rule procedure, verified against the manual&apos;s own worked examples.
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-[var(--color-dim)]">
            It also isn&apos;t theoretical. In 2001 the UPA — now USA Ultimate —
            brought its author out to headquarters to teach their staff the
            frameworks for organising tournaments at the professional level. Those
            frameworks went on to shape how a lot of local communities run their
            events. He also founded Don&apos;t Give Up the Disc, now in its 26th year
            and one of the best beach tournaments in the world.
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-[var(--color-dim)]">
            175g is that quarter century of tournament directing, written down and
            handed to whoever is running yours.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              ["2001", "taught tournament frameworks at UPA HQ"],
              ["26", "years of Don't Give Up the Disc"],
              ["9", "tiebreak rules, in order"],
            ].map(([stat, label]) => (
              <div key={label}>
                <div className="tabular text-4xl text-[var(--color-signal)]">
                  {stat}
                </div>
                <div className="mono mt-2">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        <section className="py-20">
          <p className="mono">Open source</p>
          <h2 className="display mt-4 max-w-2xl text-[clamp(1.5rem,3.5vw,2.25rem)]">
            Fork it. Improve it. Run your own.
          </h2>
          <p className="mt-6 max-w-2xl leading-relaxed text-[var(--color-dim)]">
            175g is AGPL-3.0. Read the code, self-host it for your league, or send a
            pull request — the format engine and the tiebreak procedure especially
            deserve more eyes. If you run a modified version as a service, the
            licence asks that you share those changes back, so the next college
            hacker starts from your work rather than from scratch.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="https://github.com/AnthonyDavidAdams/175g"
              className="btn btn-ghost"
            >
              View on GitHub
            </a>
            <span className="mono">AGPL-3.0</span>
          </div>
        </section>

        <hr className="rule" />

        <footer className="flex flex-wrap items-center justify-between gap-4 py-10">
          <span className="mono">175g — the weight of a regulation disc</span>
          <Link href="/new" className="mono hover:text-[var(--color-signal)]">
            Start →
          </Link>
        </footer>
      </div>
    </main>
  );
}
