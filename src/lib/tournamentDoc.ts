import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "./db";

/**
 * The tournament document.
 *
 * One declarative JSON object that describes an entire tournament: venue,
 * fields and their real-world geometry, site markers, teams, the schedule,
 * waivers, deadlines, sponsors. Export it, edit it, apply it back.
 *
 * This exists because every generator in this system produces a starting point,
 * not a verdict. The document is the escape hatch that makes that true in the
 * strongest possible way — anything the app can express, a human or an agent
 * can write directly, diff, version, hand to someone else, or move to another
 * platform. It is also the interchange format: importing from elsewhere means
 * producing one of these.
 *
 * WHAT IT DELIBERATELY DOES NOT CONTAIN
 *
 * Rosters, waiver signatures, consent flags, sign-in devices. The document
 * describes the *event*, not the people in it.
 *
 * Captain contact details are the one borderline case. They are operational —
 * a TD moving between platforms needs them — but they are also personal data.
 * So they are REDACTED BY DEFAULT and only included when `includeContacts` is
 * explicitly set. The default export is therefore safe to paste into a chat or
 * commit to a repo, which is what people will actually do with it; the opt-in
 * export is a real backup and should be treated like one.
 *
 * Applying a redacted document never erases contacts already stored — an
 * absent field means "unchanged", not "delete".
 *
 * Waiver *text* is included, because it is event configuration. Waiver
 * *signatures* are not: they are personal records and immutable evidence of
 * what somebody agreed to.
 */

export const DOC_VERSION = 1;

const Site = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  travelMinutes: z.number().default(0),
  isPrimary: z.boolean().default(false),
  parkingNotes: z.string().nullish(),
});

const Field = z.object({
  name: z.string().min(1),
  site: z.string().nullish(),
  preset: z.string().default("usau"),
  lat: z.number(),
  lng: z.number(),
  bearing: z.number().default(0),
  lengthM: z.number().default(100),
  widthM: z.number().default(37),
  endzoneM: z.number().default(18),
  showcase: z.boolean().default(false),
});

const Marker = z.object({
  kind: z.string().min(1),
  label: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  color: z.string().nullish(),
  site: z.string().nullish(),
});

const Team = z.object({
  name: z.string().min(1),
  school: z.string().nullish(),
  division: z.string().nullish(),
  status: z
    .enum(["applied", "accepted", "waitlisted", "declined", "withdrawn"])
    .default("applied"),
  seed: z.number().nullish(),
  pool: z.string().nullish(),
  captainName: z.string().nullish(),
  /** Omitted from the default export; absent means "leave unchanged". */
  captainEmail: z.string().nullish(),
  captainPhone: z.string().nullish(),
  contactsRedacted: z.boolean().optional(),
  feePaid: z.boolean().default(false),
  amountPaidUSD: z.number().nullish(),
  notes: z.string().nullish(),
});

const Game = z.object({
  code: z.string().min(1),
  day: z.number().nullish(),
  round: z.number().nullish(),
  startTime: z.string().nullish(),
  field: z.string().nullish(),
  site: z.string().nullish(),
  stage: z.enum(["pool", "bracket", "placement"]).default("pool"),
  pool: z.string().nullish(),
  division: z.string().nullish(),
  /** A team name, or a placeholder: "A1", "W:G12", "L:G12". */
  home: z.string().nullish(),
  away: z.string().nullish(),
  homeScore: z.number().nullish(),
  awayScore: z.number().nullish(),
  status: z
    .enum(["scheduled", "in_progress", "final", "forfeit"])
    .default("scheduled"),
});

const Waiver = z.object({
  title: z.string().min(1),
  audience: z.enum(["participant", "team", "minor", "volunteer"]).default("participant"),
  required: z.boolean().default(true),
  body: z.string().min(1),
});

