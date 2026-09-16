import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP basic auth in front of /admin. The page itself re-checks the header,
 * so this is the challenge, not the only guard.
 */
export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.next(); // page renders "disabled"

  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="175g admin", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
