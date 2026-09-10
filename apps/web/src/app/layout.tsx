import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Light — Intelligent & Private Browser AI",
  description: "Private, intelligent browser automation — without sending your screen to the cloud.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Carter+One&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#030306] text-text-primary antialiased selection:bg-accent-primary/30 relative overflow-x-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="fixed inset-0 w-full h-full object-cover -z-20 pointer-events-none"
        >
          <source src="/bg-video.mp4" type="video/mp4" />
        </video>
        <div className="fixed inset-0 bg-[#030306]/35 -z-10 pointer-events-none" />
        {children}
      </body>
    </html>
  );
}