const Task = z.object({
  due: z.string().nullish(),
  start: z.string().nullish(),
  phase: z.string().nullish(),
  task: z.string().min(1),
  owner: z.string().nullish(),
  assignee: z.string().nullish(),
  hard: z.boolean().default(false),
  done: z.boolean().default(false),
  notes: z.string().nullish(),
});

const Sponsor = z.object({
  org: z.string().min(1),
  contactName: z.string().nullish(),
  email: z.string().nullish(),
  type: z.string().default("cash"),
  stage: z.string().default("prospect"),
  amountUSD: z.number().nullish(),
  inkindDescription: z.string().nullish(),
  tier: z.string().nullish(),
  notes: z.string().nullish(),
});

export const TournamentDoc = z.object({
  docVersion: z.number().default(DOC_VERSION),
  org: z.object({ slug: z.string(), name: z.string() }).partial().optional(),
  tournament: z.object({
    slug: z.string().nullish(),
    name: z.string().min(1),
    year: z.number().nullish(),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
    venueName: z.string().nullish(),
    venueAddress: z.string().nullish(),
    city: z.string().nullish(),
    fieldCount: z.number().nullish(),
    surface: z.string().nullish(),
    division: z.string().nullish(),
    divisionMode: z.enum(["alternate", "split"]).nullish(),
    teamTarget: z.number().nullish(),
    bidFeeUSD: z.number().nullish(),
    gamesGuaranteed: z.number().nullish(),
    sanctioned: z.boolean().nullish(),
    sanctionNumber: z.string().nullish(),
    applyDeadline: z.string().nullish(),
    acceptanceDate: z.string().nullish(),
    paymentDeadline: z.string().nullish(),
    rosterDeadline: z.string().nullish(),
    refundPolicy: z.string().nullish(),
    description: z.string().nullish(),
    published: z.boolean().nullish(),
    telegramInviteUrl: z.string().nullish(),
    venueLat: z.number().nullish(),
    venueLng: z.number().nullish(),
    directions: z.string().nullish(),
    paymentNote: z.string().nullish(),
    paymentOptions: z
      .array(
        z.object({
          method: z.string(),
          handle: z.string().nullish(),
          note: z.string().nullish(),
        }),
      )
      .nullish(),
  }),
  sites: z.array(Site).default([]),
  fields: z.array(Field).default([]),
  markers: z.array(Marker).default([]),
  teams: z.array(Team).default([]),
  schedule: z.array(Game).default([]),
  waivers: z.array(Waiver).default([]),
  tasks: z.array(Task).default([]),
  sponsors: z.array(Sponsor).default([]),
});

export type TournamentDocType = z.infer<typeof TournamentDoc>;

/* -------------------------------------------------------------------------
 * Export
 * ---------------------------------------------------------------------- */

