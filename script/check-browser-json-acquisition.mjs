import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import zlib from "node:zlib";

import { acquireStrictJson, StrictJsonFetchError } from "../hub-assets/strict-json-fetch.mjs";

const encoder = new TextEncoder();
const bytes = (value) => encoder.encode(value);
const sha256 = async (value) => crypto.createHash("sha256").update(value).digest("hex");

function responseFrom(chunks, {
  declared = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  contentType = "application/json; charset=utf-8",
  contentEncoding = null,
  status = 200,
  redirected = false,
  failAt = -1,
  stallAt = -1,
  onCancel = () => {},
  cancelNeverSettles = false,
} = {}) {
  let index = 0;
  const headers = new Map([
    ["content-type", contentType],
    ...(declared === null ? [] : [["content-length", String(declared)]]),
    ...(contentEncoding === null ? [] : [["content-encoding", contentEncoding]]),
  ]);
  const cancel = (reason) => {
    onCancel(reason);
    return cancelNeverSettles ? new Promise(() => {}) : Promise.resolve();
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected,
    headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
    body: {
      cancel,
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
          cancel,
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
  url: options.url ?? "/fixture.json",
  maximumBytes: options.maximumBytes ?? 64,
  deadlineMs: options.deadlineMs ?? 100,
  expectedBytes: options.expectedBytes ?? null,
  expectedSha256: options.expectedSha256 ?? null,
  sha256,
  fetchImpl: options.fetchImpl ?? (async () => response),
  validate: options.validate ?? null,
  label: options.label ?? "browser strict JSON fixture",
});

const exactLimit = bytes(`{"ok":true}${" ".repeat(64 - 11)}`);
assert.equal(exactLimit.byteLength, 64);
assert.equal((await acquire(responseFrom([exactLimit]), { maximumBytes: 64 })).ok, true);
const missingLengthValue = await acquire(responseFrom([bytes("{}")], { declared: null }));
assert(missingLengthValue && typeof missingLengthValue === "object" && Object.keys(missingLengthValue).length === 0, "missing Content-Length was not accepted");

let cancelledOversize = false;
let cancelledStatus = false;
let cancelledMalformedHeader = false;
const fakeCases = [
  { label: "exact_limit_admitted", code: "PASS" },
  { label: "missing_content_length_admitted", code: "PASS" },
  await expectCode("malformed_content_length", "JSON_HTTP_CONTENT_LENGTH_MALFORMED", () => acquire(responseFrom([bytes("{}")], { declared: "02", onCancel: () => { cancelledMalformedHeader = true; } }))),
  await expectCode("empty_body", "JSON_HTTP_BODY_EMPTY", () => acquire(responseFrom([], { declared: null }))),
  await expectCode("declared_identity_oversize", "JSON_HTTP_BODY_TOO_LARGE", () => acquire(responseFrom([bytes("{}")], { declared: 65 }), { maximumBytes: 64 })),
  await expectCode("one_huge_decoded_chunk", "JSON_HTTP_BODY_TOO_LARGE", () => acquire(responseFrom([bytes(`{"x":"${"a".repeat(64)}"}`)], { declared: null, onCancel: () => { cancelledOversize = true; }, cancelNeverSettles: true }), { maximumBytes: 64 })),
  await expectCode("lying_short_identity_length", "JSON_HTTP_CONTENT_LENGTH_MISMATCH", () => acquire(responseFrom([bytes("{}")], { declared: 1 }))),
  await expectCode("lying_long_identity_length", "JSON_HTTP_CONTENT_LENGTH_MISMATCH", () => acquire(responseFrom([bytes("{}")], { declared: 3 }))),
  await expectCode("expected_decoded_length_mismatch", "JSON_HTTP_EXPECTED_LENGTH_MISMATCH", () => acquire(responseFrom([bytes("{}")]), { expectedBytes: 3 })),
  await expectCode("expected_decoded_sha_mismatch", "JSON_HTTP_SHA256_MISMATCH", () => acquire(responseFrom([bytes("{}")]), { expectedSha256: "0".repeat(64) })),
  await expectCode("early_disconnect", "JSON_HTTP_STREAM_FAILED", () => acquire(responseFrom([bytes("{")], { declared: 2, failAt: 1 }))),
  await expectCode("stalled_stream_deadline", "JSON_HTTP_DEADLINE_EXCEEDED", () => acquire(responseFrom([], { declared: 2, stallAt: 0, cancelNeverSettles: true }), { deadlineMs: 20 })),
  await expectCode("stalled_fetch_deadline", "JSON_HTTP_DEADLINE_EXCEEDED", () => acquire(null, { deadlineMs: 20, fetchImpl: async () => new Promise(() => {}) })),
  await expectCode("non_ok_status", "JSON_HTTP_STATUS_REJECTED", () => acquire(responseFrom([bytes("{}")], { status: 503, onCancel: () => { cancelledStatus = true; } }))),
  await expectCode("wrong_mime", "JSON_HTTP_CONTENT_TYPE_REJECTED", () => acquire(responseFrom([bytes("{}")], { contentType: "text/plain" }))),
  await expectCode("followed_redirect", "JSON_HTTP_REDIRECT_REJECTED", () => acquire(responseFrom([bytes("{}")], { redirected: true }))),
  await expectCode("schema_drift", "JSON_HTTP_SCHEMA_INVALID", () => acquire(responseFrom([bytes("{}")]), { validate: () => { throw new Error("wrong schema"); } })),
  await expectCode("duplicate_key", "JSON_DUPLICATE_KEY", () => acquire(responseFrom([bytes('{"x":1,"x":2}')]))),
  await expectCode("normalization_collision", "JSON_NORMALIZATION_COLLISION", () => acquire(responseFrom([bytes('{"é":1,"e\\u0301":2}')]))),
  await expectCode("bom", "JSON_BOM_FORBIDDEN", () => acquire(responseFrom([new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])]))),
  await expectCode("invalid_utf8", "JSON_INVALID_UTF8", () => acquire(responseFrom([new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d])]))),
  await expectCode("unpaired_surrogate", "JSON_UNPAIRED_SURROGATE", () => acquire(responseFrom([bytes('{"x":"\\ud800"}')]))),
  await expectCode("trailing_content", "JSON_TRAILING_CONTENT", () => acquire(responseFrom([bytes("{}x")]))),
  await expectCode("non_rfc_whitespace", "JSON_EXPECTED_STRING", () => acquire(responseFrom([bytes("{\u00a0\"x\":1}")]))),
];
assert.equal(cancelledOversize, true, "over-limit decoded body was not cancelled");
assert.equal(cancelledStatus, true, "non-OK response was not cancelled");
assert.equal(cancelledMalformedHeader, true, "malformed header response was not cancelled");

