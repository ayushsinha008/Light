import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Light",
  description: "Private, intelligent browser automation — without sending your screen to the cloud.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 bg-mesh">{children}</body>
    </html>
  );
}
