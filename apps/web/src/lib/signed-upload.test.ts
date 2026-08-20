import assert from "node:assert/strict";
import test from "node:test";
import { isCompactJws, requireSignedUploadJws, signedStandardHeaders, signedTusEndpoint, signedTusHeaders } from "@/lib/signed-upload";

function segment(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const signedUploadToken = `${segment({ alg: "HS256", typ: "JWT" })}.${segment({ url: "cards/test/photos/front.jpg", exp: Math.floor(Date.now() / 1000) + 120 })}.test-signature`;

test("pre-signed TUS uploads use only the server-issued JWS", () => {
  const headers = signedTusHeaders(signedUploadToken, true);
  assert.equal(headers["x-signature"], signedUploadToken);
  assert.equal("authorization" in headers, false);
  assert.equal("apikey" in headers, false);
});

test("signed TUS upload credentials fail locally unless they are a compact JWS", () => {
  for (const invalid of [undefined, null, "", "sb_publishable_example", "Bearer eyJ.test.value", "header.payload.signature"]) {
    assert.equal(isCompactJws(invalid), false);
    assert.throws(() => signedTusHeaders(invalid, false), /rejected locally/);
  }
});

test("expired compact JWS credentials fail before a Storage request", () => {
  const expired = `${segment({ alg: "HS256", typ: "JWT" })}.${segment({ exp: 1 })}.test-signature`;
  assert.throws(() => requireSignedUploadJws(expired), /rejected locally/);
});

test("pre-signed resumable uploads target the signed TUS route, not the authenticated one", () => {
  const endpoint = signedTusEndpoint("https://example-ref.supabase.co");
  assert.equal(endpoint, "https://example-ref.storage.supabase.co/storage/v1/upload/resumable/sign");
  // The authenticated route rejects credential-free uploads with "Invalid Compact JWS".
  assert.equal(endpoint.endsWith("/upload/resumable"), false);
});

test("standard signed uploads do not send browser Supabase credentials", () => {
  const headers = signedStandardHeaders(false);
  assert.equal("authorization" in headers, false);
  assert.equal("apikey" in headers, false);
});
