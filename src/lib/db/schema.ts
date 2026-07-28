import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

/* ---------------------------------------------------------------------------
 * Tenancy
 *
 * An `org` is the durable thing (a college program, a club, a league). A
 * `tournament` is one edition. Institutional memory lives on the org, which is
 * what lets year two start from year one rather than from nothing.
 * ------------------------------------------------------------------------- */

export const orgs = sqliteTable("orgs", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  school: text("school"),
  city: text("city"),
  createdAt: integer("created_at").notNull().default(now),
});

export const tournaments = sqliteTable(
  "tournaments",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => orgs.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    year: integer("year"),

    startDate: text("start_date"), // YYYY-MM-DD
    endDate: text("end_date"),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    city: text("city"),
    fieldCount: integer("field_count"),
    surface: text("surface"),

    division: text("division"), // mens | womens | mixed | multiple
    teamTarget: integer("team_target"),
    bidFee: integer("bid_fee"), // cents
    gamesGuaranteed: integer("games_guaranteed"),

    sanctioned: integer("sanctioned", { mode: "boolean" }).default(false),
    sanctionNumber: text("sanction_number"),

    applyDeadline: text("apply_deadline"),
    acceptanceDate: text("acceptance_date"),
    paymentDeadline: text("payment_deadline"),
    rosterDeadline: text("roster_deadline"),

    refundPolicy: text("refund_policy"),
    description: text("description"),

    /** Precise venue coordinates — what people actually navigate to. */
    venueLat: text("venue_lat"),
    venueLng: text("venue_lng"),
    /**
     * Getting-there notes. Auto-generated from the venue and the site map, then
     * freely editable — the local knowledge that saves twenty phone calls.
     */
    directions: text("directions"),

    /**
     * How teams pay, as JSON:
     *   [{ "method": "venmo", "handle": "@kc-ultimate", "note": "..." }]
     * No money moves through 175g. These are instructions, so a TD can take
     * payment however they already do.
     */
    paymentOptions: text("payment_options"),
    paymentNote: text("payment_note"),

    // Public site
    published: integer("published", { mode: "boolean" }).default(false),
    scheduleLocked: integer("schedule_locked", { mode: "boolean" }).default(false),
    ogImage: text("og_image"),

    telegramChatId: text("telegram_chat_id"),
    telegramInviteUrl: text("telegram_invite_url"),

    /**
     * How divisions share the fields when an event runs more than one:
     *   "alternate" — divisions take turns, each using every field for a round
     *   "split"     — divisions play concurrently on dedicated fields
     */
    divisionMode: text("division_mode").default("alternate"),

    // Free-form state the TD agent maintains; the conversational equivalent of
    // brief.md in the plugin.
    brief: text("brief"),

    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [unique("tournament_slug_per_org").on(t.orgId, t.slug)],
);

/* ---------------------------------------------------------------------------
 * People
 *
 * `people` is the cross-tournament directory -- the asset that makes filling
 * next year's field easy. Role tags live on the membership, not the person, so
 * someone can be a captain one year and an organizer the next.
 * ------------------------------------------------------------------------- */

export const people = sqliteTable(
  "people",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name"),
    phone: text("phone"),
    school: text("school"),
    gradYear: integer("grad_year"),

    // Consent is explicit, specific, and revocable. Never set this from an
    // import; it comes from the person.
    marketingConsent: integer("marketing_consent", { mode: "boolean" }).default(false),
    consentAt: integer("consent_at"),
    consentSource: text("consent_source"),
    unsubscribedAt: integer("unsubscribed_at"),

    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("people_email_idx").on(t.email)],
);

export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    name: text("name").notNull(),
    school: text("school"),
    division: text("division"),

    captainName: text("captain_name"),
    captainEmail: text("captain_email"),
    captainPhone: text("captain_phone"),

    // applied | accepted | waitlisted | declined | withdrawn
    status: text("status").notNull().default("applied"),
    seed: integer("seed"),
    pool: text("pool"),

    feePaid: integer("fee_paid", { mode: "boolean" }).default(false),
    amountPaid: integer("amount_paid"), // cents
    paidAt: integer("paid_at"),

    rosterSubmitted: integer("roster_submitted", { mode: "boolean" }).default(false),
    notes: text("notes"),

    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("teams_tournament_idx").on(t.tournamentId)],
);

