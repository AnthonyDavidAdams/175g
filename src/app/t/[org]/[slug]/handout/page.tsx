import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { db, schema } from "@/lib/db";
import {
  PAYMENT_DISCLAIMER,
  formatCoords,
  methodLabel,
  parsePaymentOptions,
} from "@/lib/directions";
import { SITE_URL, buildMetadata } from "@/lib/seo";
import { backdropTiles, layoutBounds, siteMapSvg } from "@/lib/siteMapSvg";
import {
  formatDateRange,
  getTeams,
  getTournament,
  resolvedGames,
} from "@/lib/tournament";
import PrintButton from "./print-button";

type Params = { params: Promise<{ org: string; slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  const name = found?.tournament.name ?? "Tournament";
  return buildMetadata({
    title: `Handout — ${name}`,
    description: `Printable two-sided player handout for ${name}: schedule, site map, rules, and contacts.`,
    path: `/t/${org}/${slug}/handout`,
    image: found?.tournament.ogImage ?? undefined,
  });
}

export default async function HandoutPage({ params }: Params) {
  const { org, slug } = await params;
  const found = getTournament(org, slug);
  if (!found) notFound();
  const t = found.tournament;

  const teams = getTeams(t.id).filter((x) => x.status === "accepted");
  const games = resolvedGames(t.id);
  const fields = db
    .select()
    .from(schema.fields)
    .where(eq(schema.fields.tournamentId, t.id))
    .orderBy(asc(schema.fields.sortOrder))
    .all();
  const points = db
    .select()
    .from(schema.sitePoints)
    .where(eq(schema.sitePoints.tournamentId, t.id))
    .all();

  const payments = parsePaymentOptions(t.paymentOptions);
  const coords = formatCoords(
    t.venueLat ? Number(t.venueLat) : null,
    t.venueLng ? Number(t.venueLng) : null,
  );

  const publicUrl = new URL(`/t/${org}/${slug}`, SITE_URL).toString();
  const scheduleUrl = new URL(`/t/${org}/${slug}/schedule`, SITE_URL).toString();

  const qr = await QRCode.toDataURL(scheduleUrl, {
    margin: 0,
    width: 320,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });

  const mapFields = fields.map((f) => ({
    name: f.name,
    centerLat: Number(f.centerLat),
    centerLng: Number(f.centerLng),
    bearing: f.bearing,
    lengthM: f.lengthM,
    widthM: f.widthM,
    endzoneM: f.endzoneM,
  }));
  const mapPoints = points.map((p) => ({
    kind: p.kind,
    label: p.label,
    lat: Number(p.lat),
    lng: Number(p.lng),
    color: p.color,
  }));

  // Aerial imagery behind the line art: someone standing in the car park can
  // match the page to what they can actually see. If the tiles don't load, the
  // map still renders as line art rather than failing.
  const bounds = layoutBounds(mapFields, mapPoints);
  let backdrop: string | null = null;
  if (bounds) {
    try {
      backdrop = await backdropTiles(bounds, 700, 460);
    } catch {
      backdrop = null;
    }
  }

  const map = siteMapSvg(mapFields, mapPoints, {
    backdrop,
    bounds: backdrop ? bounds : null,
  });

  // Pools, for the front page.
  const pools = new Map<string, string[]>();
  for (const team of teams) {
    if (!team.pool) continue;
    pools.set(team.pool, [...(pools.get(team.pool) ?? []), team.name]);
  }

  const rounds = new Map<number, typeof games>();
  for (const g of games) {
    if (g.stage !== "pool") continue;
    rounds.set(g.round ?? 0, [...(rounds.get(g.round ?? 0) ?? []), g]);
  }

  return (
    <>
      <PrintButton />

      <main className="handout">
        {/* ---------------- FRONT ---------------- */}
        <section className="page">
          <header className="head">
            <div>
              <h1>{t.name}</h1>
              <p className="sub">
                {[formatDateRange(t.startDate, t.endDate), t.venueName, t.city]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="qr">
              <img src={qr} alt={`QR code linking to ${scheduleUrl}`} />
              <span>Live schedule &amp; scores</span>
            </div>
          </header>

          {pools.size > 0 && (
            <section className="block">
              <h2>Pools</h2>
              <div className="cols">
                {[...pools.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([pool, names]) => (
                    <div key={pool}>
                      <h3>Pool {pool}</h3>
                      <ol>
                        {names.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {rounds.size > 0 && (
            <section className="block">
              <h2>Pool play</h2>
              <table>
                <tbody>
                  {[...rounds.entries()]
                    .sort(([a], [b]) => a - b)
                    .flatMap(([round, list]) =>
                      list
                        .sort((a, b) => Number(a.field) - Number(b.field))
                        .map((g, i) => (
                          <tr key={g.id}>
                            <td className="dim">
                              {i === 0 ? `R${round} ${g.startTime}` : ""}
                            </td>
                            <td className="dim">F{g.field}</td>
                            <td className="right">{g.homeName}</td>
                            <td className="dim center">v</td>
                            <td>{g.awayName}</td>
                            <td className="score" />
                          </tr>
                        )),
                    )}
                </tbody>
              </table>
              <p className="tiny">
                Write your scores in the right-hand column, then report them at HQ or
                in the group chat.
              </p>
            </section>
          )}

          <section className="block facts">
            {t.gamesGuaranteed && (
              <div>
                <dt>Games guaranteed</dt>
                <dd>{t.gamesGuaranteed}</dd>
              </div>
            )}
            {t.rosterDeadline && (
              <div>
                <dt>Rosters due</dt>
                <dd>{t.rosterDeadline}</dd>
              </div>
            )}
            <div>
              <dt>Tournament page</dt>
              <dd>{publicUrl.replace(/^https?:\/\//, "")}</dd>
            </div>
          </section>
        </section>

        {/* ---------------- BACK ---------------- */}
        <section className="page">
          <h2 className="big">Site map</h2>
          {map ? (
            <div
              className="map"
              dangerouslySetInnerHTML={{ __html: map }}
            />
          ) : (
            <p className="tiny">
              No field layout has been saved yet. Build one in the TD console under
              Fields, then reprint.
            </p>
          )}

          <div className="cols">
            <section className="block">
              <h2>Rules</h2>
              <ul>
                <li>
                  Ultimate is self-officiated. Players make their own calls and
                  resolve them on the field.
                </li>
                <li>
                  Spirit of the Game is binding. Competitive play never excuses
                  dangerous or abusive conduct.
                </li>
                <li>
                  Games are to {t.gamesGuaranteed ? 15 : 15}, cap and time limits as
                  announced at the captains&apos; meeting.
                </li>
                <li>
                  Ties in pools break by the USA Ultimate nine-rule procedure:
                  head-to-head first, then point differential among the tied teams.
                </li>
                <li>
                  Three-team pools play an extra point, so an otherwise unbreakable
                  three-way tie can be resolved.
                </li>
                <li>
                  Only rostered players with a signed waiver may play. If you are not
                  on the roster, you are not insured.
                </li>
              </ul>
            </section>

            <section className="block">
              <h2>Safety</h2>
              <ul>
                <li>
                  <strong>Injury:</strong> find the athletic trainer, marked on the
                  map. Tell a scorekeeper or anyone at HQ and they will radio.
                </li>
                <li>
                  <strong>Head injury:</strong> the player comes off. No exceptions,
                  and not the captain&apos;s call.
                </li>
                <li>
                  <strong>Lightning:</strong> play stops immediately. Go to your car
                  or the marked shelter and wait for the all-clear. Do not shelter
                  under trees.
                </li>
                <li>
                  <strong>Heat:</strong> drink before you are thirsty. Water stations
                  are marked on the map.
                </li>
                <li>
                  <strong>Tents:</strong> stake or weight yours, including in light
                  wind.
                </li>
                <li>Emergency: call 911, then send someone to HQ.</li>
              </ul>
            </section>
          </div>

          {(t.directions || coords) && (
            <section className="block">
              <h2>Getting there</h2>
              {coords && (
                <p className="tiny">
                  <strong>Coordinates:</strong> {coords} — type these into any map
                  app if the address takes you to the wrong gate.
                </p>
              )}
              {t.directions && <p className="tiny pre">{t.directions}</p>}
            </section>
          )}

          {payments.length > 0 && (
            <section className="block">
              <h2>Paying your bid</h2>
              <ul>
                {payments.map((p, i) => (
                  <li key={i}>
                    <strong>{methodLabel(p.method)}</strong>
                    {p.handle ? ` — ${p.handle}` : ""}
                    {p.note ? ` (${p.note})` : ""}
                  </li>
                ))}
              </ul>
              {t.paymentNote && <p className="tiny">{t.paymentNote}</p>}
              <p className="tiny">{PAYMENT_DISCLAIMER}</p>
            </section>
          )}

          {t.refundPolicy && (
            <section className="block">
              <h2>Weather and refunds</h2>
              <p className="tiny pre">{t.refundPolicy}</p>
            </section>
          )}

          <footer className="foot">
            Live schedule, scores, and standings: {scheduleUrl.replace(/^https?:\/\//, "")}
          </footer>
        </section>
      </main>
    </>
  );
}
