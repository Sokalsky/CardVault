"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Gauge, Images, Layers3, Settings, ShieldCheck } from "lucide-react";

const links = [
  ["/", "Dashboard", Gauge],
  ["/collection", "Collection", Archive],
  ["/grading", "Grading Queue", ShieldCheck],
  ["/media", "Media", Images],
  ["/submissions", "PSA Submissions", Layers3],
  ["/settings", "Settings", Settings],
] as const;

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-title">CardVault</div>
        <div className="brand-sub">Pokémon collection + PSA workflow</div>
      </div>
      <nav className="nav">
        {links.map(([href, label, Icon]) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
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
  );
}