/** A person's participation in one tournament, with role tags. */
export const rosterEntries = sqliteTable(
  "roster_entries",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    teamId: text("team_id").references(() => teams.id),
    personId: text("person_id").notNull().references(() => people.id),

    // Semicolon-separated: player;captain;coach;organizer;volunteer
    roles: text("roles").notNull().default("player"),
    jerseyNumber: text("jersey_number"),
    shirtSize: text("shirt_size"),

    usauMember: integer("usau_member", { mode: "boolean" }).default(false),
    waiverSigned: integer("waiver_signed", { mode: "boolean" }).default(false),
    waiverSignedAt: integer("waiver_signed_at"),

    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("roster_tournament_idx").on(t.tournamentId),
    unique("roster_person_per_tournament").on(t.tournamentId, t.personId),
  ],
);

/* ---------------------------------------------------------------------------
 * Competition
 * ------------------------------------------------------------------------- */

export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    gameCode: text("game_code"), // G1, G2 ... stable across regenerations

    day: integer("day"),
    round: integer("round"),
    startTime: text("start_time"), // HH:MM
    field: text("field"),

    stage: text("stage").notNull().default("pool"), // pool | bracket | placement
    pool: text("pool"),
    /** Which division this game belongs to, when an event runs more than one. */
    division: text("division"),
    /** Which venue this game is at, when the event spans more than one. */
    siteId: text("site_id").references(() => sites.id),

    homeTeamId: text("home_team_id").references(() => teams.id),
    awayTeamId: text("away_team_id").references(() => teams.id),
    homeLabel: text("home_label"), // "Winner G12" before teams are known
    awayLabel: text("away_label"),

    homeScore: integer("home_score"),
    awayScore: integer("away_score"),

    // scheduled | in_progress | final | forfeit
    status: text("status").notNull().default("scheduled"),
    reportedBy: text("reported_by"),
    reportedVia: text("reported_via"), // web | telegram | admin
    reportedAt: integer("reported_at"),

    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("games_tournament_idx").on(t.tournamentId),
    index("games_round_idx").on(t.tournamentId, t.round),
  ],
);

/* ---------------------------------------------------------------------------
 * Operations
 * ------------------------------------------------------------------------- */

export const shifts = sqliteTable(
  "shifts",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    day: text("day"),
    role: text("role").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    slot: integer("slot"),

    personId: text("person_id").references(() => people.id),
    assignedName: text("assigned_name"),
    assignedPhone: text("assigned_phone"),
    confirmed: integer("confirmed", { mode: "boolean" }).default(false),

    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("shifts_tournament_idx").on(t.tournamentId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    phase: text("phase"),
    task: text("task").notNull(),
    owner: text("owner"),
    dueDate: text("due_date"),
    hardDeadline: integer("hard_deadline", { mode: "boolean" }).default(false),
    done: integer("done", { mode: "boolean" }).default(false),
    doneAt: integer("done_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("tasks_tournament_idx").on(t.tournamentId)],
);

export const sponsors = sqliteTable(
  "sponsors",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    org: text("org").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    type: text("type").default("cash"), // cash | inkind | both
    // prospect | contacted | in_conversation | committed | paid | declined
    stage: text("stage").notNull().default("prospect"),
    amount: integer("amount"), // cents
    inkindDescription: text("inkind_description"),
    tier: text("tier"),
    logoUrl: text("logo_url"),
    fulfilled: integer("fulfilled", { mode: "boolean" }).default(false),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("sponsors_tournament_idx").on(t.tournamentId)],
);

/** Outreach is always drafted and queued. Nothing sends without approval. */
export const outreach = sqliteTable(
  "outreach",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    kind: text("kind").notNull(), // team | sponsor | facility | volunteer | debrief
    toName: text("to_name"),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // draft | approved | sent | failed | discarded
    status: text("status").notNull().default("draft"),
    approvedAt: integer("approved_at"),
    sentAt: integer("sent_at"),
    error: text("error"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("outreach_tournament_idx").on(t.tournamentId)],
);

export const announcements = sqliteTable(
  "announcements",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    body: text("body").notNull(),
    level: text("level").notNull().default("info"), // info | warning | urgent
    broadcastTelegram: integer("broadcast_telegram", { mode: "boolean" }).default(false),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("announcements_tournament_idx").on(t.tournamentId)],
);

