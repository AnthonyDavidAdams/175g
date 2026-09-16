import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "./db";
import {
  Field,
  Marker,
  Site,
  Waiver,
  applyDoc,
  toDoc,
  type ApplyReport,
  type TournamentDocType,
} from "./tournamentDoc";

/**
 * Event templates.
 *
 * A template is what is left of a tournament when you remove the edition:
 * no teams, no games, no dates. Deadlines and tasks become offsets from the
 * event date, so "applications close six weeks out" survives the move to a
 * new year or a new program. What stays is the hard-won part — the refund
 * policy that survived a weather cancellation, the waiver text, the task
 * list with the lead times that actually bit, which sponsors to approach.
 *
 * Templates are how an advisor helps. An alum who ran the event for three
 * years can package what worked and hand it to this year's TD, to a sister
 * program, or to the public gallery for a stranger starting cold.
 *
 * The venue is optional. Same event at the same fields next year wants the
 * site map; a template for a different school does not.
 *
 * Templates never contain personal data: no captains, no sponsor contacts,
 * no payment handles. Sponsor rows keep the organisation name and what kind
 * of sponsor they were, reset to "prospect".
 */

export const TEMPLATE_VERSION = 1;

const TemplateTask = z.object({
  /** Days before the event start. Null = undated. */
  daysBefore: z.number().nullish(),
  /** Bar length in days, when the source task had a start date. */
  durationDays: z.number().nullish(),
  phase: z.string().nullish(),
  task: z.string().min(1),
  owner: z.string().nullish(),
  hard: z.boolean().default(false),
  notes: z.string().nullish(),
});

const TemplateSponsor = z.object({
  org: z.string().min(1),
  type: z.string().default("cash"),
  tier: z.string().nullish(),
  inkindDescription: z.string().nullish(),
  notes: z.string().nullish(),
});

export const TemplateDoc = z.object({
  templateVersion: z.number().default(TEMPLATE_VERSION),
  event: z.object({
    /** How many days the event runs. */
    durationDays: z.number().int().min(1).max(7).default(2),
    description: z.string().nullish(),
    refundPolicy: z.string().nullish(),
    fieldCount: z.number().nullish(),
    surface: z.string().nullish(),
    division: z.string().nullish(),
    divisionMode: z.enum(["alternate", "split"]).nullish(),
    teamTarget: z.number().nullish(),
    bidFeeUSD: z.number().nullish(),
    gamesGuaranteed: z.number().nullish(),
    sanctioned: z.boolean().nullish(),
    paymentNote: z.string().nullish(),
  }),
  /** Days before the event start. */
  offsets: z.object({
    applyDeadline: z.number().nullish(),
    acceptance: z.number().nullish(),
    paymentDeadline: z.number().nullish(),
    rosterDeadline: z.number().nullish(),
  }),
  venue: z
    .object({
      venueName: z.string().nullish(),
      venueAddress: z.string().nullish(),
      city: z.string().nullish(),
      venueLat: z.number().nullish(),
      venueLng: z.number().nullish(),
      directions: z.string().nullish(),
      sites: z.array(Site).default([]),
      fields: z.array(Field).default([]),
      markers: z.array(Marker).default([]),
    })
    .nullish(),
  waivers: z.array(Waiver).default([]),
  tasks: z.array(TemplateTask).default([]),
  sponsors: z.array(TemplateSponsor).default([]),
});

export type TemplateDocType = z.infer<typeof TemplateDoc>;

export const VISIBILITIES = ["org", "link", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

const DAY = 86400000;

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);
}

