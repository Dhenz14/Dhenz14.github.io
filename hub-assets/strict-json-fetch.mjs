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

function bestEffortCancel(reader, response, reason) {
  for (const candidate of [reader, response?.body]) {
    try {
      const pending = candidate?.cancel?.(reason);
      if (pending && typeof pending.catch === "function") void pending.catch(() => {});
    } catch {
      // Cancellation is cleanup, never an unbounded prerequisite for rejection.
    }
  }
}

function abortAndCancel(controller, reader, response, reason) {
  try { controller?.abort(reason); } catch { /* best effort */ }
  bestEffortCancel(reader, response, reason);
}

function optionalCanonicalContentLength(headers, label) {
  const raw = headers?.get?.("content-length");
  if (raw === null || raw === undefined) return null;
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) fail("JSON_HTTP_CONTENT_LENGTH_MALFORMED", `${label} supplied a non-canonical Content-Length`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail("JSON_HTTP_CONTENT_LENGTH_MALFORMED", `${label} Content-Length exceeded the safe integer range`);
  return value;
}

function decodedLengthMatchesContentLength(headers) {
  const raw = String(headers?.get?.("content-encoding") || "").trim().toLowerCase();
  return raw === "" || raw === "identity";
}

function assertJsonMime(headers, label) {
  const raw = String(headers?.get?.("content-type") || "").trim();
  const mediaType = raw.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json" && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType)) {
    fail("JSON_HTTP_CONTENT_TYPE_REJECTED", `${label} returned non-JSON Content-Type ${raw || "MISSING"}`);
  }
}

