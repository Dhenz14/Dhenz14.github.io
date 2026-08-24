#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonBytesStrict, StrictJsonError } from "../hub-assets/strict-json.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootArgumentIndex = process.argv.indexOf("--root");
const rootArgument = rootArgumentIndex >= 0 ? process.argv[rootArgumentIndex + 1] : null;
if (!rootArgument) throw new Error("HTTP_ARTIFACT_ROOT_REQUIRED: pass --root with a freshly built reviewed Pages artifact");
const root = path.resolve(rootArgument);
if (root === repositoryRoot) throw new Error("HTTP_REPOSITORY_ROOT_FORBIDDEN: HTTP tests must target the staged artifact, not the repository");
const rootMetadata = await fs.lstat(root);
if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) throw new Error("HTTP_ARTIFACT_ROOT_INVALID: staged root must be a real directory");

const positiveRoutes = [
  "/",
  "/404.html",
  "/hub-assets/hub-facts.json",
  "/hub-assets/hub.css?v=galaxy-stark-v18",
  "/hub-assets/hub.js?v=galaxy-stark-v18",
  "/hub-assets/galaxy-core.mjs?v=galaxy-stark-v18",
  "/hub-assets/ide-release-core.mjs?v=galaxy-stark-v18",
  "/hub-assets/strict-json.mjs?v=galaxy-stark-v18",
  "/hub-assets/product-truth.json",
  "/hub-assets/product-truth-ledger.v1.json",
  "/hub-assets/og.png",
  "/downloads/hive-ide/latest.json",
  "/downloads/hive-ide/hive-ide-release-manifest.json",
  "/robots.txt",
  "/sitemap.xml",
  "/site.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/HivePoA/",
  "/HivePoA/distribution/",
  "/HivePoA/download/",
  "/HivePoA/get-started/",
  "/HivePoA/releases/",
  "/HivePoA/tester-network/",
  "/HivePoA/verify/",
  "/HivePoA/robots.txt",
  "/HivePoA/sitemap.xml",
];
const privateSourceRoutes = [
  "/.github/pages-public-allowlist.v1.json",
  "/docs/PUBLIC_GALAXY_SYNC.md",
  "/script/build-public-pages.mjs",
  "/README.md",
  "/HivePoA/README.md",
  "/HivePoA/build-receipt.json",
  "/HivePoA/hivepoa-distribution-boundary.json",
  "/HivePoA/public-surface-quarantine-receipt.json",
  "/HivePoA/tester-network/STORAGE_POA_TESTER_NETWORK_RUNBOOK_20260802.md",
];
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

const allowlistBytes = await fs.readFile(path.join(repositoryRoot, ".github", "pages-public-allowlist.v1.json"));
if (allowlistBytes.byteLength > 64 * 1024) throw new Error("Pages allowlist exceeds its HTTP-check byte ceiling");
const allowlist = parseJsonBytesStrict(allowlistBytes, "Pages public allowlist for HTTP negatives");
if (!Array.isArray(allowlist.forbiddenExactPaths) || allowlist.forbiddenExactPaths.length !== 23) {
  throw new Error("Pages allowlist must retain exactly 23 explicit fixture/retired-path negatives");
}
const forbiddenExactRoutes = allowlist.forbiddenExactPaths.map((relative) => `/${relative}`);
const negativeRoutes = [
  ...privateSourceRoutes,
  ...forbiddenExactRoutes,
  "/.github/",
  "/.github/test-fixtures/hivepoa/",
  "/fixtures/",
  "/HivePoA/cid-mirrors",
  "/HivePoA/cid-mirrors/",
  "/HivePoA/cid-mirrors/index.html",
  "/HivePoA/distribution-assets",
  "/HivePoA/distribution-assets/",
  "/HivePoA/distribution-assets/index.html",
  "/script/",
  "/tests/",
  "/definitely-not-a-real-hive-route",
];

function localPath(urlValue) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlValue, "http://127.0.0.1").pathname);
  } catch {
    return null;
  }
  if (!pathname.startsWith("/") || pathname.includes("\0") || pathname.includes("\\")) return null;
  const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  if (!relative || relative.split("/").some((part) => part === "." || part === "..")) return null;
  const resolved = path.resolve(root, ...relative.split("/"));
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

const notFoundBytes = await fs.readFile(path.join(root, "404.html"));
const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") throw new Error("method not admitted");
    const target = localPath(request.url || "/");
    if (!target) throw new Error("invalid path");
    const metadata = await fs.lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (Number.isInteger(metadata.nlink) && metadata.nlink !== 1)) throw new Error("not a single-link regular file");
    const body = await fs.readFile(target);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-length": body.byteLength,
      "content-type": contentTypes.get(path.extname(target)) || "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, {
      "cache-control": "no-store",
      "content-length": notFoundBytes.byteLength,
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : notFoundBytes);
  }
});

async function strictJsonFromHttp(origin, route, maximumBytes, label) {
  const response = await fetch(`${origin}${route}`, { headers: { Accept: "application/json" } });
  if (response.status !== 200) throw new Error(`${label} HTTP ${response.status}`);
  const declaredBytes = Number(response.headers.get("content-length"));
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 1 || declaredBytes > maximumBytes) {
    throw new Error(`${label} content-length escaped the 1..${maximumBytes} byte envelope`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== declaredBytes || bytes.byteLength > maximumBytes) throw new Error(`${label} body length drifted`);
  return parseJsonBytesStrict(bytes, label);
}

