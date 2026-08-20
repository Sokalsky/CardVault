"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Gauge, Images, Layers3, Settings, ShieldCheck } from "lucide-react";
import { DOMAIN_META, domainFromPath, isDomain, type Domain } from "@/lib/domain";

const SECTION_PAGES = new Set(["collection", "grading", "media", "submissions"]);

function navFor(section: Domain) {
  return [
    [`/${section}`, "Dashboard", Gauge],
    [`/${section}/collection`, "Collection", Archive],
    [`/${section}/grading`, "Grading Queue", ShieldCheck],
    [`/${section}/media`, "Media", Images],
    [`/${section}/submissions`, "PSA Submissions", Layers3],
    ["/settings", "Settings", Settings],
  ] as const;
}

/** Where the switcher lands you in the other section: same page when it exists there. */
function switchTarget(pathname: string, target: Domain) {
  const segments = pathname.split("/").filter(Boolean);
  if (isDomain(segments[0]) && segments[1] && SECTION_PAGES.has(segments[1])) {
    return `/${target}/${segments[1]}`;
  }
  return `/${target}`;
}

export function AppShell({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const section = domainFromPath(path);
  const meta = DOMAIN_META[section];

  return (
    <div className="shell" data-theme={section}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-row">
            {section === "pokemon"
              ? <span className="brand-mark pokeball" aria-hidden />
              : <span className="brand-mark football" aria-hidden />}
            <div>
              <div className="brand-title">CardVault</div>
              <div className="brand-sub">{meta.tagline}</div>
            </div>
          </div>
        </div>

        <div className="section-switch" role="tablist" aria-label="Collection section">
          <Link
            href={switchTarget(path, "pokemon")}
            className={`section-switch-btn${section === "pokemon" ? " active" : ""}`}
            aria-current={section === "pokemon" ? "page" : undefined}
          >
            <i className="pokeball-mini" aria-hidden /> Pokémon
          </Link>
          <Link
            href={switchTarget(path, "sports")}
            className={`section-switch-btn${section === "sports" ? " active" : ""}`}
            aria-current={section === "sports" ? "page" : undefined}
          >
            <i className="football-mini" aria-hidden /> Sports
          </Link>
        </div>

        <nav className="nav">
          {navFor(section).map(([href, label, Icon]) => {
            const active = href === `/${section}` ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} className={active ? "active" : ""}>
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">No OpenAI API required for grading. ChatGPT connects through MCP.</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-title">CardVault · {meta.label} Collection</div>
          <div className="demo-pill">{demo ? "Demo data · connect Supabase to enable writes" : "Database connected"}</div>
        </div>
        {children}
      </main>

      {section === "sports" && (
        <div className="field-match" aria-hidden>
          {[1, 2, 3, 4, 5].map((i) => <span key={`o${i}`} className={`fm-o fm-o${i}`} />)}
          {[1, 2, 3, 4, 5].map((i) => <span key={`x${i}`} className={`fm-x fm-x${i}`} />)}
          <span className="fm-ball" />
        </div>
      )}
    </div>
  );
}
