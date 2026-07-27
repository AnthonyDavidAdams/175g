import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { SITE_URL } from "./seo";

const FROM = process.env.MAIL_FROM ?? "175g <no-reply@175g.com>";
const REGION = process.env.AWS_REGION ?? "us-east-1";

/**
 * Two transports, chosen by whichever credentials are present.
 *
 * SES is preferred. Gmail API is the fallback because Railway blocks outbound
 * SMTP (ports 465/587) — Gmail's HTTPS API works where SMTP does not, so plain
 * SMTP is deliberately not an option here.
 *
 * With neither configured, emails are logged instead of sent, so local
 * development still works: copy the magic link out of the console.
 */

let sesClient: SESv2Client | null = null;
function ses() {
  if (!sesClient) sesClient = new SESv2Client({ region: REGION });
  return sesClient;
}

function transport(): "ses" | "gmail" | "log" {
  if (process.env.AWS_ACCESS_KEY_ID) return "ses";
  if (process.env.GOOGLE_REFRESH_TOKEN) return "gmail";
  return "log";
}

async function gmailAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail token refresh returned no token.");
  return data.access_token;
}

/** RFC 2822 message, base64url encoded as the Gmail API expects. */
function buildRawMessage({
  to,
  subject,
  text,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}) {
  const boundary = `b${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${FROM}`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
  ].filter(Boolean);

  let body: string;
  if (html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      text,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      html,
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    headers.push("Content-Type: text/plain; charset=UTF-8");
    body = ["", text].join("\r\n");
  }

  return Buffer.from(headers.join("\r\n") + body)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}) {
  const mode = transport();

  if (mode === "log") {
    console.log(`\n[email:log] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { transport: mode };
  }

  if (mode === "gmail") {
    const token = await gmailAccessToken();
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          raw: buildRawMessage({ to, subject, text, html, replyTo }),
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
    }
    return { transport: mode };
  }

  await ses().send(
    new SendEmailCommand({
      FromEmailAddress: FROM,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: text },
            ...(html ? { Html: { Data: html } } : {}),
          },
        },
      },
    }),
  );
  return { transport: mode };
}

export async function sendMagicLink(email: string, token: string, redirectTo?: string) {
  const url = new URL(`/api/auth/verify?token=${token}`, SITE_URL);
  if (redirectTo) url.searchParams.set("next", redirectTo);
  const link = url.toString();

  return sendEmail({
    to: email,
    subject: "Your 175g sign-in link",
    text: [
      "Click to sign in to 175g:",
      "",
      link,
      "",
      "This link expires in 15 minutes and can only be used once.",
      "If you didn't request it, you can ignore this email.",
    ].join("\n"),
    html: `<p>Click to sign in to 175g:</p>
<p><a href="${link}">Sign in</a></p>
<p style="color:#666;font-size:14px">This link expires in 15 minutes and can only be used once.
If you didn't request it, you can ignore this email.</p>`,
  });
}
