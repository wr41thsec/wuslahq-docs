---
title: BYOK credential passthrough
slug: byok-passthrough
spec: 3
version: v1
status: live
published: 2026-08-30
updated: 2026-09-20
summary: How a buyer's own upstream credential reaches your origin through the gateway, why it is a per-listing allowlist, and which header names can never be forwarded.
---

# Spec 3 — BYOK credential passthrough

- **Status:** Implemented and live

## What it solves

Some APIs are metered by the *buyer's* own third-party credential, not the seller's. A financial-data tool where each buyer brings their own upstream token is the canonical case: the seller runs the service, but the buyer's own quota is what gets consumed.

BYOK lets a buyer send that credential with each request and have WuslaHQ forward it to the seller's origin — without WuslaHQ ever storing it, and without the seller being able to reach anything else the buyer holds.

## The rule that surprises people

> **BYOK passthrough is a per-listing allowlist, not a general passthrough.**

The gateway forwards **only** the header names the seller declared on that listing, and drops every other buyer-supplied header before the request leaves. A header that is not on the listing's allowlist is silently dropped — correctly, by design.

The practical consequence: sending `X-Upstream-Token` to a listing whose allowlist contains only `X-Demo-Token` results in **nothing being forwarded**. That is the allowlist working, not the forwarder failing. No combination of gateway auth mode (`Authorization: Bearer` vs `X-API-Key`) or protocol version changes it.

## Configuring the allowlist

Field: `apis.byok_passthrough_headers` — a `TEXT[]` on the listing.

| Constraint | Value |
|---|---|
| Maximum names | **10** |
| Name format | letters, digits, hyphens (`^[A-Za-z0-9-]{1,64}$`) |
| Matching | case-insensitive |

Validated at **write time** (when the listing is saved) *and* again at **request time** (on every forwarded call). Both, deliberately: a row written before a rule existed must not become an exploit.

## Two classes of header are always refused

Neither can be allowlisted, at either enforcement point.

**1. `x-wusla-*` — gateway-reserved.**
Otherwise a *buyer* could overwrite the Spec 1 signing headers and forge "this request came from WuslaHQ" to your origin. The whole point of Spec 1 is that only the gateway can produce those headers.

**2. `authorization`, `x-api-key`, `cookie`, `proxy-authorization`, `set-cookie`, `host` — credential headers.**
Otherwise a malicious *seller* could type them into the BYOK field on their own listing and harvest every buyer's live WuslaHQ key. BYOK is applied **after** hop-by-hop stripping, so an allowlist entry would re-add exactly what the strip list just removed. The blast radius is why this is a hard denylist rather than a warning: a harvested master (Key Mesh) key is not scoped to one listing, so a single malicious listing would expose that buyer's entire subscription portfolio.

Sellers are semi-trusted third parties filling in a self-serve form. The rules hold regardless of what they type.

## Handling of values

- **Forwarded** to the origin, verbatim.
- **Never stored.** No database column holds a BYOK value.
- **Never cached.** The `tools/list` discovery cache is keyed by a *hash* of the values; the values themselves are not in it.
- **Never logged.**
- For MCP sessions, only a hash **fingerprint** is persisted — enough to keep two buyers' cached catalogues apart, not enough to reconstruct the credential.

There is **no enrolment step**. Nothing is bound in a dashboard, and no per-buyer setup exists. The buyer sends the header on every request; the gateway forwards it if the listing allows that name. An API key needs no preparation to use BYOK.

## Verifying it end to end

The sandbox origin's `echo_request` tool reports **the listing's allowlist and which of those headers actually arrived**, both by name:

```json
{
  "byokReceived":  ["x-demo-token"],
  "byokAllowlist": ["x-demo-token", "x-upstream-token"],
  "headers": { "x-demo-token": "marker-value" }
}
```

Read them together:

- **Your header is in `byokAllowlist` and in `byokReceived`** — passthrough worked.
- **In `byokAllowlist`, absent from `byokReceived`** — it did not arrive. Check you actually sent it, and that the request was correctly signed.
- **Absent from `byokAllowlist`** — the listing does not permit that name, so the gateway dropped it before the request left. That is the allowlist working. Ask for the name to be added.

`byokReceived` is the **intersection of the listing's allowlist with the headers received** — never a guess about which arriving headers look like credentials. Anything outside the allowlist is transit and is never reported, including headers a CDN or proxy inserts in front of the origin.

Names are reported even for headers whose *values* are not echoed: a name discloses nothing, and telling "dropped by the allowlist" apart from "arrived under a different name" is the entire diagnostic value. The reporting reuses the same predicate the gateway enforces with, so it cannot report a WuslaHQ credential header as though it were your BYOK credential.

### Minimal request

```bash
curl -sS https://api.wuslahq.com/mcp/sandbox-mcp \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <your WuslaHQ key>' \
  -H 'X-Demo-Token: marker-value-not-a-secret' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"echo_request","arguments":{}}}'
```

The sandbox listing allowlists `X-Demo-Token` for anyone to test with. To test with your production header names, ask for them to be added to the sandbox listing's allowlist.
