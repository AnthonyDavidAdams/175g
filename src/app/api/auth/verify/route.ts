import { NextResponse } from "next/server";
import { consumeMagicToken } from "@/lib/auth";
import { SITE_URL } from "@/lib/seo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing", SITE_URL));
  }

  const result = await consumeMagicToken(token);
  if (!result) {
    return NextResponse.redirect(new URL("/login?error=expired", SITE_URL));
  }

  const next =
    url.searchParams.get("next") ?? result.redirectTo ?? "/dashboard";
  // /new is protected, so a signed-out "Start a tournament" click lands here
  // and continues straight through rather than dead-ending on the dashboard.
  return NextResponse.redirect(new URL(next, SITE_URL));
}
