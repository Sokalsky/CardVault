import assert from "node:assert/strict";
import test from "node:test";
import { signedStandardHeaders, signedTusHeaders } from "@/lib/signed-upload";

test("pre-signed TUS uploads use only the server-issued JWS", () => {
  const headers = signedTusHeaders("header.payload.signature", true);
  assert.equal(headers["x-signature"], "header.payload.signature");
  assert.equal("authorization" in headers, false);
  assert.equal("apikey" in headers, false);
});

test("standard signed uploads do not send browser Supabase credentials", () => {
  const headers = signedStandardHeaders(false);
  assert.equal("authorization" in headers, false);
  assert.equal("apikey" in headers, false);
});