export function toDoc(
  tournamentId: string,
  opts: { includeContacts?: boolean } = {},
): TournamentDocType {
  const t = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId))
    .get();
  if (!t) throw new Error("Tournament not found.");

  const org = db
    .select()
    .from(schema.orgs)
    .where(eq(schema.orgs.id, t.orgId))
    .get();

  const sites = db
    .select()
    .from(schema.sites)
    .where(eq(schema.sites.tournamentId, tournamentId))
    .orderBy(asc(schema.sites.sortOrder))
    .all();
  const siteKey = new Map(sites.map((s) => [s.id, s.name]));

  const fields = db
    .select()
    .from(schema.fields)
    .where(eq(schema.fields.tournamentId, tournamentId))
    .orderBy(asc(schema.fields.sortOrder))
    .all();
  const markers = db
    .select()
    .from(schema.sitePoints)
    .where(eq(schema.sitePoints.tournamentId, tournamentId))
    .all();
  const teams = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, tournamentId))
    .orderBy(asc(schema.teams.seed), asc(schema.teams.name))
    .all();
  const teamName = new Map(teams.map((x) => [x.id, x.name]));
  const games = db
    .select()
    .from(schema.games)
    .where(eq(schema.games.tournamentId, tournamentId))
    .orderBy(asc(schema.games.round))
    .all();
  const waivers = db
    .select()
    .from(schema.waivers)
    .where(eq(schema.waivers.tournamentId, tournamentId))
    .all();
  const tasks = db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.tournamentId, tournamentId))
    .orderBy(asc(schema.tasks.dueDate))
    .all();
  const sponsors = db
    .select()
    .from(schema.sponsors)
    .where(eq(schema.sponsors.tournamentId, tournamentId))
    .all();

  return {
    docVersion: DOC_VERSION,
    org: org ? { slug: org.slug, name: org.name } : undefined,
    tournament: {
      slug: t.slug,
      name: t.name,
      year: t.year ?? undefined,
      startDate: t.startDate,
      endDate: t.endDate,
      venueName: t.venueName,
      venueAddress: t.venueAddress,
      city: t.city,
      fieldCount: t.fieldCount,
      surface: t.surface,
      division: t.division,
      divisionMode: (t.divisionMode as "alternate" | "split") ?? undefined,
      teamTarget: t.teamTarget,
      bidFeeUSD: t.bidFee != null ? t.bidFee / 100 : null,
      gamesGuaranteed: t.gamesGuaranteed,
      sanctioned: t.sanctioned,
      sanctionNumber: t.sanctionNumber,
      applyDeadline: t.applyDeadline,
      acceptanceDate: t.acceptanceDate,
      paymentDeadline: t.paymentDeadline,
      rosterDeadline: t.rosterDeadline,
      refundPolicy: t.refundPolicy,
      description: t.description,
      published: t.published,
      telegramInviteUrl: t.telegramInviteUrl,
      venueLat: t.venueLat != null ? Number(t.venueLat) : null,
      venueLng: t.venueLng != null ? Number(t.venueLng) : null,
      directions: t.directions,
      paymentNote: t.paymentNote,
      // Photos are files, not document data, so they are managed separately
      // and survive an apply untouched.
      paymentOptions: t.paymentOptions ? JSON.parse(t.paymentOptions) : null,
    },
    sites: sites.map((s) => ({
      key: s.name,
      name: s.name,
      address: s.address,
      lat: s.lat != null ? Number(s.lat) : null,
      lng: s.lng != null ? Number(s.lng) : null,
      travelMinutes: s.travelMinutes ?? 0,
      isPrimary: !!s.isPrimary,
      parkingNotes: s.parkingNotes,
    })),
    fields: fields.map((f) => ({
      name: f.name,
      site: f.siteId ? (siteKey.get(f.siteId) ?? null) : null,
      preset: f.preset,
      lat: Number(f.centerLat),
      lng: Number(f.centerLng),
      bearing: f.bearing,
      lengthM: f.lengthM,
      widthM: f.widthM,
      endzoneM: f.endzoneM,
      showcase: !!f.showcase,
    })),
    markers: markers.map((m) => ({
      kind: m.kind,
      label: m.label,
      lat: Number(m.lat),
      lng: Number(m.lng),
      color: m.color,
      site: m.siteId ? (siteKey.get(m.siteId) ?? null) : null,
    })),
    teams: teams.map((x) => ({
      name: x.name,
      school: x.school,
      division: x.division,
      status: x.status as z.infer<typeof Team>["status"],
      seed: x.seed,
      pool: x.pool,
      captainName: x.captainName,
      captainEmail: opts.includeContacts ? x.captainEmail : undefined,
      captainPhone: opts.includeContacts ? x.captainPhone : undefined,
      contactsRedacted:
        !opts.includeContacts && !!(x.captainEmail || x.captainPhone)
          ? true
          : undefined,
      feePaid: !!x.feePaid,
      amountPaidUSD: x.amountPaid != null ? x.amountPaid / 100 : null,
      notes: x.notes,
    })),
    schedule: games.map((g) => ({
      code: g.gameCode ?? g.id.slice(0, 8),
      day: g.day,
      round: g.round,
      startTime: g.startTime,
      field: g.field,
      site: g.siteId ? (siteKey.get(g.siteId) ?? null) : null,
      stage: g.stage as "pool" | "bracket" | "placement",
      pool: g.pool,
      division: g.division,
      home: g.homeTeamId ? (teamName.get(g.homeTeamId) ?? null) : g.homeLabel,
      away: g.awayTeamId ? (teamName.get(g.awayTeamId) ?? null) : g.awayLabel,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      status: g.status as "scheduled" | "in_progress" | "final" | "forfeit",
    })),
    waivers: waivers.map((w) => ({
      title: w.title,
      audience: w.audience as "participant" | "team" | "minor" | "volunteer",
      required: !!w.required,
      body: w.body,
    })),
    tasks: tasks.map((x) => ({
      due: x.dueDate,
      start: x.startDate,
      phase: x.phase,
      task: x.task,
      owner: x.owner,
      assignee: x.assignee,
      hard: !!x.hardDeadline,
      done: !!x.done,
      notes: x.notes,
    })),
    sponsors: sponsors.map((s) => ({
      org: s.org,
      contactName: s.contactName,
      email: s.email,
      type: s.type ?? "cash",
      stage: s.stage,
      amountUSD: s.amount != null ? s.amount / 100 : null,
      inkindDescription: s.inkindDescription,
      tier: s.tier,
      notes: s.notes,
    })),
  } as TournamentDocType;
}

