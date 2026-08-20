export function signedTusHeaders(token: string, upsert: boolean) {
  return { "x-signature": token, "x-upsert": String(upsert) };
}

export function signedStandardHeaders(upsert: boolean) {
  return { "x-upsert": String(upsert) };
}
