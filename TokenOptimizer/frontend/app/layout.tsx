import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cutok",
  description:
    "Cut the token cost of LLM requests — compress prompts with a hosted model and compact attachments locally in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
