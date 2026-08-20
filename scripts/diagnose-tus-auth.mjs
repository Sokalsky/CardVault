#!/usr/bin/env node
/**
 * CardVault — Supabase TUS upload auth diagnostic
 * ------------------------------------------------
 * Purpose: find out exactly which header combination the Supabase storage
 * TUS (resumable upload) endpoint accepts for this project, and reproduce /
 * explain the production "400 Invalid Compact JWS" failure.
 *
 * HOW TO RUN (PowerShell, from the repo root):
 *
 *   $env:SUPABASE_URL              = "https://YOUR-REF.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service role / secret key>"
 *   # optional but very useful if the project has one (Settings -> API keys):
 *   $env:SUPABASE_ANON_KEY         = "<anon / publishable key>"
 *   $env:MEDIA_BUCKET              = "grading-media"   # or your bucket
 *   node scripts/diagnose-tus-auth.mjs
 *
 * What it does:
 *   1. Uses the service key (exactly like the web server) to mint signed
 *      upload tokens for scratch paths under diagnostics/ in the bucket.
 *   2. Attempts a TUS upload creation with several header combinations, on
 *      both the dedicated storage host and the project API host.
 *   3. For every combination that gets past creation, uploads a 16-byte file
 *      to completion, verifies it exists, then deletes it.
 *   4. Also tests the plain signed-URL PUT (the small-photo path).
 *
 * Safety: only writes tiny files under diagnostics/ in the media bucket and
 * deletes them afterwards. Never prints key material — only key shape.
 */

const SUPABASE_URL = trim(process.env.SUPABASE_URL);
const SERVICE_KEY = trim(process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANON_KEY = trim(process.env.SUPABASE_ANON_KEY);
const BUCKET = trim(process.env.MEDIA_BUCKET) || "grading-media";

function trim(v) { return (v || "").trim(); }

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see header of this file).");
  process.exit(1);
}

const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
const HOSTS = {
  storageHost: `https://${ref}.storage.supabase.co/storage/v1`,
  apiHost: `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1`,
};

function keyShape(key) {
  if (!key) return "(not provided)";
  if (key.startsWith("eyJ")) return `legacy JWT (${key.split(".").length} segments, starts eyJ...)`;
  if (key.startsWith("sb_publishable_")) return "NEW publishable key (sb_publishable_..., NOT a JWT)";
  if (key.startsWith("sb_secret_")) return "NEW secret key (sb_secret_..., NOT a JWT)";
  return `unrecognized format (starts "${key.slice(0, 4)}...", length ${key.length})`;
}

function decodeJwtNoVerify(token) {
  try {
    const dec = (s) => JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const [h, p] = token.split(".");
    return { header: dec(h), payload: dec(p) };
  } catch {
    return null;
  }
}

const PAYLOAD = Buffer.from("cardvault-diag\n\n"); // 16 bytes

async function req(url, options = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.text();
    return { status: res.status, body, headers: res.headers };
  } catch (error) {
    return { status: 0, body: `NETWORK ERROR: ${error?.cause?.code || error.message}`, headers: new Headers() };
  } finally {
    clearTimeout(t);
  }
}

const short = (s, n = 250) => (s || "").replace(/\s+/g, " ").slice(0, n);

