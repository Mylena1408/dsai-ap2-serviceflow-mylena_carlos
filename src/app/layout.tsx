import type { Metadata } from "next";
import type { ReactNode } from "react";
import { contrastBootScript } from "@/modules/accessibility";
import { ContrastToggle } from "@/app/_components/contrast-toggle";
import { SpeechControls } from "@/app/_components/speech-controls";
import "./globals.css";

export const metadata: Metadata = {
  title: "ServiceFlow",
  description:
    "Plataforma configurável para gerenciamento de solicitações de serviços internos.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The head's script may mark <html> with data-contrast before React hydrates (SPEC 2026-11-15-acessibilidade,
    // 5.3 item 4), so React keeps that attribute instead of warning about it.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Runs while the page is parsed, before the first paint: the theme never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: contrastBootScript() }} />
      </head>
      <body>
        {/* SPEC 2026-11-15-acessibilidade, 5.1 item 1 (SF-265): on every screen, the entrance and the login too.
            SF-269 turns this bar into the "Acessibilidade" button with its panel. */}
        {/* SF-268: the reading aloud joins it; the bar itself is never read (data-reading="skip"). */}
        <div className="accessibility-bar" data-reading="skip">
          <SpeechControls />
          <ContrastToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