/* ---------------------------------------------------------------------------
 * Waivers
 *
 * The signed text is snapshotted onto each signature. If the TD edits the
 * waiver later, previously collected signatures still prove what that person
 * actually agreed to — which is the entire point of collecting them.
 * ------------------------------------------------------------------------- */

export const waivers = sqliteTable(
  "waivers",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** participant | team | minor | volunteer */
    audience: text("audience").notNull().default("participant"),
    version: integer("version").notNull().default(1),
    required: integer("required", { mode: "boolean" }).default(true),
    /** Source template this was generated from, for provenance. */
    templateKey: text("template_key"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at"),
  },
  (t) => [index("waivers_tournament_idx").on(t.tournamentId)],
);

export const waiverSignatures = sqliteTable(
  "waiver_signatures",
  {
    id: text("id").primaryKey(),
    waiverId: text("waiver_id").notNull().references(() => waivers.id),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    personId: text("person_id").references(() => people.id),
    teamId: text("team_id").references(() => teams.id),

    signedName: text("signed_name").notNull(),
    signedEmail: text("signed_email").notNull(),
    /** For a minor: the parent or guardian who signed. */
    guardianName: text("guardian_name"),
    dateOfBirth: text("date_of_birth"),

    /** Snapshot of exactly what was agreed to. */
    bodySnapshot: text("body_snapshot").notNull(),
    versionSigned: integer("version_signed").notNull(),

    ip: text("ip"),
    userAgent: text("user_agent"),
    signedAt: integer("signed_at").notNull().default(now),
  },
  (t) => [
    index("waiver_sig_tournament_idx").on(t.tournamentId),
    unique("one_signature_per_person_per_waiver").on(t.waiverId, t.signedEmail),
  ],
);

/* ---------------------------------------------------------------------------
 * Sites
 *
 * Big tournaments routinely span two or three venues a few minutes apart. The
 * thing that actually breaks is not the map, it is the schedule: a team sent
 * across town between consecutive rounds either forfeits or delays everyone.
 * Sites therefore carry travel time, and the scheduler treats it as a hard
 * constraint rather than a display detail.
 * ------------------------------------------------------------------------- */

export const sites = sqliteTable(
  "sites",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    name: text("name").notNull(),
    address: text("address"),
    lat: text("lat"),
    lng: text("lng"),
    /** Typical door-to-door travel time from the primary site, in minutes. */
    travelMinutes: integer("travel_minutes").default(0),
    isPrimary: integer("is_primary", { mode: "boolean" }).default(false),
    parkingNotes: text("parking_notes"),
    notes: text("notes"),
    sortOrder: integer("sort_order").default(0),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("sites_tournament_idx").on(t.tournamentId)],
);

/* ---------------------------------------------------------------------------
 * Field layout
 *
 * Fields are placed on a real map at true scale, so the site map a TD hands to
 * volunteers matches the ground. Geometry is stored as a centre point plus a
 * bearing; the corners are derived, which keeps a field exactly regulation size
 * no matter how it is rotated or where it sits.
 * ------------------------------------------------------------------------- */

