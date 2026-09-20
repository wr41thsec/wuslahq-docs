---
title: Native MCP upstream proxying
slug: native-mcp-upstream
spec: 2B
version: v1
status: live
published: 2026-08-30
updated: 2026-09-20
summary: Put your existing MCP server behind the WuslaHQ gateway. What the gateway adds, how versions and sessions are negotiated, and how to configure a listing.
---

# Spec 2B — Native MCP upstream proxying

- **Status:** Implemented and live
- **Applies to:** listings with `upstream_kind = 'mcp'`

## What 2B is

Spec 2 offered two shapes. **2A** wraps a REST API and synthesises an MCP tool surface from its OpenAPI document. **2B** — this one — fronts an MCP server you already run: your `/mcp` endpoint sits behind the WuslaHQ gateway, and buyers reach it as a listed, metered, key-authenticated tool.

Choose 2B when you already speak MCP. Nothing about your tool surface is reinterpreted: `tools/list` is *your* list, `tools/call` is *your* call.

## What the gateway adds

Buyer traffic runs the full pipeline before it reaches you — the same one every REST listing uses:

```
requireKey → resolveKey → sandbox → resolveRoute → checkStatus
           → checkScope → checkSpend → rateLimit → proxy → record
```

Concretely: API-key authentication, per-key scopes, per-period request and dollar caps, sliding-window rate limits (per key, and per session for MCP), SSRF-guarded egress with DNS pinning, and usage logging. Your origin sees a **signed** request (Spec 1) and, if configured, forwarded BYOK credentials (Spec 3).

Discovery is metered too. `tools/list` is signed exactly like `tools/call` — an origin that rejects unsigned requests will not see discovery fail.

### Buyer-scoped discovery

`tools/list` results are cached keyed by a **hash of the buyer's BYOK credential values**. Two buyers presenting different credentials never share a cached catalogue, so a surface that varies per credential stays correct. Only the fingerprint is stored — never the credential values.

The TTL depends on whether the request carried BYOK credentials at all:

| Request | Cache TTL |
|---|---|
| Carries BYOK credentials | **60s** — short, because the catalogue is buyer-specific and may change when their upstream entitlements do |
| No BYOK credentials | **600s** — the catalogue is the same for everyone, so it is safe to hold longer |

## Protocol versions

| Version | Behaviour |
|---|---|
| `2025-06-18` | Default. Stateless — no session header, no session state. |
| `2025-11-25` | Sessions, opt-in by negotiation (below). |

The version is **negotiated, not asserted**: the transport reports what the client requested, rather than echoing a constant.

Two different mechanisms carry the version, and they answer an unknown value differently. This is the MCP specification's own split, not ours:

| Where | Unknown value | Why |
|---|---|---|
| `protocolVersion` in the `initialize` **body** | `200`, and the result carries the version we *will* speak (`2025-06-18`) | The spec: "If the server supports the requested protocol version, it MUST respond with the same version. **Otherwise, the server MUST respond with another protocol version it supports.**" Rejecting instead would be non-compliant. A client that cannot accept what comes back SHOULD disconnect. |
| `MCP-Protocol-Version` **header** on later requests | **`400`** | The spec requires an unsupported value on this header to be refused. |

## Streamable HTTP session lifecycle (2025-11-25)

Sessions engage **only** when a client sends `initialize` with `protocolVersion: "2025-11-25"`. Any older revision, or none, keeps the stateless behaviour byte for byte — so this is not a breaking change for existing clients.

| Step | Behaviour |
|---|---|
| `initialize` | Response carries **`MCP-Session-Id`**. The id is cryptographically random hex (satisfies the spec's visible-ASCII requirement). |
| `notifications/initialized` | Accepted, `202`, no body. |
| Subsequent requests | Send `MCP-Session-Id`. Accepted for `tools/list`, `tools/call`, and the rest. |
| Missing session header, **and** the request declares `MCP-Protocol-Version: 2025-11-25` | **`400`** — the spec's answer for a server that requires a session. |
| Missing session header **and** no `MCP-Protocol-Version` header | **`200`**, served statelessly — see below. |
| Unknown or expired id | **`404`** — the spec's *re-initialize* signal. Treat it as "start a new `initialize`", **not** as "you are unauthorised". |
| `DELETE` with the header | **`204`**. The session is gone. |
| Reusing a deleted id | **`404`**. |

### A session does not attach to your API key

The `400` above is triggered by **the version the request declares**, not by the fact that you hold a session somewhere. Having initialized a `2025-11-25` session does not put your API key into a session mode.

So a `tools/list` sent with a valid key, no `MCP-Session-Id`, and no `MCP-Protocol-Version` is answered **`200`, statelessly** — even while a session you created earlier is still alive. That follows the spec's rule that an absent version header means `2025-03-26`, and `2025-03-26` has no sessions to be missing.

This is deliberate. The gateway has no way to associate a headerless request with a session it never named, and one key is allowed to drive both a session client and a stateless one at the same time. To exercise the `400`, send `MCP-Protocol-Version: 2025-11-25` and omit `MCP-Session-Id`.

### Expiry

**30-minute TTL, sliding** — every accepted request on the session refreshes it. It is *not* a fixed 30 minutes from creation, so an active session does not expire underneath a working client.

### Binding and isolation

A session is bound to **the API key that created it and the listing slug**. A mismatch answers `404`, never `403`: a distinguishable error would let a caller probe which session ids exist.

Session state stores the key hash and a credential *fingerprint*. The plaintext API key and BYOK values are never persisted — a live credential sitting in a store for the full TTL is readable from any snapshot or backup.

### When the session store is unavailable

The `initialize` result is served **without** the header. That is deliberate and honest: the client sees it was not given a session and stays on the stateless path, rather than being handed an id that would `404` on its very next request.

## Transport

Streamable HTTP is the only transport: `POST https://api.wuslahq.com/mcp/<listing-slug>`. There is no WebSocket endpoint.

Per-session rate-limit sub-buckets apply on top of the per-key buckets, so one runaway session cannot consume a key's whole allowance. The per-key cap is always enforced regardless.

## Not implemented

`resources/*` and `prompts/*` return `-32601 Method not found`. Only the tools surface is proxied today.

## Configuring a 2B listing

| Field | Value |
|---|---|
| `upstream_kind` | `'mcp'` |
| `mcp_upstream_url` | your MCP endpoint |
| `origin_signing_secret` / `origin_signing_key_id` | Spec 1 |
| `byok_passthrough_headers` | Spec 3, if your tools need buyer credentials |

The upstream URL is validated by the same SSRF guard as any other listing: public http(s) only, no loopback, private, link-local or CGNAT addresses, no single-label hostnames, and DNS is **pinned at connect time** so a name cannot be re-resolved to an internal address between validation and connection.