/** Mint a signed upload token via the service key (what the web server does). */
async function signUploadPath(path) {
  const r = await req(`${HOSTS.apiHost}/object/upload/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (r.status !== 200) return { error: `sign failed: HTTP ${r.status} ${short(r.body)}` };
  try {
    const parsed = JSON.parse(r.body);
    const match = /[?&]token=([^&]+)/.exec(String(parsed.url || ""));
    if (!match) return { error: `no token in sign response: ${short(r.body)}` };
    return { token: decodeURIComponent(match[1]) };
  } catch (error) {
    return { error: `sign parse failed: ${error.message} :: ${short(r.body)}` };
  }
}

function tusMetadata(objectName, contentType) {
  const enc = (v) => Buffer.from(v).toString("base64");
  return [
    `bucketName ${enc(BUCKET)}`,
    `objectName ${enc(objectName)}`,
    `contentType ${enc(contentType)}`,
    `cacheControl ${enc("3600")}`,
  ].join(",");
}

async function tusCreate(base, objectName, extraHeaders) {
  return req(`${base}/upload/resumable`, {
    method: "POST",
    headers: {
      "tus-resumable": "1.0.0",
      "upload-length": String(PAYLOAD.length),
      "upload-metadata": tusMetadata(objectName, "application/octet-stream"),
      "x-upsert": "true",
      ...extraHeaders,
    },
  });
}

async function tusPatch(location, extraHeaders) {
  return req(location, {
    method: "PATCH",
    headers: {
      "tus-resumable": "1.0.0",
      "upload-offset": "0",
      "content-type": "application/offset+octet-stream",
      ...extraHeaders,
    },
    body: PAYLOAD,
  });
}

async function objectExists(path) {
  const r = await req(`${HOSTS.apiHost}/object/authenticated/${BUCKET}/${path}`, {
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  return r.status === 200;
}

async function deleteObject(path) {
  await req(`${HOSTS.apiHost}/object/${BUCKET}/${path}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
}

function absoluteLocation(location, base) {
  if (!location) return null;
  try {
    return location.startsWith("http") ? location : new URL(location, `${base}/upload/resumable/`).toString();
  } catch {
    return null;
  }
}

async function runCombo(name, hostKey, headerFactory) {
  const objectName = `diagnostics/tus-${name.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}.bin`;
  const signed = await signUploadPath(objectName);
  if (signed.error) return `SETUP FAILED — ${signed.error}`;
  const headers = headerFactory(signed.token);
  const create = await tusCreate(HOSTS[hostKey], objectName, headers);
  const location = absoluteLocation(create.headers.get("location"), HOSTS[hostKey]);

  let outcome = `create: HTTP ${create.status}`;
  if (create.status === 201 && location) {
    const patch = await tusPatch(location, headers);
    outcome += ` | data: HTTP ${patch.status}`;
    if (patch.status === 204) {
      outcome += (await objectExists(objectName)) ? " | object verified OK" : " | object NOT found (!)";
      await deleteObject(objectName);
    } else {
      outcome += ` | body: ${short(patch.body, 200)}`;
    }
  } else {
    outcome += ` | body: ${short(create.body)}`;
  }
  return outcome;
}

async function testSignedPut() {
  const objectName = "diagnostics/put-test.bin";
  const signed = await signUploadPath(objectName);
  if (signed.error) return `SETUP FAILED — ${signed.error}`;
  const url = `${HOSTS.apiHost}/object/upload/sign/${BUCKET}/${objectName}?token=${encodeURIComponent(signed.token)}`;
  const r = await req(url, {
    method: "PUT",
    headers: { "x-upsert": "true", "content-type": "application/octet-stream" },
    body: PAYLOAD,
  });
  let out = `PUT: HTTP ${r.status}`;
  if (r.status === 200) {
    out += (await objectExists(objectName)) ? " | object verified OK" : " | object NOT found (!)";
    await deleteObject(objectName);
  } else {
    out += ` | body: ${short(r.body)}`;
  }
  return out;
}

const combos = [
  ["A x-signature only (current prod behavior)", (token) => ({ "x-signature": token })],
  ["B x-signature + auth=uploadToken", (token) => ({ "x-signature": token, authorization: `Bearer ${token}` })],
  ...(ANON_KEY ? [
    ["C x-signature + auth=anonKey", (token) => ({ "x-signature": token, authorization: `Bearer ${ANON_KEY}` })],
    ["D x-signature + auth+apikey=anonKey", (token) => ({ "x-signature": token, authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY })],
  ] : []),
  ["E control: auth=serviceKey (server-only)", () => ({ authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY })],
];

console.log("CardVault TUS auth diagnostic");
console.log("=============================");
console.log(`project ref:        ${ref}`);
console.log(`bucket:             ${BUCKET}`);
console.log(`service key shape:  ${keyShape(SERVICE_KEY)}`);
console.log(`anon key shape:     ${keyShape(ANON_KEY)}`);
if (!ANON_KEY) console.log("(combos C/D skipped — set SUPABASE_ANON_KEY to include them)");

const probe = await signUploadPath("diagnostics/probe.bin");
if (probe.error) {
  console.log(`\nCannot mint signed upload tokens at all: ${probe.error}`);
  console.log("Fix that first (service key / URL / bucket name), then re-run.");
  process.exit(1);
}
const decoded = decodeJwtNoVerify(probe.token);
console.log(`upload token shape: ${probe.token.split(".").length} segments; header=${JSON.stringify(decoded?.header)}; payload keys=${Object.keys(decoded?.payload || {}).join(",")}`);

for (const hostKey of ["storageHost", "apiHost"]) {
  console.log(`\n--- host: ${hostKey} = ${HOSTS[hostKey]} ---`);
  for (const [name, factory] of combos) {
    console.log(`  ${name.padEnd(45)} ${await runCombo(name, hostKey, factory)}`);
  }
}

console.log(`\n--- signed-URL PUT (small photo path, no auth header) ---`);
console.log(`  ${await testSignedPut()}`);

console.log("\nDone. Paste this ENTIRE output back to Claude (it contains no secrets).");
