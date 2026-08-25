#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { acquireStrictJson } from "../hub-assets/strict-json-fetch.mjs";
import { parseJsonBytesStrict, StrictJsonError } from "../hub-assets/strict-json.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootArgumentIndex = process.argv.indexOf("--root");
const rootArgument = rootArgumentIndex >= 0 ? process.argv[rootArgumentIndex + 1] : null;
if (!rootArgument) throw new Error("HTTP_ARTIFACT_ROOT_REQUIRED: pass --root with a freshly built reviewed Pages artifact");
const root = path.resolve(rootArgument);
if (root === repositoryRoot) throw new Error("HTTP_REPOSITORY_ROOT_FORBIDDEN: HTTP tests must target the staged artifact, not the repository");
const rootMetadata = await fs.lstat(root);
if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) throw new Error("HTTP_ARTIFACT_ROOT_INVALID: staged root must be a real directory");

const allowlistBytes = await fs.readFile(path.join(repositoryRoot, ".github", "pages-public-allowlist.v1.json"));
if (allowlistBytes.byteLength === 0 || allowlistBytes.byteLength > 64 * 1024) throw new Error("Pages allowlist exceeds its HTTP-check byte ceiling");
const allowlist = parseJsonBytesStrict(allowlistBytes, "Pages public allowlist for staged HTTP");
for (const name of ["publicFiles", "generatedFiles", "generatedQuarantineRoutes", "deliberatePublicJson", "forbiddenExactPaths", "forbiddenPrefixes", "privateSourceOnlyPaths"]) {
  if (!Array.isArray(allowlist[name])) throw new Error(`Pages allowlist ${name} is missing`);
}
if (allowlist.forbiddenExactPaths.length !== 26) throw new Error("Pages allowlist must retain 26 exact publication negatives");

const publicRoute = (relative) => {
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
};
const expectedMembers = [
  ...allowlist.publicFiles,
  ...allowlist.generatedFiles.map((entry) => entry.path),
  ...allowlist.generatedQuarantineRoutes,
];
if (new Set(expectedMembers).size !== expectedMembers.length) throw new Error("public HTTP membership contains duplicates");
const positiveRoutes = expectedMembers.map((relative) => ({ relative, route: publicRoute(relative) }));
const negativeRoutes = [...new Set([
  ...allowlist.privateSourceOnlyPaths.map((relative) => `/${relative}`),
  ...allowlist.forbiddenExactPaths.map((relative) => `/${relative}`),
  ...allowlist.forbiddenPrefixes.flatMap((prefix) => [`/${prefix}`, `/${prefix}__publication_probe__`]),
  "/definitely-not-a-real-hive-route",
])];

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

function localPath(urlValue) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(urlValue, "http://127.0.0.1").pathname); } catch { return null; }
  if (!pathname.startsWith("/") || pathname.includes("\0") || pathname.includes("\\")) return null;
  const relative = pathname === "/" ? "index.html" : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
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

