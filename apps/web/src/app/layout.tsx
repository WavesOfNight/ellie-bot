import type { Metadata, Viewport } from "next";
import { Baloo_2, Quicksand } from "next/font/google";
import type { ReactNode } from "react";
import { BOT_NAME, STREAMER_NAME } from "@ellie/database/shared";
import "./globals.css";

const quicksand = Quicksand({ subsets: ["latin"], variable: "--font-quicksand", display: "swap" });
const baloo = Baloo_2({ subsets: ["latin"], variable: "--font-baloo", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${BOT_NAME} — Panel`, template: `%s · ${BOT_NAME}` },
  description: `Panel d'administration du bot de la communauté de ${STREAMER_NAME}.`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#7F77DD", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${quicksand.variable} ${baloo.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
