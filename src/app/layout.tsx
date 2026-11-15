import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MAIN_CONTENT_ID, contrastBootScript } from "@/modules/accessibility";
import { AccessibilityPanel } from "@/app/_components/accessibility-panel";
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
        {/* SPEC 2026-11-15-acessibilidade, section 7 (SF-269): the first stop of the Tab key, then the
            "Acessibilidade" button, on every screen, the entrance and the login too. */}
        <a className="skip-link" href={`#${MAIN_CONTENT_ID}`}>
          Pular para o conteúdo
        </a>
        {/* The bar is never read aloud (data-reading="skip"); its panel holds the reading (SF-268) and the contrast
            (SF-265). */}
        <div className="accessibility-bar" data-reading="skip">
          <AccessibilityPanel>
            <SpeechControls />
            <ContrastToggle />
          </AccessibilityPanel>
        </div>
        {children}
      </body>
    </html>
  );
}
