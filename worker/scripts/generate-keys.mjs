// Generates a fresh VAPID keypair (for push) and a shared secret (for
// auth), in the exact format this worker and index.html expect.
//
// Run it with:  node scripts/generate-keys.mjs
//
// Nothing here is sent anywhere — it only prints to your terminal. Copy
// the public key into index.html's VAPID_PUBLIC_KEY constant, and use
// `wrangler secret put` for the other two (see the main README.md).
// Run this again any time you want to rotate every key at once; the
// three values always come as a matched set.

import { webcrypto as crypto } from "node:crypto";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

async function generateVapidKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const rawPublic = await crypto.subtle.exportKey("raw", keyPair.publicKey); // 65-byte uncompressed point
  const jwkPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const d = Buffer.from(jwkPrivate.d, "base64url"); // 32-byte scalar
  return { publicKey: b64url(rawPublic), privateKey: b64url(d) };
}

function generateSharedSecret() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

const vapid = await generateVapidKeys();
const secret = generateSharedSecret();

console.log("VAPID_PUBLIC_KEY  (paste into index.html and wrangler.toml, both fine to commit):");
console.log("  " + vapid.publicKey);
console.log();
console.log("VAPID_PRIVATE_KEY (worker secret, never commit):");
console.log("  " + vapid.privateKey);
console.log();
console.log("SHARED_SECRET     (worker secret AND paste into the app's Settings, never commit):");
console.log("  " + secret);
