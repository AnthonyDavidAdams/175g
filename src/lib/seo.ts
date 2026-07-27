import type { Metadata } from "next";

export const SITE_NAME = "175g";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://175g.com";
export const DEFAULT_DESCRIPTION =
  "Run a world-class ultimate tournament. An AI tournament director that handles dates, fields, insurance, teams, schedules, sponsors, and gameday — free for college teams.";

/**
 * Every page ships full Open Graph and Twitter Card metadata. Shared links to a
 * tournament land in group chats constantly; a bare link reads as unfinished.
 */
export function buildMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image,
  type = "website",
}: {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
}): Metadata {
  const url = new URL(path, SITE_URL).toString();
  const img = image
    ? new URL(image, SITE_URL).toString()
    : new URL("/og.png", SITE_URL).toString();
  const fullTitle = title === SITE_NAME ? title : `${title} · ${SITE_NAME}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: fullTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      type,
      images: [{ url: img, width: 1200, height: 630, alt: fullTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [img],
    },
  };
}
