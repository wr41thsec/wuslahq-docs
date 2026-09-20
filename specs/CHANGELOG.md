---
title: Spec changelog
slug: changelog
---

Every change to a published spec, newest first. A change to a contract (the canonical string, a header, a status code) ships as a new spec version and is announced here before the gateway emits it; a wording fix changes nothing on the wire.

## 2026-09-20

- **Spec 1 · v1 (wording).** Versioning now says what happens: a contract change ships as a new spec version announced here; `X-Wusla-Key-Id` names the secret generation, not the spec version. The previous sentence implied the key id carried spec changes.
- **Spec 1 · v1 (wording).** Secret rotation is a cut-over: the new secret and the bumped `X-Wusla-Key-Id` take effect at once, and the previous secret stops signing. The previous sentence promised the old secret "stays valid until you retire it", which the gateway never did. A grace window is on the roadmap.
- **Spec 1 · v1 (wording).** The sandbox reference requires a gateway key; the previous sentence said none was required. Published test vectors and the workbench cover the keyless case.
- **Spec 1 · v1 (additions).** Published `spec-1-test-vectors.json` (eleven vectors, a published test key, an injected clock) and reference verifiers in Node, Python and Go, run in CI against the live signer.
- **Spec 2B · v1 (correction).** The WebSocket transport was removed on 2026-09-19; Streamable HTTP is the only transport. The spec's WebSocket section is gone.
- **All specs.** Moved to wuslahq.com/specs from the internal docs folder; implementation file references removed from the public text.

## 2026-09-02

- **Spec 2B · v1 (correction).** An unrecognised `protocolVersion` in the `initialize` body is answered `200` with the version the gateway will speak, per the MCP specification; it is not rejected. The `400` for an unsupported `MCP-Protocol-Version` header was always correct. Reported by a design partner who tested `2099-01-01` against the live sandbox rather than trusting the document.
- **Spec 2B · v1 (clarification).** The "missing session header → 400" row now names its precondition: the request must declare `MCP-Protocol-Version: 2025-11-25`. A headerless request is served statelessly even while a session exists.
- **Spec 3 · v1 (correction).** `byokReceived` is the intersection of the listing's allowlist with the headers received. It was previously "any header not on a fixed hop-by-hop list", which reported seven CDN-inserted headers as a partner's forwarded credentials. `byokAllowlist` was added so "why was it dropped" is answerable from the response.

## 2026-08-30

- Specs 1, 2B and 3 published to a design partner as `v1`.
