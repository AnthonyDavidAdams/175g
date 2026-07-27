import { NextResponse } from "next/server";
import { createMagicToken } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const next = typeof body?.next === "string" ? body.next : undefined;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const token = createMagicToken(email, next);
  await sendMagicLink(email, token, next);

  // Always the same response, whether or not the address is known.
  return NextResponse.json({ ok: true });
}
