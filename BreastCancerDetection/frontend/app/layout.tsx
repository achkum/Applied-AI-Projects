import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Disclaimer } from "@/components/Disclaimer";

import "./globals.css";

export const metadata: Metadata = {
  title: "Breast Cancer Histopathology CDSS",
  description:
    "AI-assisted decision support for breast histopathology. A research prototype, not a diagnostic device.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-800 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-4">
            <a href="/" className="text-lg font-semibold text-blue-900">
              Histopathology CDSS
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">
          {/* Disclaimer is visible on every screen (hard constraint). */}
          <div className="mb-6">
            <Disclaimer />
          </div>
          {children}
        </main>
      </body>
    </html>
  );
}
