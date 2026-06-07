import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import type { ReactNode } from "react";

import { Disclaimer } from "@/components/Disclaimer";
import { Header } from "@/components/Header";

import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});
const serif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "AI Breast Cancer Detector",
  description:
    "AI-assisted breast cancer detection from histopathology slides, with Grad-CAM explainability and an MCP-exposed toolset. A research prototype, not a diagnostic device.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body className="min-h-screen">
        <Header />
        <main className="mx-auto w-full max-w-[1400px] px-5 pb-16 pt-6 sm:px-8">{children}</main>
        <footer className="mx-auto w-full max-w-[1400px] px-5 pb-10 sm:px-8">
          <Disclaimer />
          <p className="mt-4 text-center font-mono text-[0.68rem] tracking-wide text-fg-faint">
            ResNet50, BreaKHis 400X, Grad-CAM, MCP, Gemini 2.5 Flash-Lite. Built on GCP Cloud Run and Vercel.
          </p>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
