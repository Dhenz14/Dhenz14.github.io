import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const requireMatch = (value, pattern, label) => {
  if (!pattern.test(value)) throw new Error(`${label} contract missing`);
};
const requireNoMatch = (value, pattern, label) => {
  if (pattern.test(value)) throw new Error(`${label} contract violated`);
};
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const exactKeys = (value, expected, label) => {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys drifted: ${actual.join(",")}`);
  }
};
const boundedBlock = (value, start, end, label) => {
  const startIndex = value.indexOf(start);
  if (startIndex === -1) throw new Error(`${label} start marker missing`);
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (endIndex === -1) throw new Error(`${label} end marker missing`);
  return value.slice(startIndex, endIndex + end.length);
};

const required = [
  "index.html",
  "404.html",
  "README.md",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  ".github/workflows/sync-living-galaxy.yml",
  "favicon.svg",
  "favicon.ico",
  "hub-assets/hub.css",
  "hub-assets/hub.js",
  "hub-assets/galaxy-core.mjs",
  "hub-assets/hub-facts.json",
  "hub-assets/og.png",
  "script/sync-galaxy-snapshot.mjs",
  "script/mark-galaxy-bridge-inactive.mjs",
  "script/check-galaxy-bridge.mjs",
  "script/check-http-surface.mjs",
  "script/check-galaxy-core.mjs",
  "script/check-signed-release.mjs",
  "script/check-live-parity.mjs",
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
const galaxyCore = read("hub-assets/galaxy-core.mjs");
const generator = read("script/sync-galaxy-snapshot.mjs");
const bridgeFailClosed = read("script/mark-galaxy-bridge-inactive.mjs");
const facts = JSON.parse(read("hub-assets/hub-facts.json"));
const pointerDownBlock = boundedBlock(
  js,
  'this.canvas.addEventListener("pointerdown"',
  'this.canvas.addEventListener("pointermove"',
  "pointerdown handler",
);
const pointerMoveBlock = boundedBlock(
  js,
  'this.canvas.addEventListener("pointermove"',
  "const release =",
  "pointermove handler",
);
const forcedColorsWiring = boundedBlock(
  js,
  "const onForcedColorsChange =",
  "this.applyRenderAvailability(this.forcedColors.matches);",
  "forced-colors wiring",
);

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

requireMatch(html, /One organism\.[\s\S]*Every system in orbit\./, "hero identity");
requireMatch(html, /Hive-AI is the reasoning brain\.[\s\S]*HivePoA is the proof and storage plane\./, "system boundary");
requireMatch(html, /id="galaxy"/, "public galaxy section");
requireMatch(html, /data-galaxy-engage[^>]+aria-pressed="false"/, "explicit galaxy engagement");
requireMatch(html, /data-galaxy-canvas[^>]+tabindex="0"[^>]+role="img"/, "keyboard-addressable galaxy canvas");
requireMatch(html, /data-galaxy-index-list[^>]+aria-label="Jump to a galaxy division"/, "semantic division navigation");
requireMatch(html, /Current authorized beta tester package/, "tester authorization label");
requireMatch(html, /Not verified here/, "local-byte boundary");
requireMatch(html, /A same-origin compromise is outside the signature guarantee/, "same-origin boundary");
requireMatch(html, /http:\/\/127\.0\.0\.1:5002\/chat/, "local chat route");
requireMatch(html, /http:\/\/127\.0\.0\.1:5002\/constellation\/body\?presentation=1/, "local galaxy route");
requireMatch(html, /GitHub Pages never receives your prompt/, "prompt privacy");
requireNoMatch(html, /href=["']#anatomy["']/, "obsolete anatomy anchor");
const disabledDownload = html.match(/<a\b[^>]*data-release-download[^>]*>/)?.[0] || "";
if (!disabledDownload || /\shref=/.test(disabledDownload) || !/tabindex="-1"/.test(disabledDownload)) {
  throw new Error("unverified release download must be inert and unfocusable");
}
requireNoMatch(html, /galaxy-inspector["'][^>]*aria-live/, "hover-driven live-region noise");
const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i;
for (const [name, source] of [["index.html", html], ["404.html", notFound]]) {
  const policy = source.match(csp)?.[1] || "";
  requireMatch(policy, /default-src 'self'/, `${name} default CSP`);
  requireMatch(policy, /object-src 'none'/, `${name} object CSP`);
  requireMatch(policy, /base-uri 'none'/, `${name} base CSP`);
  requireMatch(policy, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/i, `${name} hashed-script CSP`);
  requireNoMatch(policy, /script-src[^;]*'unsafe-inline'/i, `${name} unsafe inline scripts`);
  requireNoMatch(policy, /upgrade-insecure-requests/i, `${name} local-runtime navigation upgrade`);
}
const rootPolicy = html.match(csp)?.[1] || "";
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
if (inlineScripts.length !== 1) throw new Error(`expected one hashed inline script, found ${inlineScripts.length}`);
for (const match of inlineScripts) {
  const digest = crypto.createHash("sha256").update(match[1]).digest("base64");
  if (!rootPolicy.includes(`'sha256-${digest}'`)) throw new Error("inline script CSP hash drifted");
}
const rootCssVersion = html.match(/hub-assets\/hub\.css\?v=([^"']+)/)?.[1];
const rootJsVersion = html.match(/hub-assets\/hub\.js\?v=([^"']+)/)?.[1];
if (!rootCssVersion || rootCssVersion !== rootJsVersion
  || !notFound.includes(`/hub-assets/hub.css?v=${rootCssVersion}`)
  || !notFound.includes(`/hub-assets/hub.js?v=${rootJsVersion}`)
  || !js.includes(`./galaxy-core.mjs?v=${rootJsVersion}`)) {
  throw new Error("root and 404 asset versions must remain identical");
}

requireMatch(js, /Signed release index verified/, "signed-index status");
requireMatch(js, /PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256/, "pinned verifier fingerprint");
requireMatch(js, /data-release-evidence-index/, "separate evidence states");
requireMatch(js, /class GalaxyAtlas/, "galaxy renderer");
requireMatch(js, /runSafely\("Living Anatomy galaxy", startGalaxy\)/, "galaxy call chain");
requireMatch(js, /focusFamily\(familyGeometryIndex\)/, "family semantic zoom");
requireMatch(js, /focusNeuron\(neuronIndex\)/, "neuron semantic zoom");
requireMatch(js, /drawFamilyLabel\(/, "family canvas labels");
requireMatch(js, /drawNeuronLabel\(/, "neuron identity label");
requireMatch(js, /placeCanvasLabel\(/, "collision-aware label placement");
requireMatch(js, /GALAXY_LENS_PROFILES/, "lens-specific topology weighting");
requireMatch(js, /selectGalaxyHit\(/, "child-first global hit resolver call");
requireNoMatch(js, /point\.divisionIndex !== focusDivision/, "parent-first hit restriction");
requireMatch(pointerDownBlock, /this\.updatePointer\(event\);\s*this\.hitTest\(\);/, "touch tap coordinate capture");
requireMatch(pointerDownBlock, /const pointerPolicy = galaxyPointerPolicy\(event\.pointerType, this\.engaged\);\s*this\.pointer\.orbitAllowed = pointerPolicy\.orbitAllowed;/, "behavioral pointer policy integration");
requireMatch(pointerMoveBlock, /this\.dragMoved \|\|= Math\.hypot\(dx, dy\) > 4;\s*if \(!this\.pointer\.orbitAllowed\) return;/, "unengaged touch drag cannot orbit");
requireMatch(js, /pointercancel[^\n]+release\(event, true\)/, "non-activating pointer cancellation");
requireMatch(js, /focusedFamilyIndex[\s\S]*data-family-geometry-index[\s\S]*focus\(\{ preventScroll: true \}\)/, "family focus continuity");
requireMatch(js, /focusedNeuronId[\s\S]*data-neuron-id[\s\S]*focus\(\{ preventScroll: true \}\)/, "neuron focus continuity");
requireMatch(js, /resolveGalaxySelection\([\s\S]*previousNeuronId/, "semantic snapshot selection continuity integration");
requireMatch(js, /galaxy-fallback-active/, "semantic no-canvas fallback activation");
requireMatch(js, /1 - Math\.exp\(-elapsed \/ 145\)/, "time-based camera damping");
requireMatch(js, /if \(!this\.engaged \|\| atMinimum \|\| atMaximum\) return;/, "non-trapping wheel gate");
requireMatch(js, /event\.key !== "Escape" \|\| !this\.engaged[\s\S]*this\.setEngaged\(false, true\);[\s\S]*data-galaxy-engage[\s\S]*focus\(\{ preventScroll: true \}\)/, "keyboard scroll release and focus return");
requireMatch(js, /this\.intersecting = true;[\s\S]*this\.documentVisible = !document\.hidden;/, "visibility state separation");
requireMatch(js, /if \(!this\.context\) return;/, "canvas fail-soft guard");
requireMatch(js, /download\.removeAttribute\("href"\)/, "blocked download deauthorization");
requireMatch(galaxyCore, /facts\.pmOnly === facts\.purposeMastered - facts\.twitches/, "PM Twitch invariant");
requireMatch(js, /SNAPSHOT_REFRESH_MS = 60_000/, "visibility-aware snapshot refresh interval");
requireMatch(js, /Last-good snapshot/, "last-good refresh behavior");
requireMatch(js, /AbortController/, "snapshot request cancellation");
requireMatch(js, /snapshotRequestGeneration/, "snapshot response generation gate");
requireMatch(js, /snapshotResponseCanCommit\([\s\S]*aborted:/, "behavioral snapshot response gate integration");
requireMatch(forcedColorsWiring, /const onForcedColorsChange = \(event\) => this\.applyRenderAvailability\(Boolean\(event\.matches\)\);/, "live forced-colors transition callback");
requireMatch(forcedColorsWiring, /this\.forcedColors\.addEventListener\("change", onForcedColorsChange\)/, "live forced-colors transition listener");
requireMatch(forcedColorsWiring, /this\.forcedColors\.addListener\(onForcedColorsChange\)/, "legacy forced-colors transition listener");
requireMatch(js, /applyRenderAvailability\(forcedColorsActive\)/, "live render fallback transition");
requireMatch(js, /if \(\$\("\[data-source-stamp\], \[data-galaxy-canvas\]"\)\)[\s\S]*loadSourceSnapshot\(\)\.finally\(startSnapshotRefresh\)/, "snapshot refresh surface gate");
requireMatch(js, /runSafely\("Offscreen scene control", wireSceneActivity\)/, "offscreen CSS animation control");
requireNoMatch(js, /time\s*-\s*this\.lastFrame\s*<\s*32/, "30fps frame throttle");
requireNoMatch(js, /Math\.random\(/, "non-deterministic visual geometry");

requireMatch(css, /@media \(prefers-reduced-motion: reduce\)/, "reduced motion");
requireMatch(css, /button:focus-visible,[\s\S]*a:focus-visible/, "visible focus");
requireMatch(css, /\[data-reveal\]\s*{\s*opacity:\s*1;/, "progressive no-JS visibility");
requireMatch(css, /\[data-reveal\]\.reveal-ready/, "enhanced reveal state");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.galaxy-canvas/, "forced-colors galaxy fallback");
requireMatch(css, /@keyframes centered-orbit-spin[\s\S]*translate\(-50%, -50%\) rotate\(-13deg\)[\s\S]*translate\(-50%, -50%\) rotate\(347deg\)/, "stable centered hero orbit");
requireMatch(css, /\.motion-scene-paused[\s\S]*animation-play-state:\s*paused !important/, "offscreen CSS animation pause");
requireMatch(css, /\.galaxy-stage\s*{[\s\S]*?touch-action:\s*pan-y;/, "touch page-scroll preservation");
requireMatch(css, /\.galaxy-stage\.is-engaged\s*{[\s\S]*?touch-action:\s*none;/, "engaged touch orbit ownership");
requireMatch(css, /\.map-readout\s*{[\s\S]*?pointer-events:\s*none;/, "non-blocking graph readout overlay");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*?\.map-readout\s*{[\s\S]*?inset:\s*1rem 1rem auto auto;/, "separated mobile galaxy overlays");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.galaxy-controls\s*{\s*display:\s*none;/, "forced-colors camera fallback");
requireMatch(css, /\.galaxy-fallback-active \.galaxy-controls\s*{\s*display:\s*none;/, "no-canvas camera fallback");
requireNoMatch(css, /@import\s|url\(\s*["']?https?:/i, "third-party CSS runtime dependency");

for (const forbidden of [
  "Open verified download",
  "Signed tester tip verified",
  "without fake value",
  "Safe to run.",
]) {
  if (html.includes(forbidden) || js.includes(forbidden)) throw new Error(`forbidden overclaim remains: ${forbidden}`);
}

if (facts.schema !== "hive.ecosystem.public-source-snapshot.v2") throw new Error("source snapshot schema mismatch");
exactKeys(facts, ["schema", "hiveAi", "galaxy", "ecosystem", "refresh", "boundaries", "capturedAt"], "source snapshot");
exactKeys(facts.hiveAi, [
  "sourceCommit", "sourceBranch", "graphSource", "graphSchema", "graphHash", "sourceFingerprint",
  "neurons", "trainableNeurons", "deterministicNeurons", "purposeMastered", "twitches", "pmOnly",
  "notPurposeMastered", "nodes", "edges", "divisions", "families", "moons", "organs", "components",
  "federationRepositories",
], "Hive-AI public facts");
exactKeys(facts.boundaries, ["snapshotOnly", "runtimeTelemetry", "grantsAuthority", "privateEvidencePublished", "localChatUrl", "localGalaxyUrl"], "public boundaries");
exactKeys(facts.ecosystem, ["schema", "primaryOrgans", "federationRepositories"], "public ecosystem");
if (!Array.isArray(facts.ecosystem.primaryOrgans) || facts.ecosystem.primaryOrgans.length !== 6) throw new Error("public organ roster drifted");
for (const organ of facts.ecosystem.primaryOrgans) exactKeys(organ, ["id", "label", "role", "exposure"], `public organ ${organ?.id || "unknown"}`);
exactKeys(facts.refresh, ["privateSourceMode", "automaticBridgeEnabled", "reasonCode", "lastGoodBehavior"], "refresh boundary");
if (!facts.boundaries?.snapshotOnly || facts.boundaries?.runtimeTelemetry || facts.boundaries?.grantsAuthority || facts.boundaries?.privateEvidencePublished) {
  throw new Error("source snapshot boundaries are not fail-closed");
}
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(facts.capturedAt || "")) throw new Error("snapshot capture time is not canonical UTC");
if (!/^[a-f0-9]{40}$/.test(facts.hiveAi?.sourceCommit || "")) throw new Error("Hive-AI source commit is not exact");
if (!/^[a-f0-9]{64}$/.test(facts.hiveAi?.graphHash || "")) throw new Error("Living Anatomy graph hash is not exact");
if (!/^[a-f0-9]{64}$/.test(facts.hiveAi?.sourceFingerprint || "")) throw new Error("Living Anatomy source fingerprint is not exact");

for (const field of ["neurons", "trainableNeurons", "deterministicNeurons", "nodes", "edges", "divisions", "families", "moons", "organs", "components", "federationRepositories"]) {
  if (!Number.isSafeInteger(facts.hiveAi?.[field]) || facts.hiveAi[field] < 1) throw new Error(`invalid positive source fact: ${field}`);
}
for (const field of ["purposeMastered", "twitches", "pmOnly", "notPurposeMastered"]) {
  if (!Number.isSafeInteger(facts.hiveAi?.[field]) || facts.hiveAi[field] < 0) throw new Error(`invalid physiology fact: ${field}`);
}
if (facts.hiveAi.trainableNeurons + facts.hiveAi.deterministicNeurons !== facts.hiveAi.neurons) throw new Error("neuron class counts do not reconcile");
if (facts.hiveAi.twitches > facts.hiveAi.purposeMastered) throw new Error("Twitch count exceeds purpose mastery");
if (facts.hiveAi.pmOnly !== facts.hiveAi.purposeMastered - facts.hiveAi.twitches) throw new Error("PM-only count does not reconcile");
if (facts.hiveAi.notPurposeMastered !== facts.hiveAi.neurons - facts.hiveAi.purposeMastered) throw new Error("not-mastered count does not reconcile");

const galaxy = facts.galaxy;
if (galaxy?.schema !== "hive.ecosystem.public-galaxy.v1" || galaxy?.statusProjection !== "none") throw new Error("public galaxy schema or status boundary drifted");
if (galaxy.representedNeurons !== facts.hiveAi.neurons || galaxy.sourceGraphHash !== facts.hiveAi.graphHash) throw new Error("public galaxy source binding drifted");
if (!Array.isArray(galaxy.divisions) || galaxy.divisions.length !== facts.hiveAi.divisions) throw new Error("public galaxy division count drifted");
exactKeys(galaxy, ["schema", "generatorVersion", "sourceGraphHash", "geometry", "representedNeurons", "divisions", "statusProjection", "claimBoundary", "projectionHash"], "public galaxy");
const neuronIds = new Set();
let familyCount = 0;
for (const [index, division] of galaxy.divisions.entries()) {
  exactKeys(division, ["code", "name", "neuronCount", "families"], `division ${index}`);
  if (division.code !== String.fromCharCode(65 + index) || division.neuronCount !== 40 || division.families?.length !== 4) {
    throw new Error(`division ${index} shape drifted`);
  }
  for (const family of division.families) {
    exactKeys(family, ["code", "name", "neuronIds"], `family ${family.code}`);
    if (!Array.isArray(family.neuronIds) || family.neuronIds.length !== 10) throw new Error(`family ${family.code} shape drifted`);
    familyCount += 1;
    for (const neuronId of family.neuronIds) {
      if (!/^N\d{3}$/.test(neuronId) || neuronIds.has(neuronId)) throw new Error(`invalid or duplicate public neuron id: ${neuronId}`);
      neuronIds.add(neuronId);
    }
  }
}
if (familyCount !== facts.hiveAi.families || neuronIds.size !== facts.hiveAi.neurons) throw new Error("public galaxy roster is incomplete");
for (let index = 1; index <= facts.hiveAi.neurons; index += 1) {
  if (!neuronIds.has(`N${String(index).padStart(3, "0")}`)) throw new Error(`public galaxy neuron roster gap: N${String(index).padStart(3, "0")}`);
}
const { projectionHash, ...galaxyWithoutHash } = galaxy;
if (projectionHash !== sha256(JSON.stringify(galaxyWithoutHash))) throw new Error("public galaxy projection hash mismatch");

const serializedFacts = JSON.stringify(facts);
for (const forbidden of ["/home/", "C:\\\\"]) {
  if (serializedFacts.includes(forbidden)) throw new Error(`private public-snapshot field leaked: ${forbidden}`);
}
const activeRefresh = facts.refresh?.automaticBridgeEnabled === true
  && facts.refresh?.privateSourceMode === "scheduled-living-main-publisher"
  && facts.refresh?.reasonCode === "SCHEDULED_LIVING_MAIN_PUBLISHER";
const inactiveRefresh = facts.refresh?.automaticBridgeEnabled === false
  && facts.refresh?.privateSourceMode === "manual-source-bound-snapshot"
  && ["CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED", "PRIVATE_SOURCE_CHECKOUT_FAILED"].includes(facts.refresh?.reasonCode);
if (!activeRefresh && !inactiveRefresh) throw new Error("refresh automation boundary drifted");

const syncWorkflow = read(".github/workflows/sync-living-galaxy.yml");
requireMatch(syncWorkflow, /cron:\s*["']\*\/5 \* \* \* \*["']/, "five-minute living-main schedule");
requireMatch(syncWorkflow, /workflow_dispatch:/, "manual living-main refresh");
requireMatch(syncWorkflow, /contents:\s*write/, "same-repository snapshot publish authority");
requireMatch(syncWorkflow, /pages:\s*write/, "legacy Pages build authority");
requireMatch(syncWorkflow, /sync-galaxy-snapshot\.mjs/, "living-main snapshot compiler call");
requireMatch(syncWorkflow, /check-central-hub\.mjs/, "pre-publish hub verification");
requireMatch(syncWorkflow, /git push origin HEAD:main/, "atomic Pages main publication");
requireMatch(syncWorkflow, /POST ["']repos\/\$GITHUB_REPOSITORY\/pages\/builds["']/, "explicit workflow-authored Pages build");
requireMatch(syncWorkflow, /secrets\.HIVE_AI_READ_DEPLOY_KEY/, "read-only private-source deploy key");
requireMatch(syncWorkflow, /mark-galaxy-bridge-inactive\.mjs --credential-missing/, "credential-removal fail-closed path");
requireMatch(syncWorkflow, /mark-galaxy-bridge-inactive\.mjs --checkout-failed/, "credential-failure fail-closed path");
const secretNames = [...syncWorkflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
if (secretNames.some((name) => name !== "HIVE_AI_READ_DEPLOY_KEY")) throw new Error("unexpected workflow secret authority");
requireNoMatch(syncWorkflow, /personal_access_token|\bPAT\b/i, "broad sync credential");

requireMatch(generator, /"-C", hiveAiRepo, "ls-remote", "origin"/, "credential-preserving live remote source proof");
requireMatch(generator, /rev-parse", "HEAD\^\{commit\}"[\s\S]*checkoutCommit !== sourceCommit/, "exact compiled checkout identity");
requireMatch(generator, /--ignored=matching/, "ignored-input refusal");
requireMatch(generator, /truth-input commit[\s\S]*shallow boundary/, "shallow provenance refusal");
requireMatch(generator, /fs\.fsyncSync/, "atomic durable snapshot write");
requireMatch(generator, /process\.argv\.includes\("--check"\)/, "snapshot check mode");
requireMatch(generator, /statusProjection:\s*"none"/, "no status projection");
requireMatch(generator, /git", \["-C", hiveAiRepo, "show"/, "source-manifest byte proof");
requireMatch(generator, /GALAXY_AUTOMATIC_BRIDGE === "true"/, "explicit bridge activation input");
requireNoMatch(bridgeFailClosed, /automaticBridgeEnabled:\s*true/, "fail-closed script authority escalation");
requireMatch(bridgeFailClosed, /CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED/, "missing-credential fail-closed reason");
requireMatch(bridgeFailClosed, /PRIVATE_SOURCE_CHECKOUT_FAILED/, "failed-checkout fail-closed reason");
requireMatch(galaxyCore, /galaxy\?\.sourceGraphHash !== facts\?\.graphHash/, "runtime graph binding");
requireMatch(galaxyCore, /projectionHash === await sha256Hex/, "runtime projection hash binding");
requireMatch(galaxyCore, /export function selectGalaxyHit/, "testable global hit selection");
requireMatch(galaxyCore, /export function galaxyPointerPolicy/, "testable pointer policy");
requireMatch(galaxyCore, /export function galaxyRenderState/, "testable render fallback state");
requireMatch(galaxyCore, /export function placeCanvasLabel/, "testable collision-aware labels");
requireMatch(galaxyCore, /export function resolveGalaxySelection/, "testable semantic selection continuity");
requireMatch(syncWorkflow, /fetch-depth:\s*128/, "bounded initial source history");
requireMatch(syncWorkflow, /persist-credentials:\s*true/, "authenticated post-checkout source proof");
requireMatch(syncWorkflow, /--deepen=896[\s\S]*--unshallow/, "progressive source history proof");

const png = fs.readFileSync(path.join(root, "hub-assets/og.png"));
if (png.subarray(1, 4).toString("ascii") !== "PNG" || png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) {
  throw new Error("social preview must be a 1200x630 PNG");
}
const icon = fs.readFileSync(path.join(root, "favicon.ico"));
if (icon.length < 6 || !icon.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) throw new Error("favicon.ico is malformed");
const manifest = JSON.parse(read("site.webmanifest"));
if (manifest.start_url !== "/" || manifest.scope !== "/" || !Array.isArray(manifest.icons) || manifest.icons.length < 1) throw new Error("web manifest contract drifted");
requireMatch(read("robots.txt"), /Sitemap: https:\/\/dhenz14\.github\.io\/sitemap\.xml/, "root robots sitemap");
const sitemap = read("sitemap.xml");
requireMatch(sitemap, /<loc>https:\/\/dhenz14\.github\.io\/<\/loc>/, "root sitemap URL");
requireNoMatch(sitemap, /HivePoA/, "noindex HivePoA sitemap exclusion");

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
  `CENTRAL_HUB_CONTRACT_OK source=${facts.hiveAi.sourceCommit.slice(0, 12)} nodes=${facts.hiveAi.nodes} edges=${facts.hiveAi.edges} twitches=${facts.hiveAi.twitches} pm_only=${facts.hiveAi.pmOnly}`,
);
