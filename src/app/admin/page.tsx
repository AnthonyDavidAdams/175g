import { desc, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Admin",
  description: "Operator view of this 175g deployment.",
  path: "/admin",
});

/**
 * Operator dashboard, guarded by HTTP basic auth against ADMIN_PASSWORD.
 * Not a product surface: it tells whoever runs the deployment what is on it.
 * With no ADMIN_PASSWORD set the page is disabled entirely.
 */
export default async function AdminPage() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <p className="mono">Admin disabled</p>
        <p className="mt-3 text-[var(--color-dim)]">Set ADMIN_PASSWORD on the deployment to enable it.</p>
      </main>
    );
  }
  const hdrs = await headers();
  const auth = hdrs.get("authorization") ?? "";
  const ok =
    auth.startsWith("Basic ") &&
    Buffer.from(auth.slice(6), "base64").toString("utf8").split(":").slice(1).join(":") === password;
  if (!ok) {
    // The proxy.ts challenge normally handles this; render a hint if reached directly.
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <p className="mono">Not authorised</p>
      </main>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = (table: any) =>
    db.select({ n: sql<number>`count(*)` }).from(table).get()?.n ?? 0;

  const stats = [
    ["Programs", count(schema.orgs)],
    ["Tournaments", count(schema.tournaments)],
    ["Published", db.select({ n: sql<number>`count(*)` }).from(schema.tournaments).where(sql`published = 1`).get()?.n ?? 0],
    ["People", count(schema.people)],
    ["Teams", count(schema.teams)],
    ["Games", count(schema.games)],
    ["Templates", count(schema.templates)],
    ["Agent turns", count(schema.agentMessages)],
    ["Outreach sent", db.select({ n: sql<number>`count(*)` }).from(schema.outreach).where(sql`status = 'sent'`).get()?.n ?? 0],
    ["Waiver signatures", count(schema.waiverSignatures)],
  ] as [string, number][];

  const recent = db
    .select({
      name: schema.tournaments.name,
      slug: schema.tournaments.slug,
      startDate: schema.tournaments.startDate,
      published: schema.tournaments.published,
      createdAt: schema.tournaments.createdAt,
      orgSlug: schema.orgs.slug,
      orgName: schema.orgs.name,
    })
    .from(schema.tournaments)
    .innerJoin(schema.orgs, sql`${schema.orgs.id} = ${schema.tournaments.orgId}`)
    .orderBy(desc(schema.tournaments.createdAt))
    .limit(25)
    .all();

  const env = [
    ["ANTHROPIC_API_KEY", !!process.env.ANTHROPIC_API_KEY],
    ["ANTHROPIC_MODEL", process.env.ANTHROPIC_MODEL ?? "(default)"],
    ["Email", process.env.AWS_ACCESS_KEY_ID ? "SES" : process.env.GOOGLE_REFRESH_TOKEN ? "Gmail API" : "console only"],
    ["TELEGRAM_BOT_TOKEN", !!process.env.TELEGRAM_BOT_TOKEN],
    ["NEXT_PUBLIC_UMAMI_SRC", !!process.env.NEXT_PUBLIC_UMAMI_SRC],
    ["SEED_DEMO", process.env.SEED_DEMO === "1"],
    ["DATABASE_PATH", process.env.DATABASE_PATH ?? "(default)"],
  ] as [string, boolean | string][];

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <span className="mono">Operator view</span>
      <h1 className="display mt-3 text-4xl">175g admin</h1>

      <div className="mt-8 grid gap-3 sm:grid-cols-5">
        {stats.map(([k, v]) => (
          <div key={k} className="panel p-4">
            <div className="tabular text-2xl text-[var(--color-signal)]">{v}</div>
            <div className="mono mt-1">{k}</div>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <p className="mono">Configuration</p>
        <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {env.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-[var(--color-line)] py-1.5">
              <dt className="font-mono text-xs text-[var(--color-faint)]">{k}</dt>
              <dd className={typeof v === "boolean" ? (v ? "text-[var(--color-signal)]" : "text-[var(--color-alert)]") : ""}>
                {typeof v === "boolean" ? (v ? "set" : "missing") : v}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10">
        <p className="mono">Recent tournaments</p>
        <ul className="mt-3 divide-y divide-[var(--color-line)] text-sm">
          {recent.map((t) => (
            <li key={`${t.orgSlug}/${t.slug}`} className="flex flex-wrap items-baseline justify-between gap-3 py-2">
              <a href={`/td/${t.orgSlug}/${t.slug}`} className="hover:text-[var(--color-signal)]">
                {t.name} <span className="mono ml-2">{t.orgName}</span>
              </a>
              <span className="mono">
                {t.startDate ?? "no date"} · {t.published ? "published" : "draft"} ·{" "}
                {new Date(t.createdAt * 1000).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
