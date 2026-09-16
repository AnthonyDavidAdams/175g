import Anthropic from "@anthropic-ai/sdk";
import { eq, gt, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db";
import { createMagicToken } from "../auth";
import { sendMagicLink } from "../email";
import { listTemplatesFor, parseTemplate, summarize } from "../templates";

/**
 * The intake agent: the landing page.
 *
 * Someone arrives with a half-formed idea — "we want to host something in the
 * spring" — and talks to the tournament director before they have an account.
 * The agent does what a good TD would do on a first phone call: works out the
 * shape of the event, teaches a little, records what it learns, and when there
 * is enough to start, asks for an email and sends the sign-in link. Clicking
 * it creates the program and the tournament from the draft and carries this
 * conversation into the console. Nothing has to be said twice.
 *
 * It spends money for anonymous visitors, so it is capped three ways: turns
 * per session, messages per IP per hour, and messages per day overall.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const MAX_TOOL_TURNS = 4;
const MAX_USER_TURNS = 16;

export const PUBLIC_AGENT_ENABLED =
  process.env.PUBLIC_AGENT !== "0" && !!process.env.ANTHROPIC_API_KEY;
const PER_IP_HOURLY = Number(process.env.PUBLIC_AGENT_PER_IP_HOURLY ?? 12);
const DAILY_CAP = Number(process.env.PUBLIC_AGENT_DAILY_CAP ?? 300);

const SYSTEM = `You are the tournament director's agent for 175g, a platform that helps
college and community ultimate frisbee programs run world-class tournaments. Free for
college and community events.

You are on the front page, talking to someone who has NOT signed in. They may be a
student who has never run an event, a club officer, an alum, or someone just
curious. Treat this like the first phone call a good TD takes: find out what they
are trying to do, teach a little as you go, and get them to the point where the
real work can start.

HOW YOU WORK

- Be brief. Two or three short paragraphs at most. This is a conversation, not a
  briefing. No bullet-point walls. Never use emoji.
- One question at a time. Ask for the next thing that unblocks the next thing:
  roughly when, roughly how many teams, do they have fields or not.
- Record facts the moment you learn them with record_draft. School, city, month or
  dates, division, team count, sanctioned or not, the event's working name. Do not
  wait until the end.
- Say the number. "Sixteen teams needs eight fields over two days" beats "you'll
  need a lot of fields."
- If they ask a general question about running tournaments, answer it well and
  briefly, then bring it back to their event.
- If they are an advisor or an alum wanting to help a program that already exists
  on 175g, tell them to ask that program's owner to add them as an advisor under
  Access — advisors see everything, change nothing, and leave notes. Do not try to
  create a tournament for them.
- Templates exist: list_templates shows built-in and public starting points (a
  two-day sixteen-team college weekend, a one-day eight-team community event…).
  When their event matches one, say so and call choose_template, and explain that
  the plan, deadlines and waivers will be in place when they open the console.

WHEN TO ASK FOR EMAIL

Once you know roughly what they want to run — a working name or a school plus a
rough time and size is enough — say that the next step is to open their console,
where you will set up the plan, and ask for their email. When they give it, call
request_signin. Then tell them to check their inbox: the link works once, expires in
15 minutes, and opens the console with this conversation carried across. Do not
ask for a password; there are none.

Do not ask for email in the first message unless they ask how to start. Do not
claim to have created anything — nothing exists until they click the link.

WHAT YOU KNOW (briefly, offer when relevant)

- Two hard gates: never announce without a signed field agreement; never take team
  money without a published refund policy.
- Sanctioning is a choice. Sanctioned gives insurance, a calendar listing and
  rankings-eligible results, and costs money, a certified TD and membership for
  every player. Unsanctioned is lighter and free but the venue may still want proof
  of insurance. Plenty of great tournaments run either way.
- Sixteen teams: eight fields, two days, six or seven games each. Eight teams: four
  fields, one long day works. No team should play more than nine games in two days.
- The person who controls campus fields is usually the facilities coordinator at
  campus recreation, not the club sports office. Parks departments have a permit
  specialist. Ask by title.
- A first-time TD should start a year out; six months is possible; eight weeks is
  an emergency but doable with a small unsanctioned event.

PRIVACY

Never ask for anything beyond an email. Never promise to contact anyone.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "record_draft",
    description:
      "Record what you have learned about the event they want to run. Call it as " +
      "soon as you learn anything; each call merges with what is already recorded.",
    input_schema: {
      type: "object",
      properties: {
        tournamentName: { type: "string", description: "Working name for the event" },
        orgName: {
          type: "string",
          description: "The program or club running it, e.g. 'KU Ultimate' or 'Denver Beach Series'",
        },
        school: { type: "string" },
        city: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD if known" },
        endDate: { type: "string", description: "YYYY-MM-DD if known" },
        roughTiming: { type: "string", description: "e.g. 'late February 2027' when exact dates aren't known" },
        division: { type: "string", description: "mens | womens | mixed | multiple" },
        teamTarget: { type: "number" },
        sanctioned: { type: "boolean" },
        hasFields: { type: "boolean" },
        experience: { type: "string", description: "first time | ran it before | inherited it" },
        notes: { type: "string", description: "Anything else worth carrying into the console" },
      },
    },
  },
  {
    name: "list_templates",
    description: "List the built-in and public event templates they could start from.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "choose_template",
    description:
      "Start their tournament from this template when they open the console. " +
      "Use after they agree it fits.",
    input_schema: {
      type: "object",
      properties: { templateId: { type: "string" } },
      required: ["templateId"],
    },
  },
  {
    name: "request_signin",
    description:
      "Send the sign-in link to this email. Opens the TD console with this " +
      "conversation and the recorded draft. Call only when they have given an email.",
    input_schema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
  },
];

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export type IntakeMessage = { role: "user" | "assistant"; content: string };
export type IntakeDraft = {
  tournamentName?: string;
  orgName?: string;
  school?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  roughTiming?: string;
  division?: string;
  teamTarget?: number;
  sanctioned?: boolean;
  hasFields?: boolean;
  experience?: string;
  notes?: string;
};

export type IntakeTurn = {
  text: string;
  signinRequested?: boolean;
  email?: string | null;
  limited?: boolean;
};

export function getIntake(id: string) {
  return db.select().from(schema.intakeSessions).where(eq(schema.intakeSessions.id, id)).get();
}

export function createIntake(ip: string | null) {
  const id = nanoid(21);
  db.insert(schema.intakeSessions).values({ id, ip }).run();
  return getIntake(id)!;
}

export function parseIntake(row: typeof schema.intakeSessions.$inferSelect) {
  return {
    messages: JSON.parse(row.messages) as IntakeMessage[],
    draft: JSON.parse(row.draft) as IntakeDraft,
  };
}

/* ---------------------------------------------------------------------------
 * Rate limits. In-memory is fine: one instance, and a restart resetting the
 * counters is the acceptable failure.
 * ------------------------------------------------------------------------- */

const ipHits = new Map<string, number[]>();
let dayKey = "";
let dayCount = 0;

export function checkLimits(ip: string | null): { ok: true } | { ok: false; reason: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (dayKey !== today) {
    dayKey = today;
    dayCount = 0;
  }
  if (dayCount >= DAILY_CAP) {
    return {
      ok: false,
      reason:
        "The front-page agent has hit today's limit. Sign in and it will pick up in your console, or come back tomorrow.",
    };
  }
  const key = ip ?? "unknown";
  const now = Date.now();
  const recent = (ipHits.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= PER_IP_HOURLY) {
    return {
      ok: false,
      reason:
        "That's a lot of questions for one hour. Sign in — the console has no such limit — or come back in a bit.",
    };
  }
  recent.push(now);
  ipHits.set(key, recent);
  dayCount++;
  return { ok: true };
}

/* ---------------------------------------------------------------------------
 * One turn
 * ------------------------------------------------------------------------- */

export async function runIntake(
  sessionId: string,
  userMessage: string,
  ip: string | null,
): Promise<IntakeTurn> {
  const row = getIntake(sessionId);
  if (!row) throw new Error("No such session.");
  const { messages, draft } = parseIntake(row);

  if (row.userTurns >= MAX_USER_TURNS) {
    return {
      text:
        "We've covered a lot. The next step is your console — give me an email and I'll send the link, and we'll pick this up there with everything you've told me.",
      limited: true,
    };
  }

  messages.push({ role: "user", content: userMessage });

  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let finalText = "";
  let signinRequested = false;
  let email: string | null = row.email;
  let templateId = row.templateId;
  const draftNow: IntakeDraft = { ...draft };

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 1200,
      system:
        SYSTEM +
        (Object.keys(draftNow).length
          ? `\n\nRECORDED SO FAR:\n${JSON.stringify(draftNow, null, 2)}`
          : "") +
        (templateId ? `\n\nTEMPLATE CHOSEN: ${templateId}` : ""),
      tools: TOOLS,
      messages: convo,
    });

    const textParts = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text);
    if (textParts.length) finalText = textParts.join("\n\n");

    const uses = response.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
    );
    if (!uses.length) break;

    convo.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of uses) {
      const input = use.input as Record<string, unknown>;
      let result = "";
      try {
        switch (use.name) {
          case "record_draft": {
            for (const [k, v] of Object.entries(input)) {
              if (v !== undefined && v !== null && v !== "") {
                (draftNow as Record<string, unknown>)[k] = v;
              }
            }
            result = `Recorded: ${Object.keys(input).join(", ")}.`;
            break;
          }
          case "list_templates": {
            const rows = listTemplatesFor(null);
            result = rows.length
              ? rows
                  .map((r) => {
                    const s = summarize(parseTemplate(r));
                    return `- ${r.id}: ${r.name} — ${s.durationDays}-day, ${s.teamTarget ?? "?"} teams, ${s.fieldCount ?? "?"} fields, ${s.tasks} tasks${r.description ? `. ${r.description}` : ""}`;
                  })
                  .join("\n")
              : "No templates available.";
            break;
          }
          case "choose_template": {
            const id = String(input.templateId ?? "");
            const tpl = db
              .select()
              .from(schema.templates)
              .where(eq(schema.templates.id, id))
              .get();
            if (!tpl || (tpl.orgId !== null && tpl.visibility !== "public")) {
              result = "That template isn't available here.";
            } else {
              templateId = tpl.id;
              result = `Template "${tpl.name}" will be applied when they open the console.`;
            }
            break;
          }
          case "request_signin": {
            const addr = String(input.email ?? "").trim().toLowerCase();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
              result = "That doesn't look like an email address. Ask again.";
              break;
            }
            const token = createMagicToken(addr, `/start?intake=${sessionId}`);
            await sendMagicLink(addr, token, `/start?intake=${sessionId}`);
            email = addr;
            signinRequested = true;
            result = `Sign-in link sent to ${addr}. It opens their console with this conversation.`;
            break;
          }
          default:
            result = `Unknown tool ${use.name}`;
        }
      } catch (err) {
        result = `Tool failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      results.push({ type: "tool_result", tool_use_id: use.id, content: result });
    }
    convo.push({ role: "user", content: results });
  }

  if (!finalText) finalText = "(no response)";
  messages.push({ role: "assistant", content: finalText });

  db.update(schema.intakeSessions)
    .set({
      messages: JSON.stringify(messages.slice(-60)),
      draft: JSON.stringify(draftNow),
      email,
      templateId,
      userTurns: row.userTurns + 1,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(schema.intakeSessions.id, sessionId))
    .run();

  return { text: finalText, signinRequested, email };
}

/** Housekeeping: drop unclaimed sessions older than 30 days. Cheap; call on read. */
export function sweepIntake() {
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
  db.delete(schema.intakeSessions)
    .where(
      and(
        sql`${schema.intakeSessions.claimedTournamentId} IS NULL`,
        gt(sql`${cutoff}`, schema.intakeSessions.createdAt),
      ),
    )
    .run();
}
