#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonBytesStrict } from "../hub-assets/strict-json.mjs";
import { parseHubFactsBytesStrict } from "./hub-facts-custody.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : String(process.argv[index + 1] || fallback);
};
const expectedRoot = path.resolve(option("--expected-root", repositoryRoot));
const origin = option("--origin", "https://dhenz14.github.io").replace(/\/$/, "");
const expectedTargetSha = option("--expected-target-sha", "");
const requestDeadlineMs = Number(option("--request-deadline-ms", "15000"));
const overallDeadlineMs = Number(option("--overall-deadline-ms", "180000"));
if (!Number.isSafeInteger(requestDeadlineMs) || requestDeadlineMs < 100 || !Number.isSafeInteger(overallDeadlineMs) || overallDeadlineMs < requestDeadlineMs) {
  throw new Error("live parity deadlines are invalid");
}
if (expectedTargetSha) {
  if (!/^[a-f0-9]{40}$/.test(expectedTargetSha)) throw new Error("expected deployment target SHA is malformed");
  const checkedOut = execFileSync("git", ["rev-parse", "HEAD"], { cwd: expectedRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (checkedOut !== expectedTargetSha) throw new Error(`live parity expected root is ${checkedOut}, not deployed target ${expectedTargetSha}`);
}

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const proof = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
const overallStartedAt = Date.now();
const allowlistBytes = await fs.readFile(path.join(expectedRoot, ".github", "pages-public-allowlist.v1.json"));
if (allowlistBytes.byteLength === 0 || allowlistBytes.byteLength > 64 * 1024) throw new Error("Pages allowlist escaped its live-parity byte envelope");
const allowlist = parseJsonBytesStrict(allowlistBytes, "Pages public allowlist for live parity");
for (const name of ["publicFiles", "generatedFiles", "generatedQuarantineRoutes", "deliberatePublicJson", "forbiddenExactPaths", "forbiddenPrefixes", "privateSourceOnlyPaths"]) {
  if (!Array.isArray(allowlist[name])) throw new Error(`Pages allowlist ${name} is incomplete for live parity`);
}
if (allowlist.forbiddenExactPaths.length !== 26) throw new Error("live parity requires all 26 exact forbidden paths");

const quarantineTemplate = await fs.readFile(path.join(expectedRoot, ".github", "pages-templates", "hivepoa-quarantine.html"));
const publicRoute = (relative) => {
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
};
const generatedBytes = new Map([
  ...allowlist.generatedFiles.map((entry) => [entry.path, Buffer.from(entry.content, "utf8")]),
  ...allowlist.generatedQuarantineRoutes.map((relative) => [relative, quarantineTemplate]),
]);
const expectedMembers = [
  ...allowlist.publicFiles,
  ...allowlist.generatedFiles.map((entry) => entry.path),
  ...allowlist.generatedQuarantineRoutes,
];
if (new Set(expectedMembers).size !== expectedMembers.length) throw new Error("live parity positive membership contains duplicates");
const expectedRoutes = expectedMembers.map((relative) => ({ route: publicRoute(relative), relative }));
const negativeRoutes = [...new Set([
  ...allowlist.privateSourceOnlyPaths.map((relative) => `/${relative}`),
  ...allowlist.forbiddenExactPaths.map((relative) => `/${relative}`),
  ...allowlist.forbiddenPrefixes.flatMap((prefix) => [`/${prefix}`, `/${prefix}__publication_probe__`]),
  "/definitely-not-a-real-hive-route",
])];

const bestEffortCancel = (reader, response, reason) => {
  for (const candidate of [reader, response?.body]) {
    try {
      const pending = candidate?.cancel?.(reason);
      if (pending?.catch) void pending.catch(() => {});
    } catch { /* best effort */ }
  }
};

async function fetchBounded(route, { maximumBytes, admittedStatuses }) {
  const elapsed = Date.now() - overallStartedAt;
  const remainingOverall = overallDeadlineMs - elapsed;
  if (remainingOverall <= 0) throw new Error("LIVE_PARITY_OVERALL_DEADLINE_EXCEEDED");
  const deadlineMs = Math.min(requestDeadlineMs, remainingOverall);
  const controller = new AbortController();
  let response = null;
  let reader = null;
  let deadlineError = null;
  let rejectDeadline;
  const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => {
    deadlineError = new Error(`LIVE_PARITY_REQUEST_DEADLINE_EXCEEDED:${route}`);
    controller.abort(deadlineError);
    bestEffortCancel(reader, response, "live parity deadline");
    rejectDeadline(deadlineError);
  }, deadlineMs);
  try {
    try {
      response = await Promise.race([
        fetch(`${origin}${route}${route.includes("?") ? "&" : "?"}proof=${proof}`, {
          cache: "no-store",
          redirect: "manual",
          headers: { "cache-control": "no-cache", pragma: "no-cache" },
          signal: controller.signal,
        }),
        deadline,
      ]);
    } catch (error) {
      throw deadlineError || error;
    }
    if (!admittedStatuses.includes(response.status)) throw new Error(`${route}:HTTP_${response.status}`);
    if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error(`${route}:REDIRECT_REJECTED`);
    const declaredRaw = response.headers.get("content-length");
    let declared = null;
    if (declaredRaw !== null) {
      if (!/^(?:0|[1-9]\d*)$/.test(declaredRaw) || !Number.isSafeInteger(Number(declaredRaw))) throw new Error(`${route}:MALFORMED_CONTENT_LENGTH`);
      declared = Number(declaredRaw);
    }
    const encoding = String(response.headers.get("content-encoding") || "").trim().toLowerCase();
    const identity = encoding === "" || encoding === "identity";
    if (identity && declared !== null && declared > maximumBytes) throw new Error(`${route}:DECLARED_SIZE_OUT_OF_BOUNDS`);
    if (!response.body?.getReader) throw new Error(`${route}:STREAM_REQUIRED`);
    reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      let result;
      try { result = await Promise.race([reader.read(), deadline]); } catch (error) { throw deadlineError || error; }
      if (result.done) break;
      if (!(result.value instanceof Uint8Array) || result.value.byteLength === 0) throw new Error(`${route}:INVALID_CHUNK`);
      received += result.value.byteLength;
      if (received > maximumBytes) throw new Error(`${route}:DECODED_BODY_TOO_LARGE`);
      if (identity && declared !== null && received > declared) throw new Error(`${route}:IDENTITY_CONTENT_LENGTH_MISMATCH`);
      chunks.push(result.value);
    }
    if (identity && declared !== null && received !== declared) throw new Error(`${route}:IDENTITY_CONTENT_LENGTH_MISMATCH`);
    const body = Buffer.alloc(received);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return { response, body };
  } catch (error) {
    controller.abort(error);
    bestEffortCancel(reader, response, "live parity rejection");
    throw error;
  } finally {
    clearTimeout(timer);
    try { reader?.releaseLock?.(); } catch { /* best effort */ }
  }
}

