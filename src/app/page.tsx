import Link from "next/link";
import { PUBLIC_AGENT_ENABLED } from "@/lib/agent/intake";
import { getSession } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import IntakeChat from "./intake-chat";

export const dynamic = "force-dynamic";

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
    body: "USA Ultimate sanctioning if you want it, certificates of insurance for the university, waivers, rosters, the medical plan, the weather plan. The paperwork that gates everything else.",
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
    body: "Every contact, vendor, cost, and mistake written down and handed to next year's TD. Save the whole thing as a template and the next program starts from your work.",
  },
];

export default async function Home() {
  const session = await getSession();

  return (
    <main>
      <div className="mx-auto max-w-5xl px-6">
        {/* Masthead */}
        <div className="flex items-center justify-between py-6">
          <span className="mono text-[var(--color-dim)]">175g</span>
          <nav className="flex gap-5">
            <Link href="/templates" className="mono hover:text-[var(--color-signal)]">
              Templates
            </Link>
            {session ? (
              <Link href="/dashboard" className="mono hover:text-[var(--color-signal)]">
                Your console →
              </Link>
            ) : (
              <Link href="/login" className="mono hover:text-[var(--color-signal)]">
                Sign in
              </Link>
            )}
          </nav>
        </div>

        {/* Hero: the agent */}
        <section className="grid gap-10 py-12 lg:grid-cols-[1fr_1.15fr] lg:items-start lg:py-20">
          <div>
            <p className="mono live">Tournament director, running</p>
            <h1 className="display mt-6 text-[clamp(2.5rem,6.5vw,4.5rem)]">
              Run a world-class
              <br />
              <span className="text-[var(--color-signal)]">ultimate tournament.</span>
            </h1>
            <p className="mt-6 max-w-xl leading-relaxed text-[var(--color-dim)]">
              Most college tournaments are run by a sophomore who has never done it
              before, learning by getting it wrong in public. 175g is a tournament
              director that already knows. Start talking — it does the work with you,
              from the first field email to the archive you hand the next TD.
            </p>
            <p className="mono mt-6">
              Free for college &amp; community tournaments · No password, ever
            </p>
          </div>

          <div className="layer">
            <IntakeChat enabled={PUBLIC_AGENT_ENABLED} />
            <p className="mono mt-3 normal-case tracking-normal">
              Already running one?{" "}
              <Link href={session ? "/dashboard" : "/login"} className="hover:text-[var(--color-signal)]">
                {session ? "Open your console" : "Sign in"}
              </Link>
              . Advising a program?{" "}
              <Link href="/templates" className="hover:text-[var(--color-signal)]">
                Share a template
              </Link>
              .
            </p>
          </div>
        </section>

        <hr className="rule" />

        {/* How it works */}
        <section className="py-20">
          <p className="mono">How it works</p>
          <h2 className="display mt-4 text-[clamp(1.75rem,4vw,2.75rem)]">
            You talk. It builds.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              [
                "Say what you want to run",
                "A school and a rough month is enough. The agent asks for the next thing that unblocks the next thing — one decision at a time, never a questionnaire.",
              ],
              [
                "It does the work",
                "Records the facts, builds the plan and the budget, drafts the field email and the bid announcement, generates a USAU-compliant schedule. Nothing sends without your approval.",
              ],
              [
                "Your whole team is in",
                "Co-organisers run it with you. Staff enter scores from the field. Alumni advisors see everything, change nothing, and leave notes. Next year starts from a template of this year.",
              ],
            ].map(([title, body], i) => (
              <div key={title} className="panel p-6">
                <span className="mono text-[var(--color-signal)]">0{i + 1}</span>
                <h3 className="mt-3 text-lg font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-dim)]">{body}</p>
              </div>
            ))}
          </div>
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
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-dim)]">{c.body}</p>
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
            frameworks for organising tournaments at the professional level. He also
            founded Don&apos;t Give Up the Disc, now in its 26th year and one of the
            best beach tournaments in the world.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              ["2001", "taught tournament frameworks at UPA HQ"],
              ["26", "years of Don't Give Up the Disc"],
              ["9", "tiebreak rules, in order"],
            ].map(([stat, label]) => (
              <div key={label}>
                <div className="tabular text-4xl text-[var(--color-signal)]">{stat}</div>
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
            licence asks that you share those changes back.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href="https://github.com/AnthonyDavidAdams/175g" className="btn btn-ghost">
              View on GitHub
            </a>
            <span className="mono">AGPL-3.0</span>
          </div>
        </section>

        <hr className="rule" />

        <footer className="flex flex-wrap items-center justify-between gap-4 py-10">
          <span className="mono">175g — the weight of a regulation disc</span>
          <a href="#top" className="mono hover:text-[var(--color-signal)]">
            Talk to the TD ↑
          </a>
        </footer>
      </div>
    </main>
  );
}
