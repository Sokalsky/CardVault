#!/usr/bin/env node
/**
 * Probe 2: verify the /upload/resumable/sign TUS route (x-signature only).
 * Reuses the same env vars as diagnose-tus-auth.mjs:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEDIA_BUCKET
 * Run: node scripts/diagnose-tus-sign-path.mjs
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const BUCKET = (process.env.MEDIA_BUCKET || "").trim() || "grading-media";
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
const HOSTS = {
  storageHost: `https://${ref}.storage.supabase.co/storage/v1`,
  apiHost: `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1`,
};
const PAYLOAD = Buffer.from("cardvault-diag2\n");
const short = (s, n = 250) => (s || "").replace(/\s+/g, " ").slice(0, n);

async function req(url, options = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
  try { const r = await fetch(url, { ...options, signal: c.signal }); return { status: r.status, body: await r.text(), headers: r.headers }; }
  catch (e) { return { status: 0, body: `NETWORK ERROR: ${e?.cause?.code || e.message}`, headers: new Headers() }; }
  finally { clearTimeout(t); }
}
const svcHeaders = { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

async function sign(path) {
  const r = await req(`${HOSTS.apiHost}/object/upload/sign/${BUCKET}/${path}`, {
    method: "POST", headers: { ...svcHeaders, "content-type": "application/json" }, body: "{}",
  });
  if (r.status !== 200) return { error: `sign failed: HTTP ${r.status} ${short(r.body)}` };
  const m = /[?&]token=([^&]+)/.exec(JSON.parse(r.body).url || "");
  return m ? { token: decodeURIComponent(m[1]) } : { error: `no token: ${short(r.body)}` };
}
const meta = (objectName) => {
  const e = (v) => Buffer.from(v).toString("base64");
  return `bucketName ${e(BUCKET)},objectName ${e(objectName)},contentType ${e("application/octet-stream")},cacheControl ${e("3600")}`;
};

async function attempt(label, base, objectName, headers) {
  const create = await req(`${base}/upload/resumable/sign`, {
    method: "POST",
    headers: { "tus-resumable": "1.0.0", "upload-length": String(PAYLOAD.length), "upload-metadata": meta(objectName), "x-upsert": "true", ...headers },
  });
  let out = `create: HTTP ${create.status}`;
  const loc = create.headers.get("location");
  const url = loc ? (loc.startsWith("http") ? loc : new URL(loc, `${base}/upload/resumable/sign/`).toString()) : null;
  if (create.status === 201 && url) {
    const patch = await req(url, {
      method: "PATCH",
      headers: { "tus-resumable": "1.0.0", "upload-offset": "0", "content-type": "application/offset+octet-stream", ...headers },
      body: PAYLOAD,
    });
    out += ` | data: HTTP ${patch.status}`;
    if (patch.status === 204) {
      const exists = (await req(`${HOSTS.apiHost}/object/authenticated/${BUCKET}/${objectName}`, { headers: svcHeaders })).status === 200;
      out += exists ? " | object verified OK" : " | object NOT found (!)";
      await req(`${HOSTS.apiHost}/object/${BUCKET}/${objectName}`, { method: "DELETE", headers: svcHeaders });
    } else out += ` | body: ${short(patch.body, 200)}`;
  } else out += ` | body: ${short(create.body)}`;
  console.log(`  ${label.padEnd(40)} ${out}`);
}

console.log(`Probe 2: /upload/resumable/sign route — bucket ${BUCKET}, ref ${ref}`);
for (const hostKey of ["storageHost", "apiHost"]) {
  console.log(`\n--- host: ${hostKey} = ${HOSTS[hostKey]} ---`);
  {
    const objectName = `diagnostics/sign-route-${hostKey}.bin`;
    const s = await sign(objectName);
    if (s.error) { console.log(`  SETUP FAILED — ${s.error}`); continue; }
    await attempt("S1 x-signature only", HOSTS[hostKey], objectName, { "x-signature": s.token });
  }
  await attempt("S2 control: no headers at all", HOSTS[hostKey], `diagnostics/sign-route-noauth.bin`, {});
}
console.log("\nDone. Paste this output back to Claude.");