const mismatches = [];
let remoteFacts = null;
for (const { route, relative } of expectedRoutes) {
  try {
    const maximumBytes = relative === "hub-assets/hub-facts.json"
      ? 512 * 1024
      : allowlist.deliberatePublicJson.includes(relative) ? 512 * 1024 : 8 * 1024 * 1024;
    const { response, body } = await fetchBounded(route, { maximumBytes, admittedStatuses: [200] });
    if (relative === ".nojekyll" && body.byteLength !== 0) throw new Error(`${route}:NOJEKYLL_NOT_ZERO_BYTES`);
    if (relative !== ".nojekyll" && body.byteLength === 0) throw new Error(`${route}:EMPTY_POSITIVE_BODY`);
    if ((relative.endsWith(".mjs") || relative.endsWith(".js")) && !/(?:javascript|ecmascript)/i.test(response.headers.get("content-type") || "")) {
      throw new Error(`${route}:BAD_JAVASCRIPT_MIME`);
    }
    const expected = generatedBytes.get(relative) || await fs.readFile(path.join(expectedRoot, relative));
    if (!body.equals(expected)) throw new Error(`${route}:${hash(body).slice(0, 12)}!=${hash(expected).slice(0, 12)}`);
    if (allowlist.deliberatePublicJson.includes(relative)) parseJsonBytesStrict(body, `live ${relative}`);
    if (relative === "hub-assets/hub-facts.json") remoteFacts = parseHubFactsBytesStrict(body, "live hub-facts snapshot");
  } catch (error) {
    mismatches.push(error?.message || `${route}:UNKNOWN_FAILURE`);
  }
}
for (const route of negativeRoutes) {
  try {
    await fetchBounded(route, { maximumBytes: 256 * 1024, admittedStatuses: [404, 410] });
  } catch (error) {
    mismatches.push(error?.message || `${route}:UNKNOWN_NEGATIVE_FAILURE`);
  }
}
if (mismatches.length) throw new Error(`live Pages parity failed: ${mismatches.join(", ")}`);

const localFacts = parseHubFactsBytesStrict(await fs.readFile(path.join(expectedRoot, "hub-assets", "hub-facts.json")), "local live-parity hub-facts snapshot");
if (!remoteFacts || remoteFacts.snapshotHash !== localFacts.snapshotHash) throw new Error("live hub-facts strict parse did not match the deployed target snapshot identity");
if (Date.now() - overallStartedAt > overallDeadlineMs) throw new Error("LIVE_PARITY_OVERALL_DEADLINE_EXCEEDED");
console.log(`LIVE_PARITY_OK origin=${origin} target=${expectedTargetSha || "working-tree"} positive=${expectedRoutes.length} negative=${negativeRoutes.length} forbidden_exact=${allowlist.forbiddenExactPaths.length} source=${localFacts.hiveAi.sourceCommit.slice(0, 12)} streamed=true residue=none`);