function expectStrictReject(label, bytes, expectedCode) {
  try {
    parseJsonBytesStrict(bytes, `hostile hub-facts ${label}`);
  } catch (error) {
    if (error instanceof StrictJsonError && error.code === expectedCode) return;
    throw new Error(`${label} produced ${error?.code || error?.name || typeof error}; expected ${expectedCode}`);
  }
  throw new Error(`${label} was accepted; expected ${expectedCode}`);
}

let listening = false;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      listening = true;
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP test server did not bind to TCP");
  const origin = `http://127.0.0.1:${address.port}`;
  for (const route of positiveRoutes) {
    const response = await fetch(`${origin}${route}`);
    if (response.status !== 200) throw new Error(`staged HTTP surface failed: ${route} -> ${response.status}`);
    if (route.includes(".mjs") && !/(?:javascript|ecmascript)/i.test(response.headers.get("content-type") || "")) {
      throw new Error(`HTTP module MIME failed: ${route}`);
    }
  }
  for (const route of negativeRoutes) {
    const response = await fetch(`${origin}${route}`);
    if (response.status !== 404) throw new Error(`private/retired HTTP route escaped quarantine: ${route} -> ${response.status}`);
  }

  const rootHtml = await (await fetch(`${origin}/`)).text();
  if (!rootHtml.includes("data-galaxy-canvas") || !rootHtml.includes("data-product-truth")) {
    throw new Error("root HTTP surface omitted the Atlas or Product Truth boundary");
  }
  const quarantineRoutes = positiveRoutes.filter((route) => /^\/HivePoA\/(?:$|(?:distribution|download|get-started|releases|tester-network|verify)\/)/.test(route));
  for (const route of quarantineRoutes) {
    const body = await (await fetch(`${origin}${route}`)).text();
    if (!/HOLD|quarantin|historical/i.test(body) || /<script\b/i.test(body)) {
      throw new Error(`HivePoA route is not an inert scriptless quarantine surface: ${route}`);
    }
  }

  const snapshot = await strictJsonFromHttp(origin, "/hub-assets/hub-facts.json", 512 * 1024, "HTTP hub-facts snapshot");
  if (snapshot?.schema !== "hive.ecosystem.public-source-snapshot.v3"
    || snapshot?.snapshotVersion !== "3.0.0"
    || !/^[a-f0-9]{64}$/.test(snapshot?.snapshotHash || "")
    || snapshot?.galaxy?.geometry?.schema !== "hive.galaxy.public-geometry.v1") {
    throw new Error("HTTP snapshot or authored-geometry schema drifted");
  }
  const productTruth = await strictJsonFromHttp(origin, "/hub-assets/product-truth.json", 128 * 1024, "HTTP Product Truth projection");
  const productLedger = await strictJsonFromHttp(origin, "/hub-assets/product-truth-ledger.v1.json", 32 * 1024, "HTTP Product Truth ledger");
  const ideLatest = await strictJsonFromHttp(origin, "/downloads/hive-ide/latest.json", 64 * 1024, "HTTP Hive IDE historical feed");
  const ideTruth = await strictJsonFromHttp(origin, "/downloads/hive-ide/hive-ide-release-manifest.json", 128 * 1024, "HTTP Hive IDE historical truth");
  if (productTruth.schema !== "hive.ecosystem.product-truth.public-projection.v2"
    || productLedger.schema !== "hive.ecosystem.product-truth.evidence-ledger.v1"
    || ideLatest.schema !== "hive.ide.public_release_latest.v2"
    || ideTruth.schema !== "hive.ide.public_release_truth_manifest.v2") {
    throw new Error("strict HTTP JSON schema identities drifted");
  }

  const utf8 = (value) => new TextEncoder().encode(value);
  expectStrictReject("duplicate key", utf8('{"schema":1,"schema":2}'), "JSON_DUPLICATE_KEY");
  expectStrictReject("NFC collision", utf8('{"e\\u0301":1,"é":2}'), "JSON_NORMALIZATION_COLLISION");
  expectStrictReject("BOM", new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('{"schema":1}')]), "JSON_BOM_FORBIDDEN");
  expectStrictReject("non-RFC whitespace", utf8('{\u00a0"schema":1}'), "JSON_EXPECTED_STRING");
  expectStrictReject("unpaired surrogate", utf8('{"value":"\\ud800"}'), "JSON_UNPAIRED_SURROGATE");
  expectStrictReject("trailing content", utf8('{"schema":1}x'), "JSON_TRAILING_CONTENT");
  expectStrictReject("missing value", utf8('{"schema":'), "JSON_MISSING_VALUE");
  expectStrictReject("invalid UTF-8", new Uint8Array([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d]), "JSON_INVALID_UTF8");

  console.log(`HTTP_STAGED_SURFACE_OK positive=${positiveRoutes.length} negative=${negativeRoutes.length} forbidden_exact=${forbiddenExactRoutes.length} source=${snapshot.hiveAi.sourceCommit.slice(0, 12)} hostile_json=8`);
} finally {
  if (listening) await new Promise((resolve) => server.close(resolve));
}
