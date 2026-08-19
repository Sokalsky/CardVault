import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { isDemoMode } from "@/lib/repository";

export const metadata: Metadata = {
  title: "CardVault",
  description: "Pokémon card collection, grading, media and PSA submission workflow",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const demo = isDemoMode();
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar />
          <main className="main">
            <div className="topbar">
              <div className="topbar-title">CardVault · Pokémon Collection</div>
              <div className="demo-pill">{demo ? "Demo data · connect Supabase to enable writes" : "Database connected"}</div>
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
