import assert from "node:assert/strict";
import crypto from "node:crypto";

import { acquireStrictJson, StrictJsonFetchError } from "../hub-assets/strict-json-fetch.mjs";

const encoder = new TextEncoder();
const bytes = (value) => encoder.encode(value);
const sha256 = async (value) => crypto.createHash("sha256").update(value).digest("hex");

function responseFrom(chunks, { declared = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0), status = 200, failAt = -1, stallAt = -1, onCancel = () => {} } = {}) {
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "content-length" ? declared : null },
    body: {
      getReader() {
        return {
          async read() {
            if (index === stallAt) return new Promise(() => {});
            if (index === failAt) throw new Error("simulated disconnect");
            if (index >= chunks.length) return { done: true, value: undefined };
            const value = chunks[index];
            index += 1;
            return { done: false, value };
          },
          async cancel(reason) { onCancel(reason); },
          releaseLock() {},
        };
      },
    },
  };
}

async function expectCode(label, code, callback) {
  try { await callback(); } catch (error) {
    assert(error instanceof StrictJsonFetchError || typeof error?.code === "string", `${label} threw an untyped error`);
    assert.equal(error.code, code, `${label} returned ${error.code}; expected ${code}`);
    return { label, code };
  }
  throw new Error(`${label} did not fail`);
}

const acquire = (response, options = {}) => acquireStrictJson({
  url: "/fixture.json",
  maximumBytes: options.maximumBytes ?? 64,
  deadlineMs: options.deadlineMs ?? 40,
  expectedBytes: options.expectedBytes ?? null,
  expectedSha256: options.expectedSha256 ?? null,
  sha256,
  fetchImpl: options.fetchImpl ?? (async () => response),
  label: options.label ?? "browser strict JSON fixture",
});

const exactLimit = bytes(`{"ok":true}${" ".repeat(64 - 11)}`);
assert.equal(exactLimit.byteLength, 64);
const exact = await acquire(responseFrom([exactLimit]), { maximumBytes: 64 });
assert.equal(exact.ok, true);

let cancelledOversize = false;
const tests = [
  { label: "exact_limit_admitted", code: "PASS" },
  await expectCode("missing_content_length", "JSON_HTTP_CONTENT_LENGTH_MISSING", () => acquire(responseFrom([bytes("{}")], { declared: null }))),
  await expectCode("malformed_content_length", "JSON_HTTP_CONTENT_LENGTH_MALFORMED", () => acquire(responseFrom([bytes("{}")], { declared: "02" }))),
  await expectCode("empty_body", "JSON_HTTP_BODY_EMPTY", () => acquire(responseFrom([], { declared: 0 }))),
  await expectCode("declared_oversize", "JSON_HTTP_BODY_TOO_LARGE", () => acquire(responseFrom([bytes("{}")], { declared: 65 }), { maximumBytes: 64 })),
  await expectCode("limit_plus_one_stream_cancelled", "JSON_HTTP_BODY_TOO_LARGE", () => acquire(responseFrom([bytes(`{"x":"${"a".repeat(58)}"}`)], { declared: 64, onCancel: () => { cancelledOversize = true; } }), { maximumBytes: 64 })),
  await expectCode("lying_short_length", "JSON_HTTP_CONTENT_LENGTH_MISMATCH", () => acquire(responseFrom([bytes("{}")], { declared: 1 }))),
  await expectCode("lying_long_length", "JSON_HTTP_CONTENT_LENGTH_MISMATCH", () => acquire(responseFrom([bytes("{}")], { declared: 3 }))),
  await expectCode("expected_length_mismatch", "JSON_HTTP_EXPECTED_LENGTH_MISMATCH", () => acquire(responseFrom([bytes("{}")]), { expectedBytes: 3 })),
  await expectCode("expected_sha_mismatch", "JSON_HTTP_SHA256_MISMATCH", () => acquire(responseFrom([bytes("{}")]), { expectedSha256: "0".repeat(64) })),
  await expectCode("early_disconnect", "JSON_HTTP_STREAM_FAILED", () => acquire(responseFrom([bytes("{")], { declared: 2, failAt: 1 }))),
  await expectCode("stalled_stream_deadline", "JSON_HTTP_DEADLINE_EXCEEDED", () => acquire(responseFrom([], { declared: 2, stallAt: 0 }), { deadlineMs: 15 })),
  await expectCode("stalled_fetch_deadline", "JSON_HTTP_DEADLINE_EXCEEDED", () => acquire(null, { deadlineMs: 15, fetchImpl: async () => new Promise(() => {}) })),
  await expectCode("duplicate_key", "JSON_DUPLICATE_KEY", () => acquire(responseFrom([bytes('{"x":1,"x":2}')]))),
  await expectCode("normalization_collision", "JSON_NORMALIZATION_COLLISION", () => acquire(responseFrom([bytes('{"é":1,"e\\u0301":2}')]))),
  await expectCode("bom", "JSON_BOM_FORBIDDEN", () => acquire(responseFrom([new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])]))),
  await expectCode("invalid_utf8", "JSON_INVALID_UTF8", () => acquire(responseFrom([new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d])]))),
  await expectCode("unpaired_surrogate", "JSON_UNPAIRED_SURROGATE", () => acquire(responseFrom([bytes('{"x":"\\ud800"}')]))),
  await expectCode("trailing_content", "JSON_TRAILING_CONTENT", () => acquire(responseFrom([bytes("{}x")]))),
  await expectCode("non_rfc_whitespace", "JSON_EXPECTED_STRING", () => acquire(responseFrom([bytes("{\u00a0\"x\":1}")]))),
];
assert.equal(cancelledOversize, true, "limit+1 body was not cancelled");
console.log(`BROWSER_JSON_ACQUISITION_OK cases=${tests.length} exact_limit=64 deadline_ms=15 cancel_limit_plus_one=true`);
