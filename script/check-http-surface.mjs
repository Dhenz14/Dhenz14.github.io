#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = [
  "/",
  "/hub-assets/hub-facts.json",
  "/hub-assets/hub.css?v=galaxy-stark-v11",
  "/hub-assets/hub.js?v=galaxy-stark-v11",
  "/hub-assets/galaxy-core.mjs?v=galaxy-stark-v11",
  "/hub-assets/ide-release-core.mjs?v=galaxy-stark-v11",
  "/downloads/hive-ide/latest.json",
  "/downloads/hive-ide/hive-ide-release-manifest.json",
  "/robots.txt",
  "/sitemap.xml",
  "/site.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/HivePoA/",
  "/HivePoA/download/",
  "/HivePoA/verify/",
  "/HivePoA/tester-network/",
];
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

function localPath(urlValue) {
  const pathname = decodeURIComponent(new URL(urlValue, "http://127.0.0.1").pathname);
  const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  const resolved = path.resolve(root, relative);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

const server = http.createServer(async (request, response) => {
  try {
    const target = localPath(request.url || "/");
    if (!target) throw new Error("invalid path");
    const body = await fs.readFile(target);
    response.writeHead(200, { "content-type": contentTypes.get(path.extname(target)) || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }
});

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP test server did not bind to TCP");
  const origin = `http://127.0.0.1:${address.port}`;
  for (const route of routes) {
    const response = await fetch(`${origin}${route}`);
    if (response.status !== 200) throw new Error(`HTTP surface failed: ${route} -> ${response.status}`);
    if (route.includes(".mjs") && !/(?:javascript|ecmascript)/i.test(response.headers.get("content-type") || "")) {
      throw new Error(`HTTP module MIME failed: ${route}`);
    }
  }
  const rootHtml = await (await fetch(`${origin}/`)).text();
  if (!rootHtml.includes("data-galaxy-canvas") || !rootHtml.includes("data-release-console")) {
    throw new Error("root HTTP surface omitted the galaxy or signed release console");
  }
  const snapshot = await (await fetch(`${origin}/hub-assets/hub-facts.json`)).json();
  if (snapshot?.schema !== "hive.ecosystem.public-source-snapshot.v3"
    || snapshot?.snapshotVersion !== "3.0.0"
    || !/^[a-f0-9]{64}$/.test(snapshot?.snapshotHash || "")
    || snapshot?.galaxy?.geometry?.schema !== "hive.galaxy.public-geometry.v1") {
    throw new Error("HTTP snapshot or authored-geometry schema drifted");
  }
  const missing = await fetch(`${origin}/definitely-not-a-real-hive-route`);
  if (missing.status !== 404) throw new Error(`unknown HTTP route did not fail closed: ${missing.status}`);
  console.log(`HTTP_SURFACE_OK routes=${routes.length} source=${snapshot.hiveAi.sourceCommit.slice(0, 12)}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
