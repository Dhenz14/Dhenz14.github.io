import { parseJsonBytesStrict } from "./strict-json.mjs";

export const STRICT_JSON_FETCH_DEADLINE_MS = 8_000;

export class StrictJsonFetchError extends Error {
  constructor(code, message, cause = undefined) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "StrictJsonFetchError";
    this.code = code;
  }
}

const fail = (code, message, cause) => {
  throw new StrictJsonFetchError(code, message, cause);
};

function canonicalContentLength(headers, label) {
  const raw = headers?.get?.("content-length");
  if (raw === null || raw === undefined) fail("JSON_HTTP_CONTENT_LENGTH_MISSING", `${label} omitted Content-Length`);
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) fail("JSON_HTTP_CONTENT_LENGTH_MALFORMED", `${label} supplied a non-canonical Content-Length`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail("JSON_HTTP_CONTENT_LENGTH_MALFORMED", `${label} Content-Length exceeded the safe integer range`);
  return value;
}

async function readBoundedBody(response, { maximumBytes, declaredBytes, deadlineMs, controller, label }) {
  if (!response.body || typeof response.body.getReader !== "function") {
    fail("JSON_HTTP_STREAM_REQUIRED", `${label} response body is not a readable stream`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let deadlineId = 0;
  const deadline = new Promise((_, reject) => {
    deadlineId = setTimeout(() => {
      try { controller?.abort(); } catch { /* best effort */ }
      void reader.cancel("strict JSON acquisition deadline").catch(() => {});
      reject(new StrictJsonFetchError("JSON_HTTP_DEADLINE_EXCEEDED", `${label} exceeded its ${deadlineMs} ms deadline`));
    }, deadlineMs);
  });
  try {
    while (true) {
      let result;
      try {
        result = await Promise.race([reader.read(), deadline]);
      } catch (error) {
        if (error instanceof StrictJsonFetchError) throw error;
        fail("JSON_HTTP_STREAM_FAILED", `${label} response stream failed`, error);
      }
      if (result.done) break;
      if (!(result.value instanceof Uint8Array) || result.value.byteLength === 0) {
        fail("JSON_HTTP_STREAM_CHUNK_INVALID", `${label} emitted an invalid stream chunk`);
      }
      received += result.value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel("strict JSON byte ceiling exceeded").catch(() => {});
        fail("JSON_HTTP_BODY_TOO_LARGE", `${label} exceeded its ${maximumBytes}-byte ceiling`);
      }
      if (received > declaredBytes) {
        await reader.cancel("strict JSON Content-Length exceeded").catch(() => {});
        fail("JSON_HTTP_CONTENT_LENGTH_MISMATCH", `${label} body exceeded its declared Content-Length`);
      }
      chunks.push(result.value);
    }
  } finally {
    clearTimeout(deadlineId);
    reader.releaseLock?.();
  }
  if (received === 0) fail("JSON_HTTP_BODY_EMPTY", `${label} response body was empty`);
  if (received !== declaredBytes) fail("JSON_HTTP_CONTENT_LENGTH_MISMATCH", `${label} body length did not match Content-Length`);
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function acquireStrictJson({
  url,
  maximumBytes,
  expectedBytes = null,
  expectedSha256 = null,
  label = "JSON resource",
  deadlineMs = STRICT_JSON_FETCH_DEADLINE_MS,
  fetchImpl = globalThis.fetch,
  sha256 = null,
  validate = null,
} = {}) {
  if (typeof url !== "string" || !url || typeof fetchImpl !== "function") fail("JSON_HTTP_ARGUMENT_INVALID", `${label} acquisition arguments are invalid`);
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) fail("JSON_HTTP_ARGUMENT_INVALID", `${label} maximumBytes is invalid`);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) fail("JSON_HTTP_ARGUMENT_INVALID", `${label} deadline is invalid`);
  if (expectedBytes !== null && (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > maximumBytes)) {
    fail("JSON_HTTP_ARGUMENT_INVALID", `${label} expectedBytes is invalid`);
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const startedAt = Date.now();
  let response;
  let requestDeadlineId = 0;
  try {
    response = await Promise.race([
      fetchImpl(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        ...(controller ? { signal: controller.signal } : {}),
      }),
      new Promise((_, reject) => {
        requestDeadlineId = setTimeout(() => {
          try { controller?.abort(); } catch { /* best effort */ }
          reject(new StrictJsonFetchError("JSON_HTTP_DEADLINE_EXCEEDED", `${label} exceeded its ${deadlineMs} ms deadline`));
        }, deadlineMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof StrictJsonFetchError) throw error;
    fail("JSON_HTTP_REQUEST_FAILED", `${label} request failed`, error);
  } finally {
    clearTimeout(requestDeadlineId);
  }
  if (!response?.ok) fail("JSON_HTTP_STATUS_REJECTED", `${label} returned HTTP ${response?.status ?? "UNKNOWN"}`);
  const declaredBytes = canonicalContentLength(response.headers, label);
  if (declaredBytes === 0) fail("JSON_HTTP_BODY_EMPTY", `${label} declared an empty body`);
  if (declaredBytes > maximumBytes) fail("JSON_HTTP_BODY_TOO_LARGE", `${label} declared more than ${maximumBytes} bytes`);
  if (expectedBytes !== null && declaredBytes !== expectedBytes) fail("JSON_HTTP_EXPECTED_LENGTH_MISMATCH", `${label} declared bytes drifted from the reviewed identity`);
  const remainingMs = Math.max(1, deadlineMs - (Date.now() - startedAt));
  const bytes = await readBoundedBody(response, { maximumBytes, declaredBytes, deadlineMs: remainingMs, controller, label });
  if (expectedBytes !== null && bytes.byteLength !== expectedBytes) fail("JSON_HTTP_EXPECTED_LENGTH_MISMATCH", `${label} body bytes drifted from the reviewed identity`);
  if (expectedSha256 !== null) {
    if (typeof sha256 !== "function") fail("JSON_HTTP_ARGUMENT_INVALID", `${label} requires a SHA-256 implementation`);
    const observed = await sha256(bytes);
    if (observed !== expectedSha256) fail("JSON_HTTP_SHA256_MISMATCH", `${label} SHA-256 drifted from the reviewed identity`);
  }
  let value;
  try {
    value = parseJsonBytesStrict(bytes, label);
  } catch (error) {
    if (error?.code) throw error;
    fail("JSON_HTTP_PARSE_FAILED", `${label} strict parsing failed`, error);
  }
  return validate ? await validate(value, bytes) : value;
}