async function readBoundedDecodedBody(response, { maximumBytes, declaredBytes, compareDeclaredToDecoded, deadline, controller, label }) {
  if (!response.body || typeof response.body.getReader !== "function") {
    abortAndCancel(controller, null, response, "strict JSON stream required");
    fail("JSON_HTTP_STREAM_REQUIRED", `${label} response body is not a readable stream`);
  }
  const reader = response.body.getReader();
  deadline.setReader(reader, response);
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      let result;
      try {
        result = await Promise.race([reader.read(), deadline.promise]);
      } catch (error) {
        if (deadline.error()) throw deadline.error();
        if (error instanceof StrictJsonFetchError) throw error;
        abortAndCancel(controller, reader, response, "strict JSON stream failed");
        fail("JSON_HTTP_STREAM_FAILED", `${label} response stream failed`, error);
      }
      if (result.done) break;
      if (!(result.value instanceof Uint8Array) || result.value.byteLength === 0) {
        abortAndCancel(controller, reader, response, "strict JSON invalid stream chunk");
        fail("JSON_HTTP_STREAM_CHUNK_INVALID", `${label} emitted an invalid stream chunk`);
      }
      received += result.value.byteLength;
      if (received > maximumBytes) {
        abortAndCancel(controller, reader, response, "strict JSON decoded byte ceiling exceeded");
        fail("JSON_HTTP_BODY_TOO_LARGE", `${label} exceeded its ${maximumBytes}-byte decoded-body ceiling`);
      }
      if (compareDeclaredToDecoded && declaredBytes !== null && received > declaredBytes) {
        abortAndCancel(controller, reader, response, "strict JSON identity Content-Length exceeded");
        fail("JSON_HTTP_CONTENT_LENGTH_MISMATCH", `${label} decoded identity body exceeded Content-Length`);
      }
      chunks.push(result.value);
    }
  } finally {
    try { reader.releaseLock?.(); } catch { /* best effort */ }
  }
  if (received === 0) fail("JSON_HTTP_BODY_EMPTY", `${label} response body was empty`);
  if (compareDeclaredToDecoded && declaredBytes !== null && received !== declaredBytes) {
    fail("JSON_HTTP_CONTENT_LENGTH_MISMATCH", `${label} decoded identity body length did not match Content-Length`);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function createOverallDeadline({ deadlineMs, controller, label }) {
  let reader = null;
  let response = null;
  let timer = 0;
  let rejectDeadline;
  let deadlineError = null;
  const promise = new Promise((_, reject) => { rejectDeadline = reject; });
  timer = setTimeout(() => {
    const error = new StrictJsonFetchError("JSON_HTTP_DEADLINE_EXCEEDED", `${label} exceeded its ${deadlineMs} ms fetch-and-body deadline`);
    deadlineError = error;
    abortAndCancel(controller, reader, response, "strict JSON acquisition deadline");
    rejectDeadline(error);
  }, deadlineMs);
  return {
    promise,
    setReader(nextReader, nextResponse) {
      reader = nextReader;
      response = nextResponse;
    },
    error() { return deadlineError; },
    clear() { clearTimeout(timer); timer = 0; },
  };
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
  if (expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(expectedSha256)) fail("JSON_HTTP_ARGUMENT_INVALID", `${label} expectedSha256 is invalid`);

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const deadline = createOverallDeadline({ deadlineMs, controller, label });
  let response = null;
  let completed = false;
  try {
    try {
      response = await Promise.race([
        fetchImpl(url, {
          cache: "no-store",
          redirect: "error",
          headers: { Accept: "application/json" },
          ...(controller ? { signal: controller.signal } : {}),
        }),
        deadline.promise,
      ]);
    } catch (error) {
      if (deadline.error()) throw deadline.error();
      if (error instanceof StrictJsonFetchError) throw error;
      fail("JSON_HTTP_REQUEST_FAILED", `${label} request failed`, error);
    }
    deadline.setReader(null, response);
    if (!response?.ok) fail("JSON_HTTP_STATUS_REJECTED", `${label} returned HTTP ${response?.status ?? "UNKNOWN"}`);
    if (response.redirected) fail("JSON_HTTP_REDIRECT_REJECTED", `${label} followed an unexpected redirect`);
    assertJsonMime(response.headers, label);
    const declaredBytes = optionalCanonicalContentLength(response.headers, label);
    const compareDeclaredToDecoded = decodedLengthMatchesContentLength(response.headers);
    if (compareDeclaredToDecoded && declaredBytes === 0) fail("JSON_HTTP_BODY_EMPTY", `${label} declared an empty identity body`);
    if (compareDeclaredToDecoded && declaredBytes !== null && declaredBytes > maximumBytes) {
      fail("JSON_HTTP_BODY_TOO_LARGE", `${label} declared more than ${maximumBytes} decoded identity bytes`);
    }
    if (compareDeclaredToDecoded && expectedBytes !== null && declaredBytes !== null && declaredBytes !== expectedBytes) {
      fail("JSON_HTTP_EXPECTED_LENGTH_MISMATCH", `${label} declared identity bytes drifted from the reviewed decoded identity`);
    }
    const bytes = await readBoundedDecodedBody(response, {
      maximumBytes,
      declaredBytes,
      compareDeclaredToDecoded,
      deadline,
      controller,
      label,
    });
    if (expectedBytes !== null && bytes.byteLength !== expectedBytes) {
      fail("JSON_HTTP_EXPECTED_LENGTH_MISMATCH", `${label} decoded body bytes drifted from the reviewed identity`);
    }
    if (expectedSha256 !== null) {
      if (typeof sha256 !== "function") fail("JSON_HTTP_ARGUMENT_INVALID", `${label} requires a SHA-256 implementation`);
      const observed = await sha256(bytes);
      if (observed !== expectedSha256) fail("JSON_HTTP_SHA256_MISMATCH", `${label} decoded-body SHA-256 drifted from the reviewed identity`);
    }
    let value;
    try {
      value = parseJsonBytesStrict(bytes, label);
    } catch (error) {
      if (error?.code) throw error;
      fail("JSON_HTTP_PARSE_FAILED", `${label} strict parsing failed`, error);
    }
    if (validate) {
      try {
        value = await validate(value, bytes);
      } catch (error) {
        if (error?.code) throw error;
        fail("JSON_HTTP_SCHEMA_INVALID", `${label} semantic validation failed`, error);
      }
    }
    completed = true;
    return value;
  } catch (error) {
    abortAndCancel(controller, null, response, "strict JSON acquisition rejected");
    throw error;
  } finally {
    deadline.clear();
    if (!completed) abortAndCancel(controller, null, response, "strict JSON acquisition closed");
  }
}
