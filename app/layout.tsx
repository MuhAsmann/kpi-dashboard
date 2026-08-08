import type { Metadata } from "next";
import { Space_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "KPI Dashboard | Developer Performance",
  description:
    "Track developer KPIs based on GitHub Projects V2 data. Monitor task completion, cycle time, and team productivity.",
  keywords: ["KPI", "developer metrics", "GitHub Projects", "team performance"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceMono.variable} ${ibmPlexSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
