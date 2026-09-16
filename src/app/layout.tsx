import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = buildMetadata({
  title: "175g",
  description:
    "Run a world-class ultimate tournament. An AI tournament director that handles dates, fields, insurance, teams, schedules, sponsors, and gameday — free for college teams.",
  path: "/",
});

const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC;
const UMAMI_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {UMAMI_SRC && UMAMI_ID && (
          <script defer src={UMAMI_SRC} data-website-id={UMAMI_ID} />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