const sha256 = async (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const jsonMaximum = (relative) => relative === "hub-assets/hub-facts.json" ? 512 * 1024 : relative === "downloads/hive-ide/hive-ide-release-manifest.json" ? 512 * 1024 : 128 * 1024;
const strictJsonFromHttp = (origin, relative, label) => acquireStrictJson({
  url: `${origin}${publicRoute(relative)}`,
  maximumBytes: jsonMaximum(relative),
  deadlineMs: 2_000,
  sha256,
  label,
});

function expectStrictReject(label, bytes, expectedCode) {
  try { parseJsonBytesStrict(bytes, `hostile hub-facts ${label}`); } catch (error) {
    if (error instanceof StrictJsonError && error.code === expectedCode) return;
    throw new Error(`${label} produced ${error?.code || error?.name || typeof error}; expected ${expectedCode}`);
  }
  throw new Error(`${label} was accepted; expected ${expectedCode}`);
}

let listening = false;
const sockets = new Set();
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { listening = true; resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP test server did not bind to TCP");
  const origin = `http://127.0.0.1:${address.port}`;

  for (const { route, relative } of positiveRoutes) {
    const response = await fetch(`${origin}${route}`, { redirect: "manual" });
    if (response.status !== 200 || response.redirected) throw new Error(`staged HTTP surface failed: ${route} -> ${response.status} redirected=${response.redirected}`);
    const body = new Uint8Array(await response.arrayBuffer());
    if (relative === ".nojekyll" && body.byteLength !== 0) throw new Error("/.nojekyll must be a zero-byte 200 response");
    if (relative !== ".nojekyll" && body.byteLength === 0) throw new Error(`positive public member was empty: ${route}`);
    if ((relative.endsWith(".mjs") || relative.endsWith(".js")) && !/(?:javascript|ecmascript)/i.test(response.headers.get("content-type") || "")) {
      throw new Error(`HTTP JavaScript MIME failed: ${route}`);
    }
  }
  for (const route of negativeRoutes) {
    const response = await fetch(`${origin}${route}`, { redirect: "manual" });
    await response.arrayBuffer();
    if (response.status !== 404 || response.redirected) throw new Error(`private/retired HTTP route escaped quarantine: ${route} -> ${response.status}`);
  }

  const rootHtml = await (await fetch(`${origin}/`)).text();
  if (!rootHtml.includes("data-galaxy-canvas") || !rootHtml.includes("data-product-truth")) throw new Error("root HTTP surface omitted the Atlas or Product Truth boundary");
  for (const relative of allowlist.generatedQuarantineRoutes) {
    const body = await (await fetch(`${origin}${publicRoute(relative)}`)).text();
    if (!/HOLD|quarantin|historical/i.test(body) || /<script\b/i.test(body) || !/Runtime and product-live UNKNOWN/.test(body)) {
      throw new Error(`HivePoA route is not an inert scriptless UNKNOWN/HOLD surface: ${relative}`);
    }
  }

  const publicJson = new Map();
  for (const relative of allowlist.deliberatePublicJson) {
    publicJson.set(relative, await strictJsonFromHttp(origin, relative, `HTTP ${relative}`));
  }
  const snapshot = publicJson.get("hub-assets/hub-facts.json");
  const productTruth = publicJson.get("hub-assets/product-truth.json");
  const productLedger = publicJson.get("hub-assets/product-truth-ledger.public.v2.json");
  const ideLatest = publicJson.get("downloads/hive-ide/latest.json");
  const ideTruth = publicJson.get("downloads/hive-ide/hive-ide-release-manifest.json");
  if (snapshot?.schema !== "hive.ecosystem.public-source-snapshot.v3"
    || snapshot?.snapshotVersion !== "3.1.0"
    || !/^[a-f0-9]{64}$/.test(snapshot?.snapshotHash || "")
    || snapshot?.galaxy?.geometry?.schema !== "hive.galaxy.public-geometry.v1"
    || productTruth?.schema !== "hive.ecosystem.product-truth.public-projection.v2"
    || productLedger?.schema !== "hive.ecosystem.product-truth.public-evidence-projection.v2"
    || ideLatest?.schema !== "hive.ide.public_release_latest.v3"
    || ideTruth?.schema !== "hive.ide.public_release_truth_manifest.v3") {
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

  console.log(`HTTP_STAGED_SURFACE_OK positive=${positiveRoutes.length} negative=${negativeRoutes.length} forbidden_exact=${allowlist.forbiddenExactPaths.length} public_json=${allowlist.deliberatePublicJson.length} source=${snapshot.hiveAi.sourceCommit.slice(0, 12)} hostile_json=8 nojekyll=zero-byte`);
} finally {
  for (const socket of sockets) socket.destroy();
  if (listening) await new Promise((resolve) => server.close(resolve));
}
