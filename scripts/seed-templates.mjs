#!/usr/bin/env node
/**
 * Built-in event templates. Idempotent: each has a fixed id and is inserted
 * only if absent, so a program's edits to its own templates are never touched
 * and a redeploy never duplicates these.
 *
 * The plan rows mirror src/lib/timeline.ts (weeks before → days before), so a
 * TD starting from a template gets the same countdown the agent would build.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.DATABASE_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/data/175g.db"
    : path.join(process.cwd(), "data", "175g.db"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// [weeksBefore, phase, task, owner, hard]
const PLAN = [
  [52, "Foundation", "Decide to host; name the TD and confirm they are not playing", "TD", false],
  [48, "Foundation", "Identify target weekend(s): season window, competing tournaments, academic calendar, campus events, weather history", "TD", false],
  [46, "Foundation", "Identify field stakeholders by name: campus rec facilities coordinator, club sports, parks permit specialist, local ultimate org", "TD", false],
  [44, "Foundation", "First contact with field providers; request availability and pricing", "TD", false],
  [40, "Foundation", "Site visit: field count, water sources, toilets, parking, power", "TD", false],
  [34, "Foundation", "Apply for institutional funding — student government deadlines are often a semester ahead", "Sponsorship", true],
  [32, "Foundation", "Negotiate field agreement: price, setup time, lining, cancellation, insurance requirements", "TD", false],
  [30, "Foundation", "SIGN THE FIELD AGREEMENT — nothing is announced before this", "TD", true],
  [28, "Money", "Build the budget; model break-even at several team counts", "TD", false],
  [28, "Money", "Set the bid fee and write the refund and weather-cancellation policy", "TD", false],
  [26, "Sponsors", "Approach ultimate-industry brands — they have formal programs and slow cycles", "Sponsorship", false],
  [24, "Compliance", "Confirm insurance: sanctioning cover, or a certificate of insurance the venue will accept", "TD", true],
  [22, "Teams", "Build target list: 3–4x the teams you need. Returning teams and last year's waitlist first.", "Registration", false],
  [20, "Teams", "Invite returning teams and prior waitlist before the public announcement", "Registration", false],
  [18, "Teams", "Publish the bid announcement everywhere captains are", "Registration", false],
  [18, "Staff", "Assign lead roles: volunteers, registration, scheduling, medical, food and water, social, media, sponsorship", "TD", false],
  [16, "Ops", "Book the athletic trainer", "Medical", true],
  [16, "Sponsors", "Local sponsor push: food and drink, product donations, services, alumni", "Sponsorship", false],
  [14, "Swag", "Finalise swag design; set the hard sponsor-logo cutoff", "Media", true],
  [12, "Teams", "Application deadline", "Registration", false],
  [11, "Teams", "Send acceptances, waitlist notices, and declines — tell everyone", "Registration", false],
  [10, "Swag", "Order jerseys (4–8 week lead time)", "Media", true],
  [9, "Money", "Bid payment deadline", "Registration", false],
  [8, "Swag", "Order custom-stamped discs (3–5 week lead time)", "Media", true],
  [8, "Teams", "Work the waitlist to fill unpaid spots", "Registration", false],
  [7, "Format", "Lock the field; seed the teams; generate format and schedule", "Scheduling", false],
  [7, "Format", "Pre-generate N-1 and N-2 formats and the weather-degraded schedules", "Scheduling", false],
  [6, "Ops", "Order porta-johns, rentals, tents, radios", "TD", true],
  [6, "Swag", "Order trophies, medals, and spirit prizes", "Media", true],
  [6, "Compliance", "Deliver the COI to the facility (many require 30+ days)", "TD", true],
  [6, "Sponsors", "Sponsor logo cutoff for anything printed", "Sponsorship", true],
  [5, "Swag", "Order shirts (2–3 week lead time)", "Media", false],
  [5, "Compliance", "Write the Event Medical Plan and Inclement Weather Plan", "Medical", false],
  [5, "Compliance", "Publish the participant waiver and start collecting signatures", "Registration", true],
  [4, "Staff", "Recruit volunteers — 25% more than the shift grid needs", "Volunteers", false],
  [4, "Ops", "Confirm food, water source, and ice orders", "Food/Water", false],
  [3, "Swag", "Order stickers and field banners", "Media", false],
  [3, "Ops", "Publish the schedule, site map, and parking instructions", "Scheduling", false],
  [3, "Comms", "Open the Telegram group and get every captain in it", "Registration", false],
  [2, "Staff", "Confirm every volunteer shift individually — a group message is not a confirmation", "Volunteers", false],
  [2, "Ops", "Confirm all vendor delivery windows in writing", "TD", false],
  [2, "Sponsors", "Last window for day-of product donations (water, ice, fruit)", "Sponsorship", false],
  [1, "Ops", "Field lining (finish a full day before play)", "Volunteers", true],
  [1, "Comms", "Send the week-of email: schedule, parking, check-in, roster deadline, forecast, trainer, social", "Registration", false],
  [1, "Ops", "Assemble player packs", "Volunteers", false],
  [0, "Gameday", "Field setup complete one hour before first pull; HQ, water, trainer, scoreboard live", "TD", true],
  [-1, "Debrief", "Send the player survey while it's fresh", "TD", false],
  [-2, "Debrief", "Staff debrief: what broke, what to change, who to thank", "TD", false],
  [-3, "Memory", "Write the archive for next year's TD: contacts, vendors, budget actuals, what broke", "TD", false],
];

const SANCTIONED_EXTRA = [
  [36, "Compliance", "Start TD certification and SafeSport training", "TD", true],
  [24, "Compliance", "Submit sanctioning application (6+ weeks out is the cheaper fee tier)", "TD", true],
  [24, "Compliance", "Request certificate of insurance with the facility's exact legal entity name and limits", "TD", true],
  [1, "Compliance", "Roster deadline — 5:00pm Wednesday before, for sanctioned college events", "Registration", true],
];

const tasks = (rows) =>
  rows.map(([w, phase, task, owner, hard]) => ({
    daysBefore: w * 7,
    durationDays: null,
    phase,
    task,
    owner,
    hard,
    notes: null,
  }));

const REFUND =
  "Full refund up to the acceptance date. Fifty percent from acceptance until the payment deadline. No refund after the payment deadline.\n" +
  "If the whole event is cancelled for weather before play begins, teams receive a refund less committed costs. If one day is lost to weather, there is no refund — most costs are spent by then.";

const WAIVER_PARTICIPANT = {
  title: "Participant waiver and release",
  audience: "participant",
  required: true,
  body:
    "I understand that ultimate is a physical sport that carries a risk of injury, and that I take part in {{tournament_name}} voluntarily and at my own risk.\n\n" +
    "In consideration of being allowed to participate, I release {{organizer}}, its officers, volunteers, sponsors and the owners of the venue from any claim arising from my participation, except where caused by their gross negligence or wilful misconduct.\n\n" +
    "I confirm that I am medically fit to play, that I will follow the rules of the event and the instructions of its organisers, and that I consent to emergency medical treatment if I am unable to consent at the time.\n\n" +
    "I understand this is a template starting point provided without legal advice, and that the organiser is responsible for its suitability.",
};

const WAIVER_VOLUNTEER = {
  title: "Volunteer agreement",
  audience: "volunteer",
  required: true,
  body:
    "I am volunteering at {{tournament_name}} of my own free will and understand I will not be paid.\n\n" +
    "I will follow the instructions of the tournament director and the safety guidance I am given, and I release {{organizer}} and the venue from claims arising from my volunteering except where caused by their gross negligence.\n\n" +
    "I understand this is a template starting point provided without legal advice.",
};

function template({ id, name, description, event, offsets, waivers, plan, sponsors }) {
  return {
    id,
    name,
    description,
    doc: {
      templateVersion: 1,
      event,
      offsets,
      venue: null,
      waivers,
      tasks: tasks(plan),
      sponsors,
    },
  };
}

const BUILTINS = [
  template({
    id: "builtin-college-2day-16",
    name: "Two-day college weekend, 16 teams",
    description:
      "The standard college tournament: sixteen teams, eight fields, pool play Saturday into a bracket Sunday, six games guaranteed. Sanctioned, with the certification and roster steps that stranded TDs actually get stranded on. Refund policy has weather written into it.",
    event: {
      durationDays: 2,
      description:
        "A two-day tournament on eight grass fields. Six games guaranteed, certified athletic trainer on site both days.",
      refundPolicy: REFUND,
      fieldCount: 8,
      surface: "grass",
      division: "mixed",
      divisionMode: "alternate",
      teamTarget: 16,
      bidFeeUSD: 350,
      gamesGuaranteed: 6,
      sanctioned: true,
      paymentNote: null,
    },
    offsets: { applyDeadline: 84, acceptance: 77, paymentDeadline: 63, rosterDeadline: 4 },
    waivers: [WAIVER_PARTICIPANT, WAIVER_VOLUNTEER],
    plan: [...PLAN, ...SANCTIONED_EXTRA],
    sponsors: [
      { org: "Local sports-medicine clinic", type: "inkind", tier: "trainer", inkindDescription: "Athletic trainer coverage", notes: "Ask for the trainer as the sponsorship; it's their marketing budget, not yours." },
      { org: "Campus bookstore or spirit shop", type: "cash", tier: null, inkindDescription: null, notes: null },
      { org: "Local pizza or burrito chain", type: "inkind", tier: "food", inkindDescription: "Saturday night social food", notes: null },
      { org: "Regional disc or apparel brand", type: "both", tier: "title", inkindDescription: "Discs and prizes", notes: "Formal programs, slow cycles — ask 6 months out." },
      { org: "Alumni of the program", type: "cash", tier: null, inkindDescription: null, notes: "A named alumni fund line on the budget converts better than a general ask." },
    ],
  }),
  template({
    id: "builtin-community-1day-8",
    name: "One-day community or alumni tournament, 8 teams",
    description:
      "Unsanctioned and light: one day, eight teams, four fields, round robin into a short bracket. No membership requirement, no sanctioning fees, your own rules. Still has a waiver, a weather plan and a refund policy, because someone can get hurt at any event.",
    event: {
      durationDays: 1,
      description: "A one-day, eight-team community tournament on four fields. Round robin into semis and a final.",
      refundPolicy:
        "Full refund up to two weeks before. No refund inside two weeks, except that if the whole event is cancelled for weather before play begins, teams receive a refund less committed costs.",
      fieldCount: 4,
      surface: "grass",
      division: "mixed",
      divisionMode: "alternate",
      teamTarget: 8,
      bidFeeUSD: 150,
      gamesGuaranteed: 4,
      sanctioned: false,
      paymentNote: null,
    },
    offsets: { applyDeadline: 28, acceptance: 24, paymentDeadline: 14, rosterDeadline: null },
    waivers: [WAIVER_PARTICIPANT, WAIVER_VOLUNTEER],
    plan: PLAN.filter(([w]) => w <= 20).map(([w, ...rest]) => [w, ...rest]),
    sponsors: [
      { org: "Local brewery or coffee roaster", type: "inkind", tier: "social", inkindDescription: "Post-tournament social", notes: null },
      { org: "Local physio or chiropractor", type: "inkind", tier: "trainer", inkindDescription: "On-site first aid", notes: null },
    ],
  }),
];

const now = Math.floor(Date.now() / 1000);
const has = db.prepare("SELECT 1 FROM templates WHERE id = ?");
const insert = db.prepare(
  `INSERT INTO templates (id, org_id, created_by, source_tournament_id, name, description, doc, visibility, share_token, use_count, created_at)
   VALUES (?, NULL, NULL, NULL, ?, ?, ?, 'public', ?, 0, ?)`,
);
let added = 0;
for (const t of BUILTINS) {
  if (has.get(t.id)) continue;
  insert.run(t.id, t.name, t.description, JSON.stringify(t.doc), `builtin-${t.id}`, now);
  added++;
}
console.log(`[templates] ${added} built-in template(s) added, ${BUILTINS.length - added} already present`);
