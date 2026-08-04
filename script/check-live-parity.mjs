#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : String(process.argv[index + 1] || fallback);
};
const origin = option("--origin", "https://dhenz14.github.io").replace(/\/$/, "");
const paths = [
  ["/", "index.html"],
  ["/hub-assets/hub-facts.json", "hub-assets/hub-facts.json"],
  ["/hub-assets/hub.css", "hub-assets/hub.css"],
  ["/hub-assets/hub.js", "hub-assets/hub.js"],
  ["/robots.txt", "robots.txt"],
  ["/sitemap.xml", "sitemap.xml"],
  ["/site.webmanifest", "site.webmanifest"],
  ["/favicon.svg", "favicon.svg"],
  ["/favicon.ico", "favicon.ico"],
];
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const proof = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;

const mismatches = [];
for (const [publicPath, localRelative] of paths) {
  const response = await fetch(`${origin}${publicPath}?proof=${proof}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (!response.ok) {
    mismatches.push(`${publicPath}:HTTP_${response.status}`);
    continue;
  }
  const remote = Buffer.from(await response.arrayBuffer());
  const local = await fs.readFile(path.join(root, localRelative));
  if (!remote.equals(local)) mismatches.push(`${publicPath}:${hash(remote).slice(0, 12)}!=${hash(local).slice(0, 12)}`);
}
if (mismatches.length) throw new Error(`live Pages parity failed: ${mismatches.join(", ")}`);

const localFacts = JSON.parse(await fs.readFile(path.join(root, "hub-assets", "hub-facts.json"), "utf8"));
console.log(`LIVE_PARITY_OK origin=${origin} paths=${paths.length} source=${localFacts.hiveAi.sourceCommit.slice(0, 12)}`);
