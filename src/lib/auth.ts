import { and, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cookies, headers } from "next/headers";
import { db, schema } from "./db";

const DEVICE_COOKIE = "g175_device";
const MAGIC_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DEVICE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export type Session = {
  personId: string;
  email: string;
  name: string | null;
};

/** Find or create the person record for an email. Never sets marketing consent. */
export async function upsertPerson(email: string, name?: string | null) {
  const normalized = email.trim().toLowerCase();
  const existing = db
    .select()
    .from(schema.people)
    .where(eq(schema.people.email, normalized))
    .get();
  if (existing) {
    if (name && !existing.name) {
      db.update(schema.people)
        .set({ name })
        .where(eq(schema.people.id, existing.id))
        .run();
    }
    return existing;
  }
  const id = nanoid();
  db.insert(schema.people).values({ id, email: normalized, name: name ?? null }).run();
  return db.select().from(schema.people).where(eq(schema.people.id, id)).get()!;
}

export function createMagicToken(email: string, redirectTo?: string) {
  const token = nanoid(32);
  db.insert(schema.magicTokens)
    .values({
      token,
      email: email.trim().toLowerCase(),
      redirectTo: redirectTo ?? null,
      expiresAt: Math.floor((Date.now() + MAGIC_TTL_MS) / 1000),
    })
    .run();
  return token;
}

/** Consume a magic token and mint a trusted device. Tokens are single-use. */
export async function consumeMagicToken(token: string) {
  const row = db
    .select()
    .from(schema.magicTokens)
    .where(
      and(
        eq(schema.magicTokens.token, token),
        isNull(schema.magicTokens.usedAt),
        gt(schema.magicTokens.expiresAt, Math.floor(Date.now() / 1000)),
      ),
    )
    .get();
  if (!row) return null;

  db.update(schema.magicTokens)
    .set({ usedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.magicTokens.token, token))
    .run();

  const person = await upsertPerson(row.email);
  const hdrs = await headers();
  const deviceToken = nanoid(48);

  db.insert(schema.trustedDevices)
    .values({
      token: deviceToken,
      personId: person.id,
      userAgent: hdrs.get("user-agent") ?? null,
      ip: hdrs.get("x-real-ip") ?? null, // never raw x-forwarded-for behind Railway
      lastUsed: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor((Date.now() + DEVICE_TTL_MS) / 1000),
    })
    .run();

  const jar = await cookies();
  jar.set(DEVICE_COOKIE, deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DEVICE_TTL_MS / 1000,
    path: "/",
  });

  return { person, redirectTo: row.redirectTo };
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  if (!token) return null;

  const device = db
    .select()
    .from(schema.trustedDevices)
    .where(
      and(
        eq(schema.trustedDevices.token, token),
        isNull(schema.trustedDevices.revokedAt),
        gt(schema.trustedDevices.expiresAt, Math.floor(Date.now() / 1000)),
      ),
    )
    .get();
  if (!device) return null;

  db.update(schema.trustedDevices)
    .set({ lastUsed: Math.floor(Date.now() / 1000) })
    .where(eq(schema.trustedDevices.token, token))
    .run();

  const person = db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, device.personId))
    .get();
  if (!person) return null;

  return { personId: person.id, email: person.email, name: person.name };
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  if (token) {
    db.update(schema.trustedDevices)
      .set({ revokedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.trustedDevices.token, token))
      .run();
  }
  jar.delete(DEVICE_COOKIE);
}

/** Is this person allowed to administer this org? */
export function canAdminOrg(personId: string, orgId: string) {
  return !!db
    .select()
    .from(schema.orgMembers)
    .where(
      and(
        eq(schema.orgMembers.orgId, orgId),
        eq(schema.orgMembers.personId, personId),
      ),
    )
    .get();
}
