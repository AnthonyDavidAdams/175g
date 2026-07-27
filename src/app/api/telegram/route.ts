import { NextResponse } from "next/server";
import { handleUpdate } from "@/lib/telegram";

/**
 * Telegram webhook. Set the secret token when registering the webhook so
 * arbitrary posters cannot inject scores:
 *   setWebhook?url=...&secret_token=$TELEGRAM_WEBHOOK_SECRET
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== secret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const update = await req.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true });

  try {
    await handleUpdate(update);
  } catch (err) {
    console.error("[telegram]", err);
  }
  // Always 200 — Telegram retries aggressively on anything else.
  return NextResponse.json({ ok: true });
}