export const fields = sqliteTable(
  "fields",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    siteId: text("site_id").references(() => sites.id),
    name: text("name").notNull(),
    /** usau | wfdf | beach | indoor | youth | custom */
    preset: text("preset").notNull().default("usau"),

    centerLat: text("center_lat").notNull(),
    centerLng: text("center_lng").notNull(),
    /** Degrees clockwise from north, applied to the field's long axis. */
    bearing: integer("bearing").notNull().default(0),

    /** Metres. Total length includes both end zones. */
    lengthM: integer("length_m").notNull().default(100),
    widthM: integer("width_m").notNull().default(37),
    endzoneM: integer("endzone_m").notNull().default(18),

    surface: text("surface"),
    notes: text("notes"),
    showcase: integer("showcase", { mode: "boolean" }).default(false),
    sortOrder: integer("sort_order").default(0),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("fields_tournament_idx").on(t.tournamentId)],
);

/** Non-field things on the site map: water, trainer, HQ, parking, toilets. */
export const sitePoints = sqliteTable(
  "site_points",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    siteId: text("site_id").references(() => sites.id),
    kind: text("kind").notNull(), // water | trainer | hq | parking | toilets | trash | food | other
    label: text("label").notNull(),
    lat: text("lat").notNull(),
    lng: text("lng").notNull(),
    /** Hex fill for the pin, so a TD can colour-code by zone or by day. */
    color: text("color"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("site_points_tournament_idx").on(t.tournamentId)],
);

/* ---------------------------------------------------------------------------
 * Feedback and memory
 * ------------------------------------------------------------------------- */

export const surveyResponses = sqliteTable(
  "survey_responses",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    personId: text("person_id").references(() => people.id),
    respondentRole: text("respondent_role"), // player | captain | volunteer | staff
    overall: integer("overall"),
    fields: integer("fields"),
    schedule: integer("schedule"),
    facilities: integer("facilities"),
    medical: integer("medical"),
    communication: integer("communication"),
    feeFair: text("fee_fair"),
    wouldReturn: text("would_return"), // yes | no | maybe
    best: text("best"),
    change: text("change"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("survey_tournament_idx").on(t.tournamentId)],
);

/** Carried forward between editions. The thing college ultimate always loses. */
export const archiveNotes = sqliteTable(
  "archive_notes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => orgs.id),
    tournamentId: text("tournament_id").references(() => tournaments.id),
    // contacts | vendors | budget | site | what_broke | teams | timeline | handoff
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    year: integer("year"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("archive_org_idx").on(t.orgId)],
);

/* ---------------------------------------------------------------------------
 * Auth -- magic link then long-lived trusted device, per house convention.
 * ------------------------------------------------------------------------- */

export const magicTokens = sqliteTable("magic_tokens", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  redirectTo: text("redirect_to"),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull().default(now),
});

export const trustedDevices = sqliteTable(
  "trusted_devices",
  {
    token: text("token").primaryKey(),
    personId: text("person_id").notNull().references(() => people.id),
    deviceName: text("device_name"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    lastUsed: integer("last_used"),
    revokedAt: integer("revoked_at"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("devices_person_idx").on(t.personId)],
);

/** Who may administer which org. */
export const orgMembers = sqliteTable(
  "org_members",
  {
    orgId: text("org_id").notNull().references(() => orgs.id),
    personId: text("person_id").notNull().references(() => people.id),
    role: text("role").notNull().default("td"), // owner | td | staff
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.personId] })],
);

/* ---------------------------------------------------------------------------
 * The TD agent's conversation with the tournament director.
 * ------------------------------------------------------------------------- */

export const agentMessages = sqliteTable(
  "agent_messages",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    toolCalls: text("tool_calls"), // JSON, for transparency in the UI
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("agent_tournament_idx").on(t.tournamentId)],
);

/** Photos for the public page. Stored on the volume, served through the app. */
export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull().references(() => tournaments.id),
    kind: text("kind").notNull().default("gallery"), // hero | gallery
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    caption: text("caption"),
    credit: text("credit"),
    sortOrder: integer("sort_order").default(0),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("media_tournament_idx").on(t.tournamentId)],
);
