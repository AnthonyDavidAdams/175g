import { and, eq, like, or } from "drizzle-orm";
import { advanceTournament } from "./advance";
import { db, schema } from "./db";

/**
 * Telegram integration: one group per tournament. Captains report scores from
 * the field in seconds, and the TD broadcasts weather holds and round starts to
 * the one place everyone already is.
 *
 * Commands:
 *   /link <tournament-slug>   bind this group to a tournament (once, by the TD)
 *   /score Pitt 15 - 12 CMU   report a final score
 *   /next <team>              that team's next game
 *   /schedule                 the current round
 *   /standings                live pool standings
 */

const API = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function sendTelegram(chatId: string, text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log(`[telegram:dev] ${chatId}: ${text}`);
    return;
  }
  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

function tournamentForChat(chatId: string) {
  return db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.telegramChatId, chatId))
    .get();
}

function teamByFuzzyName(tournamentId: string, needle: string) {
  const teams = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, tournamentId))
    .all();
  const n = needle.trim().toLowerCase();
  return (
    teams.find((t) => t.name.toLowerCase() === n) ??
    teams.find((t) => t.name.toLowerCase().startsWith(n)) ??
    teams.find((t) => t.name.toLowerCase().includes(n)) ??
    null
  );
}

/**
 * Parse "/score Pitt 15 - 12 CMU" and the shapes people actually type:
 * "Pitt 15-12 CMU", "Pitt 15 12 CMU".
 */
function parseScore(text: string) {
  const body = text.replace(/^\/score(@\S+)?\s*/i, "").trim();
  const m = body.match(/^(.+?)\s+(\d{1,2})\s*[-–:to]*\s*(\d{1,2})\s+(.+?)$/i);
  if (!m) return null;
  return {
    home: m[1].trim(),
    homeScore: Number(m[2]),
    awayScore: Number(m[3]),
    away: m[4].trim(),
  };
}

