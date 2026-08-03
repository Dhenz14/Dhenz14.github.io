import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const requireMatch = (value, pattern, label) => {
  if (!pattern.test(value)) throw new Error(`${label} contract missing`);
};

const required = [
  "index.html",
  "404.html",
  "README.md",
  "hub-assets/hub.css",
  "hub-assets/hub.js",
  "hub-assets/hub-facts.json",
  "hub-assets/og.png",
  "HivePoA/index.html",
  "HivePoA/download/index.html",
  "HivePoA/verify/index.html",
  "HivePoA/releases/index.html",
  "HivePoA/get-started/index.html",
  "HivePoA/tester-network/index.html",
  "HivePoA/distribution-assets/tester-network-authorization.js",
];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`required hub path missing: ${relative}`);
}

const html = read("index.html");
const notFound = read("404.html");
const css = read("hub-assets/hub.css");
const js = read("hub-assets/hub.js");
const facts = JSON.parse(read("hub-assets/hub-facts.json"));

for (const [name, source] of [["index.html", html], ["404.html", notFound]]) {
  if (/<meta[^>]+http-equiv=["']refresh/i.test(source) || /window\.location\.(?:replace|assign)/.test(source)) {
    throw new Error(`${name} must not silently redirect`);
  }
  const ids = [...source.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
  if (ids.length !== new Set(ids).size) throw new Error(`${name} contains duplicate ids`);
  for (const match of source.matchAll(/<button\b[^>]*>/g)) {
    if (!/\stype=["'][^"']+["']/.test(match[0])) throw new Error(`${name} has a button without an explicit type`);
  }
}

requireMatch(html, /Hive-AI maps the reasoning system\. HivePoA challenges and attests storage work;/, "system boundary");
requireMatch(js, /Signed release index verified/, "signed-index status");
requireMatch(html, /Not verified here/, "local-byte boundary");
requireMatch(html, /A same-origin compromise is outside the signature guarantee/, "same-origin boundary");
requireMatch(html, /http:\/\/127\.0\.0\.1:5002\/chat/, "local chat route");
requireMatch(html, /GitHub Pages never receives your prompt/, "prompt privacy");
requireMatch(js, /PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256/, "pinned verifier fingerprint");
requireMatch(js, /data-release-evidence-index/, "separate evidence states");
requireMatch(css, /@media \(prefers-reduced-motion: reduce\)/, "reduced motion");
requireMatch(css, /button:focus-visible,[\s\S]*a:focus-visible/, "visible focus");

for (const forbidden of [
  "Open verified download",
  "Signed tester tip verified",
  "without fake value",
  "Safe to run.",
]) {
  if (html.includes(forbidden) || js.includes(forbidden)) throw new Error(`forbidden overclaim remains: ${forbidden}`);
}

if (facts.schema !== "hive.ecosystem.public-source-snapshot.v1") throw new Error("source snapshot schema mismatch");
if (!facts.boundaries?.snapshotOnly || facts.boundaries?.runtimeTelemetry || facts.boundaries?.grantsAuthority) {
  throw new Error("source snapshot boundaries are not fail-closed");
}
if (!/^[a-f0-9]{40}$/.test(facts.hiveAi?.sourceCommit || "")) throw new Error("Hive-AI source commit is not exact");
if (!/^[a-f0-9]{64}$/.test(facts.hiveAi?.graphHash || "")) throw new Error("Living Anatomy graph hash is not exact");
for (const field of ["neurons", "nodes", "edges", "divisions", "moons", "organs", "components"]) {
  if (!Number.isSafeInteger(facts.hiveAi?.[field]) || facts.hiveAi[field] < 1) {
    throw new Error(`invalid source fact: ${field}`);
  }
}
if (!html.includes(`Hive-AI main @ ${facts.hiveAi.sourceCommit.slice(0, 7)}`)) {
  throw new Error("HTML fallback source stamp drifted from hub-facts.json");
}

const png = fs.readFileSync(path.join(root, "hub-assets/og.png"));
if (png.subarray(1, 4).toString("ascii") !== "PNG" || png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) {
  throw new Error("social preview must be a 1200x630 PNG");
}

for (const route of ["", "download", "verify", "releases", "get-started", "tester-network"]) {
  const routeHtml = read(path.posix.join("HivePoA", route, "index.html"));
  requireMatch(routeHtml, /<a href="\/">Hive ecosystem hub<\/a>/, `HivePoA/${route || "index"} central-hub link`);
  requireMatch(routeHtml, /HivePoA home/, `HivePoA/${route || "index"} subsite-home label`);
}

for (const match of html.matchAll(/(?:href|src)=["'](\/[^"'#?]*)["']/g)) {
  const publicPath = match[1];
  const candidate = publicPath.endsWith("/")
    ? path.join(root, publicPath.slice(1), "index.html")
    : path.join(root, publicPath.slice(1));
  if (!fs.existsSync(candidate)) throw new Error(`root hub target missing: ${publicPath}`);
}

console.log(
  `CENTRAL_HUB_CONTRACT_OK source=${facts.hiveAi.sourceCommit.slice(0, 12)} nodes=${facts.hiveAi.nodes} edges=${facts.hiveAi.edges}`,
);
