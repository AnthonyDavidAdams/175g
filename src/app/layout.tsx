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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
