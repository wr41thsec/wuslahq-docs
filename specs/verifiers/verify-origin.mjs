// WuslaHQ Spec 1 — reference verifier (JavaScript)
// https://wuslahq.com/specs/signed-origin-requests
//
// Dependency-free. Uses WebCrypto (globalThis.crypto.subtle), which exists in
// every browser and in Node 20+, so the same file runs on your origin, in CI
// against the published vectors (run-vectors.mjs), and in the workbench on the
// spec page. Everything is async because WebCrypto is.
//
// Verification order is the spec's: headers present → skew → HMAC → nonce.
// The HMAC is checked BEFORE the nonce is claimed, so an unauthenticated caller
// cannot fill your replay cache by spraying nonces.

const SIGNATURE_HEADER = 'x-wusla-signature';
const TIMESTAMP_HEADER = 'x-wusla-timestamp';
const NONCE_HEADER = 'x-wusla-nonce';
const KEY_ID_HEADER = 'x-wusla-key-id';
const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const toBytes = (body) => (body instanceof Uint8Array ? body : enc.encode(body == null ? '' : String(body)));

/** Lowercase hex SHA-256 of the exact body bytes. An absent/empty body hashes the empty string. */
export async function sha256Hex(body) {
  const bytes = toBytes(body);
  if (bytes.length === 0) return SHA256_EMPTY;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

/** `timestamp\nnonce\nMETHOD\npath-with-query\nbodySha256` — no trailing newline. */
export function canonicalString({ timestamp, nonce, method, path, bodySha256 }) {
  return [String(timestamp), nonce, String(method).toUpperCase(), path, bodySha256].join('\n');
}

/** `sha256=<hex>` — HMAC-SHA256 of the canonical string under the listing secret. */
export async function sign(secret, canonical) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return 'sha256=' + hex(await crypto.subtle.sign('HMAC', key, enc.encode(canonical)));
}

/** Constant-time string equality (same length required). */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify one request the way an origin should.
 *
 * @param {string} secret            the listing secret (or the published test key for the vectors)
 * @param {object} headers           request headers, lower-cased names
 * @param {string} method            HTTP method as received
 * @param {string} pathWithQuery     pathname + search, exactly as received (Go: r.URL.RequestURI())
 * @param {Uint8Array|string} body   the exact body bytes received
 * @param {object} [opts]
 * @param {number} [opts.skewSec=300]   clock skew tolerance
 * @param {number} [opts.nowSec]        injectable clock (the vectors carry theirs)
 * @param {Set}    [opts.seenNonces]    your replay store; a Set is fine for a single process,
 *                                      use an atomic SET NX in Redis (fail closed) in production
 * @returns {Promise<{ok: boolean, reason?: 'missing_header'|'timestamp_skew'|'signature'|'nonce_replay', canonical?: string}>}
 */
export async function verify(secret, headers, method, pathWithQuery, body, opts = {}) {
  const { skewSec = 300, nowSec = Math.floor(Date.now() / 1000), seenNonces } = opts;
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = v;
  const presented = h[SIGNATURE_HEADER];
  const timestamp = h[TIMESTAMP_HEADER];
  const nonce = h[NONCE_HEADER];
  if (!presented || !timestamp || !nonce || !h[KEY_ID_HEADER]) return { ok: false, reason: 'missing_header' };

  const skew = Math.abs(nowSec - Number(timestamp));
  if (!Number.isFinite(skew) || skew > skewSec) return { ok: false, reason: 'timestamp_skew' };

  const canonical = canonicalString({ timestamp, nonce, method, path: pathWithQuery, bodySha256: await sha256Hex(body) });
  const expected = await sign(secret, canonical);
  if (!timingSafeEqual(expected, String(presented))) return { ok: false, reason: 'signature', canonical };

  // Claim the nonce only after the HMAC verified.
  if (seenNonces) {
    if (seenNonces.has(nonce)) return { ok: false, reason: 'nonce_replay', canonical };
    seenNonces.add(nonce);
  }
  return { ok: true, canonical };
}