export async function handleUpdate(update: any) {
  const message = update.message ?? update.channel_post;
  if (!message?.text) return;

  const chatId = String(message.chat.id);
  const text: string = message.text.trim();
  const from = message.from?.username ?? message.from?.first_name ?? "unknown";

  if (/^\/start|^\/help/i.test(text)) {
    return sendTelegram(
      chatId,
      [
        "<b>175g tournament bot</b>",
        "",
        "/link &lt;slug&gt; — bind this group to a tournament",
        "/score Pitt 15 - 12 CMU — report a final score",
        "/next Pitt — that team's next game",
        "/schedule — the current round",
        "/standings — live pool standings",
      ].join("\n"),
    );
  }

  if (/^\/link/i.test(text)) {
    const slug = text.replace(/^\/link(@\S+)?\s*/i, "").trim();
    if (!slug) return sendTelegram(chatId, "Usage: /link <tournament-slug>");
    const t = db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.slug, slug))
      .get();
    if (!t) return sendTelegram(chatId, `No tournament with slug "${slug}".`);
    db.update(schema.tournaments)
      .set({ telegramChatId: chatId })
      .where(eq(schema.tournaments.id, t.id))
      .run();
    return sendTelegram(chatId, `Linked to <b>${t.name}</b>. Score reporting is live.`);
  }

  const t = tournamentForChat(chatId);
  if (!t) {
    if (text.startsWith("/")) {
      return sendTelegram(
        chatId,
        "This group isn't linked to a tournament yet. Run /link <slug>.",
      );
    }
    return;
  }

  if (/^\/score/i.test(text)) {
    const parsed = parseScore(text);
    if (!parsed) {
      return sendTelegram(
        chatId,
        'Could not read that. Try: <code>/score Pitt 15 - 12 CMU</code>',
      );
    }
    const home = teamByFuzzyName(t.id, parsed.home);
    const away = teamByFuzzyName(t.id, parsed.away);
    if (!home || !away) {
      const missing = !home ? parsed.home : parsed.away;
      return sendTelegram(chatId, `I don't know a team called "${missing}".`);
    }

    const game = db
      .select()
      .from(schema.games)
      .where(
        and(
          eq(schema.games.tournamentId, t.id),
          or(
            and(
              eq(schema.games.homeTeamId, home.id),
              eq(schema.games.awayTeamId, away.id),
            ),
            and(
              eq(schema.games.homeTeamId, away.id),
              eq(schema.games.awayTeamId, home.id),
            ),
          ),
        ),
      )
      .all()
      .find((g) => g.status !== "final");

    if (!game) {
      return sendTelegram(
        chatId,
        `No unplayed game between ${home.name} and ${away.name}.`,
      );
    }

    // Orient the reported score to the scheduled home/away.
    const flip = game.homeTeamId === away.id;
    db.update(schema.games)
      .set({
        homeScore: flip ? parsed.awayScore : parsed.homeScore,
        awayScore: flip ? parsed.homeScore : parsed.awayScore,
        status: "final",
        reportedBy: from,
        reportedVia: "telegram",
        reportedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(schema.games.id, game.id))
      .run();

    advanceTournament(t.id);

    return sendTelegram(
      chatId,
      `Recorded: <b>${parsed.home} ${parsed.homeScore} – ${parsed.awayScore} ${parsed.away}</b> ` +
        `(${game.stage}${game.pool ? ` ${game.pool}` : ""}, R${game.round}). Thanks ${from}.`,
    );
  }

  if (/^\/next/i.test(text)) {
    const needle = text.replace(/^\/next(@\S+)?\s*/i, "").trim();
    const team = teamByFuzzyName(t.id, needle);
    if (!team) return sendTelegram(chatId, `I don't know a team called "${needle}".`);

    const teams = new Map(
      db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.tournamentId, t.id))
        .all()
        .map((x) => [x.id, x.name]),
    );

    const next = db
      .select()
      .from(schema.games)
      .where(eq(schema.games.tournamentId, t.id))
      .all()
      .filter(
        (g) =>
          g.status !== "final" &&
          (g.homeTeamId === team.id || g.awayTeamId === team.id),
      )
      .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))[0];

    if (!next) return sendTelegram(chatId, `${team.name} has no upcoming games.`);
    const opp =
      next.homeTeamId === team.id
        ? teams.get(next.awayTeamId ?? "") ?? next.awayLabel
        : teams.get(next.homeTeamId ?? "") ?? next.homeLabel;
    return sendTelegram(
      chatId,
      `<b>${team.name}</b> next: R${next.round} at ${next.startTime} on Field ` +
        `${next.field} vs ${opp}`,
    );
  }

  if (/^\/schedule/i.test(text)) {
    const teams = new Map(
      db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.tournamentId, t.id))
        .all()
        .map((x) => [x.id, x.name]),
    );
    const games = db
      .select()
      .from(schema.games)
      .where(eq(schema.games.tournamentId, t.id))
      .all();
    const pending = games.filter((g) => g.status !== "final");
    if (!pending.length) return sendTelegram(chatId, "All games are final.");
    const round = Math.min(...pending.map((g) => g.round ?? 99));
    const lines = pending
      .filter((g) => g.round === round)
      .sort((a, b) => Number(a.field) - Number(b.field))
      .map(
        (g) =>
          `F${g.field} ${g.startTime}  ${teams.get(g.homeTeamId ?? "") ?? g.homeLabel}` +
          ` v ${teams.get(g.awayTeamId ?? "") ?? g.awayLabel}`,
      );
    return sendTelegram(chatId, `<b>Round ${round}</b>\n<code>${lines.join("\n")}</code>`);
  }

  if (/^\/standings/i.test(text)) {
    const { standingsByPool } = await import("./standings");
    const teams = new Map(
      db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.tournamentId, t.id))
        .all()
        .map((x) => [x.id, x.name]),
    );
    const games = db
      .select()
      .from(schema.games)
      .where(eq(schema.games.tournamentId, t.id))
      .all()
      .filter((g) => g.status === "final" && g.stage === "pool")
      .map((g) => ({
        pool: g.pool,
        homeTeam: teams.get(g.homeTeamId ?? "") ?? "?",
        awayTeam: teams.get(g.awayTeamId ?? "") ?? "?",
        homeScore: g.homeScore ?? 0,
        awayScore: g.awayScore ?? 0,
        status: g.status,
      }));

    if (!games.length) return sendTelegram(chatId, "No final pool games yet.");
    const out = standingsByPool(games)
      .map(
        ({ pool, ordered }) =>
          `<b>Pool ${pool}</b>\n` +
          ordered
            .map(
              (r, i) =>
                `${i + 1}. ${r.team} ${r.w}-${r.l} (${r.diff >= 0 ? "+" : ""}${r.diff})`,
            )
            .join("\n"),
      )
      .join("\n\n");
    return sendTelegram(chatId, out);
  }
}

/** Broadcast a TD announcement to the tournament's group. */
export async function broadcast(tournamentId: string, body: string, level = "info") {
  const t = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId))
    .get();
  if (!t?.telegramChatId) return { sent: false, reason: "no linked group" };
  const prefix =
    level === "urgent" ? "URGENT — " : level === "warning" ? "Heads up — " : "";
  await sendTelegram(t.telegramChatId, `${prefix}${body}`);
  return { sent: true };
}