function shift(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------
 * Build a template from a tournament
 * ---------------------------------------------------------------------- */

export function buildTemplate(
  tournamentId: string,
  opts: { includeVenue?: boolean } = {},
): TemplateDocType {
  const doc = toDoc(tournamentId);
  const t = doc.tournament;
  const start = t.startDate ?? null;

  const before = (d?: string | null) =>
    start && d ? daysBetween(d, start) : null;

  const durationDays =
    start && t.endDate ? Math.max(1, daysBetween(start, t.endDate) + 1) : 2;

  return {
    templateVersion: TEMPLATE_VERSION,
    event: {
      durationDays,
      description: t.description,
      refundPolicy: t.refundPolicy,
      fieldCount: t.fieldCount,
      surface: t.surface,
      division: t.division,
      divisionMode: t.divisionMode ?? undefined,
      teamTarget: t.teamTarget,
      bidFeeUSD: t.bidFeeUSD,
      gamesGuaranteed: t.gamesGuaranteed,
      sanctioned: t.sanctioned,
      paymentNote: t.paymentNote,
    },
    offsets: {
      applyDeadline: before(t.applyDeadline),
      acceptance: before(t.acceptanceDate),
      paymentDeadline: before(t.paymentDeadline),
      rosterDeadline: before(t.rosterDeadline),
    },
    venue: opts.includeVenue
      ? {
          venueName: t.venueName,
          venueAddress: t.venueAddress,
          city: t.city,
          venueLat: t.venueLat,
          venueLng: t.venueLng,
          directions: t.directions,
          sites: doc.sites,
          fields: doc.fields,
          markers: doc.markers,
        }
      : null,
    waivers: doc.waivers,
    tasks: doc.tasks.map((x) => ({
      daysBefore: before(x.due),
      durationDays:
        x.start && x.due ? Math.max(0, daysBetween(x.start, x.due)) : null,
      phase: x.phase,
      task: x.task,
      owner: x.owner,
      hard: x.hard,
      notes: x.notes,
    })),
    sponsors: doc.sponsors.map((s) => ({
      org: s.org,
      type: s.type,
      tier: s.tier,
      inkindDescription: s.inkindDescription,
      notes: s.notes,
    })),
  };
}

/* -------------------------------------------------------------------------
 * Turn a template into a tournament document for a specific edition
 * ---------------------------------------------------------------------- */

export function materialize(
  tpl: TemplateDocType,
  edition: { name: string; startDate?: string | null; endDate?: string | null },
): TournamentDocType {
  const start = edition.startDate ?? null;
  const end =
    edition.endDate ??
    (start ? shift(start, Math.max(0, tpl.event.durationDays - 1)) : null);

  const at = (days?: number | null) =>
    start && days != null ? shift(start, -days) : null;

  const v = tpl.venue;
  return {
    docVersion: 1,
    tournament: {
      name: edition.name,
      year: start ? Number(start.slice(0, 4)) : null,
      startDate: start,
      endDate: end,
      venueName: v?.venueName ?? null,
      venueAddress: v?.venueAddress ?? null,
      city: v?.city ?? null,
      fieldCount: tpl.event.fieldCount ?? null,
      surface: tpl.event.surface ?? null,
      division: tpl.event.division ?? null,
      divisionMode: tpl.event.divisionMode ?? null,
      teamTarget: tpl.event.teamTarget ?? null,
      bidFeeUSD: tpl.event.bidFeeUSD ?? null,
      gamesGuaranteed: tpl.event.gamesGuaranteed ?? null,
      sanctioned: tpl.event.sanctioned ?? null,
      applyDeadline: at(tpl.offsets.applyDeadline),
      acceptanceDate: at(tpl.offsets.acceptance),
      paymentDeadline: at(tpl.offsets.paymentDeadline),
      rosterDeadline: at(tpl.offsets.rosterDeadline),
      refundPolicy: tpl.event.refundPolicy ?? null,
      description: tpl.event.description ?? null,
      published: false,
      venueLat: v?.venueLat ?? null,
      venueLng: v?.venueLng ?? null,
      directions: v?.directions ?? null,
      paymentNote: tpl.event.paymentNote ?? null,
      paymentOptions: null,
    },
    sites: v?.sites ?? [],
    fields: v?.fields ?? [],
    markers: v?.markers ?? [],
    teams: [],
    schedule: [],
    waivers: tpl.waivers,
    tasks: tpl.tasks.map((x) => {
      const due = at(x.daysBefore);
      return {
        due,
        start: due && x.durationDays ? shift(due, -x.durationDays) : null,
        phase: x.phase,
        task: x.task,
        owner: x.owner,
        assignee: null,
        hard: x.hard,
        done: false,
        notes: x.notes,
      };
    }),
    sponsors: tpl.sponsors.map((s) => ({
      org: s.org,
      contactName: null,
      email: null,
      type: s.type,
      stage: "prospect",
      amountUSD: null,
      inkindDescription: s.inkindDescription,
      tier: s.tier,
      notes: s.notes,
    })),
  };
}

export function summarize(tpl: TemplateDocType) {
  return {
    durationDays: tpl.event.durationDays,
    division: tpl.event.division ?? null,
    teamTarget: tpl.event.teamTarget ?? null,
    fieldCount: tpl.event.fieldCount ?? null,
    bidFeeUSD: tpl.event.bidFeeUSD ?? null,
    sanctioned: tpl.event.sanctioned ?? null,
    hasVenue: !!tpl.venue,
    venueName: tpl.venue?.venueName ?? null,
    city: tpl.venue?.city ?? null,
    fields: tpl.venue?.fields.length ?? 0,
    tasks: tpl.tasks.length,
    waivers: tpl.waivers.length,
    sponsors: tpl.sponsors.length,
    hasRefundPolicy: !!tpl.event.refundPolicy,
  };
}

/* -------------------------------------------------------------------------
 * Storage
 * ---------------------------------------------------------------------- */

export type TemplateRow = typeof schema.templates.$inferSelect;

export function parseTemplate(row: TemplateRow): TemplateDocType {
  return TemplateDoc.parse(JSON.parse(row.doc));
}

export function createTemplate(input: {
  orgId: string | null;
  createdBy: string | null;
  sourceTournamentId: string | null;
  name: string;
  description?: string | null;
  doc: TemplateDocType;
  visibility?: Visibility;
  id?: string;
}) {
  const id = input.id ?? nanoid(12);
  db.insert(schema.templates)
    .values({
      id,
      orgId: input.orgId,
      createdBy: input.createdBy,
      sourceTournamentId: input.sourceTournamentId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      doc: JSON.stringify(TemplateDoc.parse(input.doc)),
      visibility: input.visibility ?? "org",
      shareToken: nanoid(24),
    })
    .run();
  return getTemplate(id)!;
}

export function getTemplate(id: string) {
  return db.select().from(schema.templates).where(eq(schema.templates.id, id)).get();
}

/**
 * Can this person open this template? Public and built-in templates: anyone.
 * Link-visible: anyone with the token. Org-private: members of the owning org.
 */
export function canSeeTemplate(
  tpl: TemplateRow,
  personId: string | null,
  token?: string | null,
) {
  if (tpl.visibility === "public" || tpl.orgId === null) return true;
  if (token && token === tpl.shareToken) return true;
  if (!personId || !tpl.orgId) return false;
  return !!db
    .select()
    .from(schema.orgMembers)
    .where(
      and(
        eq(schema.orgMembers.orgId, tpl.orgId),
        eq(schema.orgMembers.personId, personId),
      ),
    )
    .get();
}

/** Templates this person can start from: their orgs', plus public and built-in. */
export function listTemplatesFor(personId: string | null) {
  const orgIds = personId
    ? db
        .select({ orgId: schema.orgMembers.orgId })
        .from(schema.orgMembers)
        .where(eq(schema.orgMembers.personId, personId))
        .all()
        .map((m) => m.orgId)
    : [];

  const where = orgIds.length
    ? or(
        eq(schema.templates.visibility, "public"),
        sql`${schema.templates.orgId} IS NULL`,
        inArray(schema.templates.orgId, orgIds),
      )
    : or(eq(schema.templates.visibility, "public"), sql`${schema.templates.orgId} IS NULL`);

  return db
    .select()
    .from(schema.templates)
    .where(where)
    .orderBy(desc(schema.templates.useCount), desc(schema.templates.createdAt))
    .all();
}

/**
 * Apply a template to a (usually brand-new, empty) tournament. Goes through
 * applyDoc so the same destructive-change guard protects a tournament that
 * already has results.
 */
export function applyTemplate(
  templateId: string,
  tournamentId: string,
  edition: { name: string; startDate?: string | null; endDate?: string | null },
  opts: { dryRun?: boolean } = {},
): ApplyReport {
  const row = getTemplate(templateId);
  if (!row) throw new Error("Template not found.");
  const tpl = parseTemplate(row);
  const doc = materialize(tpl, edition);
  const report = applyDoc(tournamentId, doc, { dryRun: opts.dryRun });
  if (report.applied) {
    db.update(schema.templates)
      .set({ useCount: sql`${schema.templates.useCount} + 1` })
      .where(eq(schema.templates.id, templateId))
      .run();
  }
  return report;
}
