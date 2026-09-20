---
title: Signed gateway → origin requests
slug: signed-origin-requests
spec: 1
version: v1
status: live
published: 2026-08-30
updated: 2026-09-20
summary: How the WuslaHQ gateway signs every request to your origin, and how your origin verifies it. Four headers, one canonical string, HMAC-SHA256.
---

# Spec 1 — Signed gateway → origin requests

- **Status:** Implemented and live · **Version:** `v1` (see [Versioning](#versioning))
- **Executable reference:** `https://api.wuslahq.com/mcp/sandbox-mcp` (see [Verifying against the sandbox](#verifying-against-the-sandbox))
- **Test vectors and reference verifiers:** published beside this spec (see [Test vectors](#test-vectors))

## Why this exists

Before this, the WuslaHQ gateway identified itself to a seller's origin with nothing but `X-Forwarded-For`. A seller's origin could not distinguish a request that came through WuslaHQ from one sent directly by anyone who had learned the `base_url` — so a buyer could call the origin directly and bypass billing entirely. That is a revenue-integrity hole for every seller.

With a per-listing shared secret, the gateway signs every upstream request and your origin rejects anything unsigned or mis-signed. **Requests that fail verification never reached WuslaHQ's metering**, so rejecting them is how you ensure you are only serving traffic you will be paid for.

## The four headers

Every gateway → origin request carries:

| Header | Value |
|---|---|
| `X-Wusla-Signature` | `sha256=<hex>` — HMAC-SHA256 of the canonical string, lowercase hex, **prefixed** |
| `X-Wusla-Timestamp` | Unix seconds, as a decimal string |
| `X-Wusla-Nonce` | 128 bits of CSPRNG randomness, lowercase hex (32 chars) |
| `X-Wusla-Key-Id` | Secret version identifier. Currently always `v1` |

The `x-wusla-` prefix is **reserved**. The gateway refuses to forward any buyer-supplied header in that namespace, so a buyer cannot forge these. See Spec 3.

## The canonical string

Five fields, joined with a single `\n` (LF), **no trailing newline**:

```
timestamp \n nonce \n METHOD \n path \n bodySha256
```

Concretely, for `POST /v1/quote?symbol=AAPL` with body `{"n":1}`:

```
1787715510
9f2c1a4be7d3480ab1c05e7d6f8a2c31
POST
/v1/quote?symbol=AAPL
b7e2...  (sha256 hex of the exact body bytes)
```

Field by field:

- **`timestamp`** — the same string sent in `X-Wusla-Timestamp`. Sign the string, not a re-parsed number.
- **`nonce`** — the same string sent in `X-Wusla-Nonce`.
- **`METHOD`** — HTTP method, **upper-cased**.
- **`path`** — see below. This is where nearly every verifier goes wrong.
- **`bodySha256`** — lowercase hex SHA-256 of the exact body bytes sent. An absent/empty body hashes the empty string: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

### `path` includes the query string

`path` is `pathname + search` — the exact forwarded path **plus query bytes**, preserving encoding, ordering, and duplicate parameters. It is scheme- and host-free.

> ⚠️ **This is the single most common integration bug.** In Go, `r.URL.Path` discards the query. In Python, `request.path` discards the query. Both do it silently, so your HMAC differs from ours on exactly the requests that carry parameters, and works on the ones that do not. Use `r.URL.RequestURI()` and `request.full_path` (or equivalent).

Duplicate parameters are preserved verbatim: `?tag=b&tag=a` is signed and forwarded as `?tag=b&tag=a` — not re-serialised, not reordered, not collapsed to `tag[]=` or `tag=b,a`. Whatever bytes we sign are the bytes we send.

## Verification algorithm

1. Read the four headers. **Reject if any is missing.**
2. `skew = |now_unix − timestamp|`. **Reject if `skew > 300`** (see [Tunables](#tunables)).
3. Rebuild the canonical string from *the request you actually received*.
4. `expected = "sha256=" + hex(HMAC_SHA256(secret, canonical))`.
5. Compare `expected` against `X-Wusla-Signature` in **constant time**.
6. Claim the nonce (below). **Reject if already seen.**

Steps 5 and 6 are ordered deliberately: **verify the HMAC before claiming the nonce**, so an unauthenticated caller cannot fill your replay cache by spraying nonces.

### Replay protection

Claim the nonce **atomically**, immediately before serving. In Redis that is a single `SET key 1 EX <ttl> NX` — never `GET`-then-`SET`, which lets two concurrent replays both observe "unseen".

Three properties your cache must have:

- **Atomic claim.** `SET NX` in one round trip.
- **Scoped key.** Namespace by listing + key-id + nonce hash. A bare nonce namespace lets one tenant's nonce block another's.
- **Fails closed.** If the store is unreachable, **refuse the request** (`503`). Serving unprotected is the failure this control exists to prevent.

A subtle one worth stating: **eviction is not an error.** If your nonce store runs an eviction policy that can drop the key (e.g. Redis `allkeys-lru`), an evicted nonce makes `SET NX` succeed and the replay is accepted as fresh — with nothing raised. Use a store or policy that cannot evict these keys (`noeviction`), and let a full store refuse writes instead.

## Tunables

| Setting | Default | Note |
|---|---|---|
| Clock skew tolerance | **±300s** | what the sandbox origin runs |
| Nonce retention | **600s** | must exceed the skew window, or a request can outlive its own replay record |

Both are configurable on the origin — these are the defaults this document publishes, and what the sandbox runs.

## Versioning

**The canonical string is frozen.** Field order, the separator, and the hashing are a published contract; third-party origins verify against them. Changing any of it silently breaks every seller who has already implemented a verifier.

A change to the contract ships as a **new spec version**, announced in the [changelog](/specs/changelog) before it is emitted, never as an edit in place. `X-Wusla-Key-Id` is a different axis: it names which generation of your listing's secret signed the request (see [Secrets](#secrets)) and says nothing about the spec version.

## Secrets

- 256-bit, hex-encoded, **per listing**.
- Shown to you once at generation, then only ever hashed over.
- Rotating replaces the secret and bumps `X-Wusla-Key-Id` at once (`v1` → `v2` → …). The previous secret stops signing immediately, so update your origin first, or expect `401`s until you do.

## Verifying against the sandbox

`https://api.wuslahq.com/mcp/sandbox-mcp` runs this exact contract and **mirrors rather than fakes**. Call `inspect_signature` and it returns the canonical string the origin reconstructed, field by field, alongside the joined form — so when your HMAC disagrees you can diff against a known-good one instead of guessing which of the five fields is wrong. A gateway key is required; ask for one and it is issued by hand.

Without a key, the [test vectors](#test-vectors) and the workbench on this page exercise the same contract offline.

## Test vectors

`spec-1-test-vectors.json` is published beside this spec. It carries a **published test key** (public by design, never a listing secret), the clock the vectors were minted against, and eleven vectors: eight that must verify and three that must be rejected (a tampered signature, a stale timestamp, a replayed nonce). Feed your verifier the vectors in file order through one shared nonce set; the replay vector only fails when the nonce set is shared.

Reference verifiers in Node, Python and Go live beside this spec and run in CI against those vectors on every change to the signer; each rejects a wrong signature, a tampered body, a stale timestamp and a replayed nonce. Copy one into your origin or use it to check yours.

## Worked example

```
secret     = 4f3c...   (256-bit hex, per listing)
timestamp  = 1787715510
nonce      = 9f2c1a4be7d3480ab1c05e7d6f8a2c31
method     = POST
path       = /sandbox-origin/mcp
body       = {"jsonrpc":"2.0","id":1,"method":"tools/list"}
bodySha256 = sha256(body bytes), lowercase hex

canonical  = "1787715510\n9f2c1a4be7d3480ab1c05e7d6f8a2c31\nPOST\n/sandbox-origin/mcp\n<bodySha256>"
signature  = "sha256=" + hex(HMAC_SHA256(secret, canonical))
```

Note the MCP hop carries a JSON-RPC body and no query string, so `path` there is literally `/sandbox-origin/mcp`. On REST listings the query string is present and **must** be included.
