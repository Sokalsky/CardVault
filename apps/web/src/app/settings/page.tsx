import { isDemoMode } from "@/lib/repository";

export default function SettingsPage() {
  const demo = isDemoMode();
  return <div className="page"><div className="page-head"><div><h1 className="page-title">Settings</h1><p className="page-sub">Connection status and grading rules.</p></div></div>
    <div className="section-grid"><div className="grid">
      <div className="card"><div className="card-head"><div className="card-title">Infrastructure</div></div><div className="card-body">
        <div className="kv"><div className="kv-key">Database</div><div><span className={`badge ${demo?"warn":"good"}`}>{demo?"Demo JSON":"Connected"}</span></div></div>
        <div className="kv"><div className="kv-key">Storage</div><div>Supabase private bucket</div></div>
        <div className="kv"><div className="kv-key">Video</div><div>Railway FFmpeg worker</div></div>
        <div className="kv"><div className="kv-key">AI grading</div><div>ChatGPT subscription through MCP — no OpenAI API key</div></div>
      </div></div>
      <div className="card"><div className="card-head"><div className="card-title">Grading policy</div></div><div className="card-body"><div className="callout">Defect-first: inspect all four reverse corners and the full perimeter before assigning grades. Centering app measurements override eyeballing. Each physical copy has its own grade history.</div></div></div>
    </div><div className="card"><div className="card-head"><div className="card-title">Valuation hierarchy</div></div><div className="card-body"><div className="kv"><div className="kv-key">1</div><div>PSA.com exact-card, exact-grade recent sales — median when 3+ usable comps</div></div><div className="kv"><div className="kv-key">2</div><div>PSA Estimate when direct sales are sparse</div></div><div className="kv"><div className="kv-key">3</div><div>PriceCharting graded value as fallback</div></div><div className="kv"><div className="kv-key">Raw</div><div>TCGplayer + PriceCharting</div></div></div></div></div>
  </div>;
}