const payload = Buffer.from('{"transport":"decoded","ok":true}\n');
const gzipPayload = zlib.gzipSync(payload);
const brotliPayload = zlib.brotliCompressSync(payload);
const compressionBomb = zlib.gzipSync(Buffer.from(`{"x":"${"a".repeat(2048)}"}`));
const openResponses = new Set();
const sockets = new Set();
const server = http.createServer((request, response) => {
  const route = new URL(request.url || "/", "http://127.0.0.1").pathname;
  const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (route === "/identity") {
    response.writeHead(200, { ...jsonHeaders, "content-length": payload.byteLength });
    response.end(payload);
  } else if (route === "/missing-length") {
    response.writeHead(200, jsonHeaders);
    response.write(payload.subarray(0, 8));
    response.end(payload.subarray(8));
  } else if (route === "/gzip") {
    response.writeHead(200, { ...jsonHeaders, "content-encoding": "gzip", "content-length": gzipPayload.byteLength });
    response.end(gzipPayload);
  } else if (route === "/brotli") {
    response.writeHead(200, { ...jsonHeaders, "content-encoding": "br", "content-length": brotliPayload.byteLength });
    response.end(brotliPayload);
  } else if (route === "/compression-bomb") {
    response.writeHead(200, { ...jsonHeaders, "content-encoding": "gzip", "content-length": compressionBomb.byteLength });
    response.end(compressionBomb);
  } else if (route === "/empty") {
    response.writeHead(200, { ...jsonHeaders, "content-length": 0 });
    response.end();
  } else if (route === "/status") {
    response.writeHead(503, { ...jsonHeaders, "content-length": 2 });
    response.end("{}");
  } else if (route === "/mime") {
    response.writeHead(200, { "content-type": "text/plain", "content-length": 2 });
    response.end("{}");
  } else if (route === "/early-disconnect") {
    response.writeHead(200, { ...jsonHeaders, "content-length": payload.byteLength });
    response.flushHeaders();
    response.write(payload.subarray(0, 2));
    const socket = response.socket;
    setTimeout(() => socket?.destroy(), 10);
  } else if (route === "/stall-body") {
    openResponses.add(response);
    response.on("close", () => openResponses.delete(response));
    response.writeHead(200, { ...jsonHeaders, "content-length": payload.byteLength });
    response.write(payload.subarray(0, 2));
  } else {
    response.writeHead(404, { ...jsonHeaders, "content-length": 2 });
    response.end("{}");
  }
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

let listening = false;
const actualCases = [];
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { listening = true; resolve(); });
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const decodedSha = await sha256(payload);
  for (const route of ["identity", "missing-length", "gzip", "brotli"]) {
    const value = await acquireStrictJson({
      url: `${origin}/${route}`,
      maximumBytes: payload.byteLength,
      expectedBytes: payload.byteLength,
      expectedSha256: decodedSha,
      sha256,
      deadlineMs: 1_000,
      label: `actual HTTP ${route}`,
    });
    assert.equal(value.transport, "decoded");
    assert.equal(value.ok, true);
    assert.deepEqual(Object.keys(value).sort(), ["ok", "transport"]);
    actualCases.push(route);
  }
  actualCases.push((await expectCode("actual_non_ok", "JSON_HTTP_STATUS_REJECTED", () => acquire(null, { url: `${origin}/status`, fetchImpl: fetch, deadlineMs: 1_000 }))).label);
  actualCases.push((await expectCode("actual_wrong_mime", "JSON_HTTP_CONTENT_TYPE_REJECTED", () => acquire(null, { url: `${origin}/mime`, fetchImpl: fetch, deadlineMs: 1_000 }))).label);
  actualCases.push((await expectCode("actual_empty", "JSON_HTTP_BODY_EMPTY", () => acquire(null, { url: `${origin}/empty`, fetchImpl: fetch, deadlineMs: 1_000 }))).label);
  actualCases.push((await expectCode("actual_early_disconnect", "JSON_HTTP_STREAM_FAILED", () => acquire(null, { url: `${origin}/early-disconnect`, fetchImpl: fetch, deadlineMs: 1_000 }))).label);
  actualCases.push((await expectCode("actual_stalled_body", "JSON_HTTP_DEADLINE_EXCEEDED", () => acquire(null, { url: `${origin}/stall-body`, fetchImpl: fetch, deadlineMs: 50 }))).label);
  actualCases.push((await expectCode("actual_compression_bomb_decoded_cap", "JSON_HTTP_BODY_TOO_LARGE", () => acquire(null, { url: `${origin}/compression-bomb`, fetchImpl: fetch, deadlineMs: 1_000, maximumBytes: 64 }))).label);
} finally {
  for (const response of openResponses) response.destroy();
  for (const socket of sockets) socket.destroy();
  if (listening) await new Promise((resolve) => server.close(resolve));
}

console.log(`BROWSER_JSON_ACQUISITION_OK fake_cases=${fakeCases.length} actual_http_cases=${actualCases.length} identity_missing_cl_gzip_brotli=pass decoded_ceiling=64 deadlines=bounded cancel_never_awaited=true residue=none`);
