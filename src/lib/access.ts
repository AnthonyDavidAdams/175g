import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "./db";
import { getSession, type Session } from "./auth";

/**
 * Who may do what on a tournament.
 *
 * Four roles, granted per org (a program), so they carry across editions:
 *
 *   owner    the program's account holder. Everything, including who else
 *            has access and who owns the program.
 *   td       runs the tournament. Everything except changing owners.
 *   staff    gameday hands — a scorekeeper, a field marshal, the volunteer
 *            coordinator. Scores, tasks, announcements, the field map. Not
 *            outreach, waivers, publishing or the document — the things that
 *            go out under the program's name.
 *   advisor  oversight, no hands on the wheel. Alumni who ran it before, a
 *            faculty sponsor, a mentor from another program. Sees every
 *            private page and the agent's working conversation, can talk to
 *            the agent in a read-only thread, leaves notes, and can package
 *            what they learn as a template for other programs. Cannot change
 *            the tournament.
 *
 * Permissions are checked in two places, deliberately: every API route (the
 * real guard) and every private page (so the UI doesn't offer buttons that
 * will 403). The agent gets a role-filtered tool set, so a read-only user
 * talking to it cannot mutate anything either.
 */

export const ROLES = ["owner", "td", "staff", "advisor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  td: "Tournament director",
  staff: "Staff",
  advisor: "Advisor",
};

export const ROLE_BLURB: Record<Role, string> = {
  owner: "Everything, including who has access. Give this to next year's TD before you graduate.",
  td: "Runs the tournament: the agent, outreach, waivers, publishing, scores.",
  staff: "Gameday hands: score entry, tasks, announcements, the field map. Nothing goes out under the program's name.",
  advisor: "Oversight only. Sees everything, changes nothing, leaves notes, and can share what worked as a template.",
};

export type Perm =
  /** Open the private pages and read everything on them. */
  | "view"
  /** Talk to the agent at all (tool set still depends on role). */
  | "agent.chat"
  /** Agent tools that plan and change the event: dates, teams, schedule, outreach drafts… */
  | "agent.mutate"
  /** Agent gameday tools: edit_game, post_announcement, manage_tasks. */
  | "agent.ops"
  | "scores"
  | "tasks"
  | "announce"
  | "fields"
  | "outreach"
  | "waivers"
  | "page"
  | "doc.apply"
  | "tournament.create"
  /** Add or remove td / staff / advisor. */
  | "access"
  /** Add or remove owners. */
  | "access.owner"
  /** Save this tournament as a template (a read, not a write). */
  | "templates.save"
  /** Edit, delete, or change visibility of the org's templates. */
  | "templates.manage"
  | "notes";

const GRANTS: Record<Role, Set<Perm>> = {
  owner: new Set<Perm>([
    "view", "agent.chat", "agent.mutate", "agent.ops", "scores", "tasks", "announce",
    "fields", "outreach", "waivers", "page", "doc.apply", "tournament.create",
    "access", "access.owner", "templates.save", "templates.manage", "notes",
  ]),
  td: new Set<Perm>([
    "view", "agent.chat", "agent.mutate", "agent.ops", "scores", "tasks", "announce",
    "fields", "outreach", "waivers", "page", "doc.apply", "tournament.create",
    "access", "templates.save", "templates.manage", "notes",
  ]),
  staff: new Set<Perm>([
    "view", "agent.chat", "agent.ops", "scores", "tasks", "announce", "fields",
    "templates.save", "notes",
  ]),
  advisor: new Set<Perm>([
    "view", "agent.chat", "templates.save", "templates.manage", "notes",
  ]),
};

export function can(role: Role | null | undefined, perm: Perm): boolean {
  if (!role) return false;
  return GRANTS[role]?.has(perm) ?? false;
}

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && (ROLES as readonly string[]).includes(x);
}

/** Legacy rows may carry an unknown role string; treat those as td. */
function normalize(role: string): Role {
  return isRole(role) ? role : "td";
}

export function getRole(personId: string, orgId: string): Role | null {
  const row = db
    .select({ role: schema.orgMembers.role })
    .from(schema.orgMembers)
    .where(
      and(
        eq(schema.orgMembers.orgId, orgId),
        eq(schema.orgMembers.personId, personId),
      ),
    )
    .get();
  return row ? normalize(row.role) : null;
}

export type Access = { session: Session; role: Role };

/**
 * For pages. Returns the session and role, or null when the visitor is not
 * signed in or not a member. Pages redirect or 404 as they see fit.
 */
export async function getAccess(orgId: string): Promise<Access | null> {
  const session = await getSession();
  if (!session) return null;
  const role = getRole(session.personId, orgId);
  return role ? { session, role } : null;
}

/**
 * For API routes. One call replaces the session + membership + permission
 * dance. Returns either the access or a ready-to-return error response.
 */
export async function requireAccess(
  orgId: string,
  perm: Perm,
): Promise<{ ok: true; access: Access } | { ok: false; response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }
  const role = getRole(session.personId, orgId);
  if (!role) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authorised." }, { status: 403 }),
    };
  }
  if (!can(role, perm)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Your role here is ${ROLE_LABEL[role].toLowerCase()}, which can't do that. Ask an owner or TD.`,
          role,
          missing: perm,
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, access: { session, role } };
}

/**
 * Can `actor` grant or revoke `target` role? Owners manage everyone. TDs
 * manage td, staff and advisor but never owners. Nobody else manages access.
 */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "td") return target !== "owner";
  return false;
}
