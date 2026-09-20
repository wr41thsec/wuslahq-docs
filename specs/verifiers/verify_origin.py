#!/usr/bin/env python3
"""WuslaHQ Spec 1 — reference verifier (Python, standard library only).
https://wuslahq.com/specs/signed-origin-requests

Run directly to check the published vectors (exit 0 iff every verdict matches):

    python3 verify_origin.py            # vectors sit one level up

Verification order is the spec's: headers present -> skew -> HMAC -> nonce.
The HMAC is checked BEFORE the nonce is claimed, so an unauthenticated caller
cannot fill your replay cache by spraying nonces.

The one bug to avoid: `path` must be pathname + query string, exactly as
received. Flask's `request.path` and Django's `request.path` DROP the query;
use `request.full_path` (Flask, and strip a trailing '?' it adds when there is
no query) or `request.get_full_path()` (Django).
"""
import hashlib
import hmac
import json
import os
import sys
import time

SIGNATURE_HEADER = "x-wusla-signature"
TIMESTAMP_HEADER = "x-wusla-timestamp"
NONCE_HEADER = "x-wusla-nonce"
KEY_ID_HEADER = "x-wusla-key-id"


def sha256_hex(body: bytes) -> str:
    """Lowercase hex SHA-256 of the exact body bytes (empty body -> hash of b'')."""
    return hashlib.sha256(body or b"").hexdigest()


def canonical_string(timestamp: str, nonce: str, method: str, path_with_query: str, body_sha256: str) -> str:
    """timestamp\\nnonce\\nMETHOD\\npath-with-query\\nbodySha256 - no trailing newline."""
    return "\n".join([str(timestamp), nonce, method.upper(), path_with_query, body_sha256])


def sign(secret: str, canonical: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


def verify(secret, headers, method, path_with_query, body, *, skew_sec=300, now_sec=None, seen_nonces=None):
    """Return (ok, reason). reason is one of missing_header | timestamp_skew | signature | nonce_replay | None.

    `seen_nonces` is your replay store; a set is fine for one process, use an
    atomic SET NX in Redis (fail closed) in production.
    """
    h = {str(k).lower(): v for k, v in (headers or {}).items()}
    presented, timestamp, nonce = h.get(SIGNATURE_HEADER), h.get(TIMESTAMP_HEADER), h.get(NONCE_HEADER)
    if not presented or not timestamp or not nonce or not h.get(KEY_ID_HEADER):
        return False, "missing_header"
    try:
        skew = abs((now_sec if now_sec is not None else int(time.time())) - int(timestamp))
    except ValueError:
        return False, "timestamp_skew"
    if skew > skew_sec:
        return False, "timestamp_skew"
    if isinstance(body, str):
        body = body.encode("utf-8")
    expected = sign(secret, canonical_string(timestamp, nonce, method, path_with_query, sha256_hex(body)))
    if not hmac.compare_digest(expected, str(presented)):
        return False, "signature"
    if seen_nonces is not None:              # claim the nonce only after the HMAC verified
        if nonce in seen_nonces:
            return False, "nonce_replay"
        seen_nonces.add(nonce)
    return True, None


def main(argv):
    here = os.path.dirname(os.path.abspath(__file__))
    file = argv[1] if len(argv) > 1 else os.path.join(here, "..", "spec-1-test-vectors.json")
    with open(file, encoding="utf-8") as f:
        data = json.load(f)
    seen = set()   # ONE shared set, vectors in file order - that is what fails the replay vector
    failed = 0
    for v in data["vectors"]:
        ok, reason = verify(data["testKey"], v["headers"], v["method"], v["path"], v["body"],
                            skew_sec=data["skewSec"], now_sec=data["now"], seen_nonces=seen)
        got = "pass" if ok else "fail"
        if got != v["expect"]:
            failed += 1
        print(f"{'ok  ' if got == v['expect'] else 'MISMATCH'} {v['expect']:<4} {v['name']}{f' ({reason})' if reason else ''}")
    print(f"{failed} vector(s) mismatched" if failed else f"all {len(data['vectors'])} vectors agree")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