/* -------------------------------------------------------------------------
 * Apply
 * ---------------------------------------------------------------------- */

export type ApplyReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  changes: string[];
  destructive: string[];
  applied: boolean;
};

/**
 * Apply a document. Declarative: the collections in the document become the
 * collections in the database.
 *
 * `dryRun` reports exactly what would change without touching anything, and
 * separates ordinary changes from destructive ones — because the difference
 * between "renamed a field" and "erased 24 played results" is the whole
 * ballgame, and a wall of undifferentiated diff hides it.
 */
export function applyDoc(
  tournamentId: string,
  raw: unknown,
  opts: { dryRun?: boolean; allowDestructive?: boolean } = {},
): ApplyReport {
  const report: ApplyReport = {
    ok: false,
    errors: [],
    warnings: [],
    changes: [],
    destructive: [],
    applied: false,
  };

  const parsed = TournamentDoc.safeParse(raw);
  if (!parsed.success) {
    report.errors = parsed.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    return report;
  }
  const doc = parsed.data;

  if (doc.docVersion > DOC_VERSION) {
    report.errors.push(
      `Document is version ${doc.docVersion}; this server understands up to ` +
        `${DOC_VERSION}. Upgrade the server rather than downgrading the document.`,
    );
    return report;
  }

  // Compare like with like: if the incoming doc is redacted, redact ours too.
  const incomingHasContacts = doc.teams.some((t) => t.captainEmail !== undefined);
  const current = toDoc(tournamentId, { includeContacts: incomingHasContacts });

  // --- what changes -------------------------------------------------------
  const diffCount = (label: string, before: number, after: number) => {
    if (before !== after) report.changes.push(`${label}: ${before} -> ${after}`);
  };
  diffCount("sites", current.sites.length, doc.sites.length);
  diffCount("fields", current.fields.length, doc.fields.length);
  diffCount("markers", current.markers.length, doc.markers.length);
  diffCount("teams", current.teams.length, doc.teams.length);
  diffCount("games", current.schedule.length, doc.schedule.length);
  diffCount("waivers", current.waivers.length, doc.waivers.length);
  diffCount("tasks", current.tasks.length, doc.tasks.length);
  diffCount("sponsors", current.sponsors.length, doc.sponsors.length);

  for (const [k, v] of Object.entries(doc.tournament)) {
    const before = (current.tournament as Record<string, unknown>)[k];
    if (v !== undefined && JSON.stringify(before) !== JSON.stringify(v)) {
      report.changes.push(`tournament.${k}`);
    }
  }

  // --- destructive checks -------------------------------------------------
  const playedBefore = current.schedule.filter(
    (g) => g.status === "final" || g.status === "forfeit",
  );
  const codesAfter = new Map(doc.schedule.map((g) => [g.code, g]));
  const lostResults = playedBefore.filter((g) => {
    const after = codesAfter.get(g.code);
    if (!after) return true;
    return (
      after.homeScore !== g.homeScore ||
      after.awayScore !== g.awayScore ||
      after.status !== g.status
    );
  });
  if (lostResults.length) {
    report.destructive.push(
      `${lostResults.length} played result(s) would be removed or changed ` +
        `(${lostResults.slice(0, 6).map((g) => g.code).join(", ")}` +
        `${lostResults.length > 6 ? ", …" : ""}). Other teams' standings depend ` +
        `on these.`,
    );
  }

  // Waivers with signatures must not silently vanish.
  const signed = db
    .select()
    .from(schema.waiverSignatures)
    .where(eq(schema.waiverSignatures.tournamentId, tournamentId))
    .all();
  if (signed.length) {
    const existing = db
      .select()
      .from(schema.waivers)
      .where(eq(schema.waivers.tournamentId, tournamentId))
      .all();
    const keptTitles = new Set(doc.waivers.map((w) => w.title));
    const dropped = existing.filter(
      (w) =>
        !keptTitles.has(w.title) &&
        signed.some((s) => s.waiverId === w.id),
    );
    if (dropped.length) {
      report.destructive.push(
        `${dropped.length} waiver(s) with existing signatures would be removed: ` +
          `${dropped.map((w) => w.title).join(", ")}. Signatures are evidence of ` +
          `what someone agreed to and are never deleted by an import.`,
      );
    }
  }

  const paidGone = current.teams.filter(
    (t) => t.feePaid && !doc.teams.some((d) => d.name === t.name),
  );
  if (paidGone.length) {
    report.warnings.push(
      `${paidGone.length} team(s) that have paid would be removed: ` +
        `${paidGone.map((t) => t.name).join(", ")}. Check refunds.`,
    );
  }

  if (report.destructive.length && !opts.allowDestructive) {
    report.errors.push(
      "Refusing to apply: the changes above destroy records other people depend " +
        "on. Re-send with allowDestructive if that is genuinely intended.",
    );
  }

  report.ok = report.errors.length === 0;
  if (opts.dryRun || !report.ok) return report;

  // --- apply --------------------------------------------------------------
  const t = doc.tournament;
  db.update(schema.tournaments)
    .set({
      name: t.name,
      year: t.year ?? null,
      startDate: t.startDate ?? null,
      endDate: t.endDate ?? null,
      venueName: t.venueName ?? null,
      venueAddress: t.venueAddress ?? null,
      city: t.city ?? null,
      fieldCount: t.fieldCount ?? null,
      surface: t.surface ?? null,
      division: t.division ?? null,
      divisionMode: t.divisionMode ?? null,
      teamTarget: t.teamTarget ?? null,
      bidFee: t.bidFeeUSD != null ? Math.round(t.bidFeeUSD * 100) : null,
      gamesGuaranteed: t.gamesGuaranteed ?? null,
      sanctioned: t.sanctioned ?? false,
      sanctionNumber: t.sanctionNumber ?? null,
      applyDeadline: t.applyDeadline ?? null,
      acceptanceDate: t.acceptanceDate ?? null,
      paymentDeadline: t.paymentDeadline ?? null,
      rosterDeadline: t.rosterDeadline ?? null,
      refundPolicy: t.refundPolicy ?? null,
      description: t.description ?? null,
      published: t.published ?? false,
      telegramInviteUrl: t.telegramInviteUrl ?? null,
      venueLat: t.venueLat != null ? String(t.venueLat) : null,
      venueLng: t.venueLng != null ? String(t.venueLng) : null,
      directions: t.directions ?? null,
      paymentNote: t.paymentNote ?? null,
      paymentOptions: t.paymentOptions?.length
        ? JSON.stringify(t.paymentOptions)
        : null,
    })
    .where(eq(schema.tournaments.id, tournamentId))
    .run();

  // Sites, keyed by name so the document stays human-writable.
  const siteIdByKey = new Map<string, string>();
  db.delete(schema.sites)
    .where(eq(schema.sites.tournamentId, tournamentId))
    .run();
  doc.sites.forEach((s, i) => {
    const id = nanoid();
    siteIdByKey.set(s.key, id);
    siteIdByKey.set(s.name, id);
    db.insert(schema.sites)
      .values({
        id,
        tournamentId,
        name: s.name,
        address: s.address ?? null,
        lat: s.lat != null ? String(s.lat) : null,
        lng: s.lng != null ? String(s.lng) : null,
        travelMinutes: Math.round(s.travelMinutes),
        isPrimary: s.isPrimary,
        parkingNotes: s.parkingNotes ?? null,
        sortOrder: i,
      })
      .run();
  });

  db.delete(schema.fields)
    .where(eq(schema.fields.tournamentId, tournamentId))
    .run();
  doc.fields.forEach((f, i) => {
    db.insert(schema.fields)
      .values({
        id: nanoid(),
        tournamentId,
        siteId: f.site ? (siteIdByKey.get(f.site) ?? null) : null,
        name: f.name,
        preset: f.preset,
        centerLat: String(f.lat),
        centerLng: String(f.lng),
        bearing: Math.round(f.bearing),
        lengthM: Math.round(f.lengthM),
        widthM: Math.round(f.widthM),
        endzoneM: Math.round(f.endzoneM),
        showcase: f.showcase,
        sortOrder: i,
      })
      .run();
  });

  db.delete(schema.sitePoints)
    .where(eq(schema.sitePoints.tournamentId, tournamentId))
    .run();
  for (const m of doc.markers) {
    db.insert(schema.sitePoints)
      .values({
        id: nanoid(),
        tournamentId,
        siteId: m.site ? (siteIdByKey.get(m.site) ?? null) : null,
        kind: m.kind,
        label: m.label,
        lat: String(m.lat),
        lng: String(m.lng),
        color: m.color ?? null,
      })
      .run();
  }

  // Teams are matched by name so existing ids survive where possible; that
  // keeps roster entries and waiver signatures attached to the right team.
  const existingTeams = db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.tournamentId, tournamentId))
    .all();
  const teamIdByName = new Map(existingTeams.map((x) => [x.name, x.id]));
  const keptTeamNames = new Set(doc.teams.map((x) => x.name));

  for (const x of existingTeams) {
    if (!keptTeamNames.has(x.name)) {
      db.delete(schema.teams).where(eq(schema.teams.id, x.id)).run();
      teamIdByName.delete(x.name);
    }
  }
  for (const x of doc.teams) {
    const values = {
      school: x.school ?? null,
      division: x.division ?? null,
      status: x.status,
      seed: x.seed ?? null,
      pool: x.pool ?? null,
      captainName: x.captainName ?? null,
      feePaid: x.feePaid,
      amountPaid: x.amountPaidUSD != null ? Math.round(x.amountPaidUSD * 100) : null,
      notes: x.notes ?? null,
    };
    // An omitted contact field means "unchanged". Only an explicit value
    // overwrites, so applying a redacted document never wipes contacts.
    const contact: Record<string, unknown> = {};
    if (x.captainEmail !== undefined) contact.captainEmail = x.captainEmail ?? null;
    if (x.captainPhone !== undefined) contact.captainPhone = x.captainPhone ?? null;

    const id = teamIdByName.get(x.name);
    if (id) {
      db.update(schema.teams)
        .set({ ...values, ...contact })
        .where(eq(schema.teams.id, id))
        .run();
    } else {
      const newId = nanoid();
      teamIdByName.set(x.name, newId);
      db.insert(schema.teams)
        .values({ id: newId, tournamentId, name: x.name, ...values, ...contact })
        .run();
    }
  }

  db.delete(schema.games)
    .where(eq(schema.games.tournamentId, tournamentId))
    .run();
  for (const g of doc.schedule) {
    const homeId = g.home ? (teamIdByName.get(g.home) ?? null) : null;
    const awayId = g.away ? (teamIdByName.get(g.away) ?? null) : null;
    db.insert(schema.games)
      .values({
        id: nanoid(),
        tournamentId,
        gameCode: g.code,
        day: g.day ?? null,
        round: g.round ?? null,
        startTime: g.startTime ?? null,
        field: g.field ?? null,
        siteId: g.site ? (siteIdByKey.get(g.site) ?? null) : null,
        stage: g.stage,
        pool: g.pool ?? null,
        division: g.division ?? null,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeLabel: homeId ? null : (g.home ?? null),
        awayLabel: awayId ? null : (g.away ?? null),
        homeScore: g.homeScore ?? null,
        awayScore: g.awayScore ?? null,
        status: g.status,
      })
      .run();
  }

  // Waivers match by title so signatures stay attached to their text.
  const existingWaivers = db
    .select()
    .from(schema.waivers)
    .where(eq(schema.waivers.tournamentId, tournamentId))
    .all();
  const keptWaiverTitles = new Set(doc.waivers.map((w) => w.title));
  for (const w of existingWaivers) {
    const hasSignatures = signed.some((s) => s.waiverId === w.id);
    if (!keptWaiverTitles.has(w.title) && !hasSignatures) {
      db.delete(schema.waivers).where(eq(schema.waivers.id, w.id)).run();
    }
  }
  for (const w of doc.waivers) {
    const existing = existingWaivers.find((x) => x.title === w.title);
    if (existing) {
      db.update(schema.waivers)
        .set({
          body: w.body,
          audience: w.audience,
          required: w.required,
          version: w.body !== existing.body ? existing.version + 1 : existing.version,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(schema.waivers.id, existing.id))
        .run();
    } else {
      db.insert(schema.waivers)
        .values({
          id: nanoid(),
          tournamentId,
          title: w.title,
          body: w.body,
          audience: w.audience,
          required: w.required,
        })
        .run();
    }
  }

  db.delete(schema.tasks).where(eq(schema.tasks.tournamentId, tournamentId)).run();
  for (const x of doc.tasks) {
    db.insert(schema.tasks)
      .values({
        id: nanoid(),
        tournamentId,
        phase: x.phase ?? null,
        task: x.task,
        owner: x.owner ?? null,
        assignee: x.assignee ?? null,
        startDate: x.start ?? null,
        dueDate: x.due ?? null,
        hardDeadline: x.hard,
        done: x.done,
        notes: x.notes ?? null,
      })
      .run();
  }

  db.delete(schema.sponsors)
    .where(eq(schema.sponsors.tournamentId, tournamentId))
    .run();
  for (const s of doc.sponsors) {
    db.insert(schema.sponsors)
      .values({
        id: nanoid(),
        tournamentId,
        org: s.org,
        contactName: s.contactName ?? null,
        email: s.email ?? null,
        type: s.type,
        stage: s.stage,
        amount: s.amountUSD != null ? Math.round(s.amountUSD * 100) : null,
        inkindDescription: s.inkindDescription ?? null,
        tier: s.tier ?? null,
        notes: s.notes ?? null,
      })
      .run();
  }

  report.applied = true;
  return report;
}
