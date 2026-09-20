// WuslaHQ Spec 1 — reference verifier (Go, standard library only).
// https://wuslahq.com/specs/signed-origin-requests
//
// Run directly to check the published vectors (exit 0 iff every verdict matches):
//
//	go run verify_origin.go            # vectors sit one level up
//
// Verification order is the spec's: headers present → skew → HMAC → nonce. The
// HMAC is checked BEFORE the nonce is claimed, so an unauthenticated caller
// cannot fill your replay cache by spraying nonces.
//
// The one bug to avoid: `path` must be pathname + query string, exactly as
// received. r.URL.Path DROPS the query; use r.URL.RequestURI().
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	SignatureHeader = "x-wusla-signature"
	TimestampHeader = "x-wusla-timestamp"
	NonceHeader     = "x-wusla-nonce"
	KeyIDHeader     = "x-wusla-key-id"
)

// Sha256Hex is the lowercase hex SHA-256 of the exact body bytes (empty body → hash of "").
func Sha256Hex(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// CanonicalString is timestamp\nnonce\nMETHOD\npath-with-query\nbodySha256 — no trailing newline.
func CanonicalString(timestamp, nonce, method, pathWithQuery, bodySha256 string) string {
	return strings.Join([]string{timestamp, nonce, strings.ToUpper(method), pathWithQuery, bodySha256}, "\n")
}

// Sign returns "sha256=<hex>" — HMAC-SHA256 of the canonical string under the secret.
func Sign(secret, canonical string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(canonical))
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// Verify checks one request. reason is one of missing_header | timestamp_skew | signature | nonce_replay | "".
// seenNonces is your replay store; a map is fine for one process, use an atomic SET NX in Redis (fail closed) in production.
func Verify(secret string, headers map[string]string, method, pathWithQuery string, body []byte, skewSec int64, nowSec int64, seenNonces map[string]bool) (bool, string) {
	h := map[string]string{}
	for k, v := range headers {
		h[strings.ToLower(k)] = v
	}
	presented, timestamp, nonce := h[SignatureHeader], h[TimestampHeader], h[NonceHeader]
	if presented == "" || timestamp == "" || nonce == "" || h[KeyIDHeader] == "" {
		return false, "missing_header"
	}
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false, "timestamp_skew"
	}
	if nowSec == 0 {
		nowSec = time.Now().Unix()
	}
	if math.Abs(float64(nowSec-ts)) > float64(skewSec) {
		return false, "timestamp_skew"
	}
	expected := Sign(secret, CanonicalString(timestamp, nonce, method, pathWithQuery, Sha256Hex(body)))
	if !hmac.Equal([]byte(expected), []byte(presented)) {
		return false, "signature"
	}
	if seenNonces != nil { // claim the nonce only after the HMAC verified
		if seenNonces[nonce] {
			return false, "nonce_replay"
		}
		seenNonces[nonce] = true
	}
	return true, ""
}

type vector struct {
	Name    string            `json:"name"`
	Expect  string            `json:"expect"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Body    string            `json:"body"`
	Headers map[string]string `json:"headers"`
}

type vectorFile struct {
	TestKey string   `json:"testKey"`
	Now     int64    `json:"now"`
	SkewSec int64    `json:"skewSec"`
	Vectors []vector `json:"vectors"`
}

func main() {
	file := filepath.Join(filepath.Dir(os.Args[0]), "..", "spec-1-test-vectors.json")
	if len(os.Args) > 1 {
		file = os.Args[1]
	} else if _, err := os.Stat(file); err != nil {
		// `go run` executes from a temp build dir; fall back to the working directory.
		file = filepath.Join("..", "spec-1-test-vectors.json")
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		fmt.Println("cannot read vectors:", err)
		os.Exit(2)
	}
	var data vectorFile
	if err := json.Unmarshal(raw, &data); err != nil {
		fmt.Println("bad vectors file:", err)
		os.Exit(2)
	}
	seen := map[string]bool{} // ONE shared set, vectors in file order — that is what fails the replay vector
	failed := 0
	for _, v := range data.Vectors {
		ok, reason := Verify(data.TestKey, v.Headers, v.Method, v.Path, []byte(v.Body), data.SkewSec, data.Now, seen)
		got := "fail"
		if ok {
			got = "pass"
		}
		mark := "ok  "
		if got != v.Expect {
			mark = "MISMATCH"
			failed++
		}
		if reason != "" {
			reason = " (" + reason + ")"
		}
		fmt.Printf("%s %-4s %s%s\n", mark, v.Expect, v.Name, reason)
	}
	if failed > 0 {
		fmt.Printf("%d vector(s) mismatched\n", failed)
		os.Exit(1)
	}
	fmt.Printf("all %d vectors agree\n", len(data.Vectors))
}
