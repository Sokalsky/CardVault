import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fredoka";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { isDemoMode } from "@/lib/repository";

export const metadata: Metadata = {
  title: "CardVault",
  description: "Pokémon and sports card collection, grading, media and PSA submission workflow",
};

// Railway injects database credentials at container runtime, not during the
// Docker build. Keep collection pages dynamic so they never bake in demo data.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const demo = isDemoMode();
  return (
    <html lang="en">
      <body>
        <AppShell demo={demo}>{children}</AppShell>
      </body>
    </html>
  );
}
