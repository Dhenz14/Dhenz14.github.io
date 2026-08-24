#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonBytesStrict } from "../hub-assets/strict-json.mjs";
import { parseHubFactsBytesStrict } from "./hub-facts-custody.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : String(process.argv[index + 1] || fallback);
};
const origin = option("--origin", "https://dhenz14.github.io").replace(/\/$/, "");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const proof = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
const allowlistBytes = await fs.readFile(path.join(root, ".github", "pages-public-allowlist.v1.json"));
if (allowlistBytes.byteLength === 0 || allowlistBytes.byteLength > 64 * 1024) {
  throw new Error("Pages allowlist escaped its live-parity byte envelope");
}
const allowlist = parseJsonBytesStrict(allowlistBytes, "Pages public allowlist for live parity");
if (!Array.isArray(allowlist.publicFiles)
  || !Array.isArray(allowlist.generatedQuarantineRoutes)
  || !Array.isArray(allowlist.deliberatePublicJson)
  || !Array.isArray(allowlist.forbiddenExactPaths)
  || allowlist.forbiddenExactPaths.length !== 23
  || !Array.isArray(allowlist.forbiddenPrefixes)
  || !Array.isArray(allowlist.privateSourceOnlyPaths)) {
  throw new Error("Pages allowlist is incomplete for live parity");
}
const quarantineTemplate = await fs.readFile(path.join(root, ".github", "pages-templates", "hivepoa-quarantine.html"));
const publicRoute = (relative) => {
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
};
const expectedRoutes = [
  ...allowlist.publicFiles.map((relative) => ({ route: publicRoute(relative), relative })),
  ...allowlist.generatedQuarantineRoutes.map((relative) => ({ route: publicRoute(relative), relative, expectedBytes: quarantineTemplate })),
];
const negativeRoutes = [...new Set([
  ...allowlist.privateSourceOnlyPaths.map((relative) => `/${relative}`),
  ...allowlist.forbiddenExactPaths.map((relative) => `/${relative}`),
  ...allowlist.forbiddenPrefixes.map((prefix) => `/${prefix}__publication_probe__`),
])];

const mismatches = [];
let remoteFacts = null;
for (const { route, relative, expectedBytes } of expectedRoutes) {
  const response = await fetch(`${origin}${route}?proof=${proof}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (response.status !== 200) {
    mismatches.push(`${route}:HTTP_${response.status}`);
    continue;
  }
  if (relative.endsWith(".mjs") && !/(?:javascript|ecmascript)/i.test(response.headers.get("content-type") || "")) {
    mismatches.push(`${route}:BAD_MODULE_MIME`);
    continue;
  }
  const maximumBytes = relative === "hub-assets/hub-facts.json"
    ? 512 * 1024
    : allowlist.deliberatePublicJson.includes(relative) ? 128 * 1024 : 8 * 1024 * 1024;
  const declaredHeader = response.headers.get("content-length");
  if (declaredHeader !== null && (!/^\d+$/.test(declaredHeader) || Number(declaredHeader) > maximumBytes)) {
    mismatches.push(`${route}:DECLARED_SIZE_OUT_OF_BOUNDS`);
    continue;
  }
  const remote = Buffer.from(await response.arrayBuffer());
  if (remote.byteLength === 0
    || remote.byteLength > maximumBytes
    || (declaredHeader !== null && Number(declaredHeader) !== remote.byteLength)) {
    mismatches.push(`${route}:BODY_SIZE_OUT_OF_BOUNDS_OR_MISMATCHED`);
    continue;
  }
  const expected = expectedBytes || await fs.readFile(path.join(root, relative));
  if (!remote.equals(expected)) mismatches.push(`${route}:${hash(remote).slice(0, 12)}!=${hash(expected).slice(0, 12)}`);
  if (allowlist.deliberatePublicJson.includes(relative)) parseJsonBytesStrict(remote, `live ${relative}`);
  if (relative === "hub-assets/hub-facts.json") remoteFacts = parseHubFactsBytesStrict(remote, "live hub-facts snapshot");
}
for (const route of negativeRoutes) {
  const response = await fetch(`${origin}${route}?proof=${proof}`, {
    cache: "no-store",
    redirect: "manual",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (response.status !== 404 && response.status !== 410) mismatches.push(`${route}:EXPECTED_404_OR_410_GOT_${response.status}`);
}
if (mismatches.length) throw new Error(`live Pages parity failed: ${mismatches.join(", ")}`);

const localFacts = parseHubFactsBytesStrict(
  await fs.readFile(path.join(root, "hub-assets", "hub-facts.json")),
  "local live-parity hub-facts snapshot",
);
if (!remoteFacts || remoteFacts.snapshotHash !== localFacts.snapshotHash) {
  throw new Error("live hub-facts strict parse did not match the local snapshot identity");
}
console.log(`LIVE_PARITY_OK origin=${origin} positive=${expectedRoutes.length} negative=${negativeRoutes.length} source=${localFacts.hiveAi.sourceCommit.slice(0, 12)}`);
