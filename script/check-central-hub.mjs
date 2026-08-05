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
  ".gitattributes",
  ".github/workflows/sync-living-galaxy.yml",
  ".github/workflows/verify-public-hub.yml",
  ".github/workflows/hive-ide-public-windows-smoke.yml",
  "docs/PUBLIC_GALAXY_SYNC.md",
  "favicon.svg",
  "favicon.ico",
  "hub-assets/hub.css",
  "hub-assets/hub.js",
  "hub-assets/galaxy-core.mjs",
  "hub-assets/ide-release-core.mjs",
  "hub-assets/hub-facts.json",
  "hub-assets/og.png",
  "script/sync-galaxy-snapshot.mjs",
  "script/mark-galaxy-bridge-inactive.mjs",
  "script/check-galaxy-bridge.mjs",
  "script/check-http-surface.mjs",
  "script/check-galaxy-core.mjs",
  "script/check-ide-release.mjs",
  "script/run-ide-public-windows-smoke.ps1",
  "script/check-signed-release.mjs",
  "script/check-live-parity.mjs",
  "script/check-publisher-races.mjs",
  "script/publisher-candidate-policy.mjs",
  "script/requirements-galaxy-sync.txt",
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
const gitAttributes = read(".gitattributes");
const notFound = read("404.html");
const css = read("hub-assets/hub.css");
const js = read("hub-assets/hub.js");
const galaxyCore = read("hub-assets/galaxy-core.mjs");
const ideReleaseCore = read("hub-assets/ide-release-core.mjs");
const generator = read("script/sync-galaxy-snapshot.mjs");
const bridgeFailClosed = read("script/mark-galaxy-bridge-inactive.mjs");
const facts = JSON.parse(read("hub-assets/hub-facts.json"));
const pointerDownBlock = boundedBlock(
  js,
  'this.canvas.addEventListener("pointerdown"',
  'this.canvas.addEventListener("pointermove"',
  "pointerdown handler",
);
requireMatch(gitAttributes, /^\/downloads\/hive-ide\/\*\.json -text$/m, "immutable Hive IDE release-byte checkout custody");
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
requireMatch(html, /source-badge[^>]+title="JavaScript verifies[^>]*>[\s\S]*Snapshot verification pending/, "truthful no-JS source state");
requireMatch(html, /data-motion-toggle[^>]+aria-disabled="true"[^>]+disabled[^>]*>[\s\S]*Motion control pending/, "inert no-JS motion control");
requireMatch(html, /<noscript>[\s\S]*no package or live-source claim is authorized/, "explicit no-JS truth boundary");
requireMatch(html, /id="galaxy"/, "public galaxy section");
const rootButtonTags = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
const startupLensButtons = rootButtonTags.filter((tag) => /\sdata-lens=/.test(tag));
if (startupLensButtons.length !== 5 || startupLensButtons.some((tag) => !/\sdisabled(?:\s|>)/.test(tag))) {
  throw new Error("all five startup lens controls must be disabled");
}
const startupCameraButtons = rootButtonTags.filter((tag) => /\sdata-galaxy-(?:engage|zoom|reset)(?:=|\s|>)/.test(tag));
if (startupCameraButtons.length !== 4 || startupCameraButtons.some((tag) => (
  !/\sdisabled(?:\s|>)/.test(tag) || !/\saria-disabled="true"/.test(tag)
))) {
  throw new Error("all four startup camera controls must be disabled and aria-disabled");
}
requireMatch(html, /data-galaxy-engage[^>]+aria-pressed="false"/, "explicit galaxy engagement state");
requireMatch(html, /data-galaxy-canvas[^>]+tabindex="-1"[^>]+aria-disabled="true"[^>]+role="img"/, "inert startup galaxy canvas");
requireMatch(html, /data-galaxy-index-list[^>]+aria-label="Jump to a galaxy division"/, "semantic division navigation");
requireMatch(html, /Current authorized beta tester package/, "tester authorization label");
requireMatch(html, /id="ide-download"[^>]+data-ide-release data-state="checking"/, "inert Hive IDE release section");
requireMatch(html, /One current-user installer carries the IDE,[\s\S]*internal HivePoA\/IPFS Service Center/, "one-download product boundary");
requireMatch(html, /Test credits[\s\S]*Valueless · non-transferable/, "valueless IDE tester credits");
requireMatch(html, /does not claim a public HivePoA reward-network release/, "IDE versus HivePoA release boundary");
requireMatch(html, /Not verified here/, "local-byte boundary");
requireMatch(html, /A same-origin compromise is outside the signature guarantee/, "same-origin boundary");
requireMatch(html, /http:\/\/127\.0\.0\.1:5002\/chat/, "local chat route");
requireMatch(html, /http:\/\/127\.0\.0\.1:5002\/constellation\/body\?presentation=1/, "local presentation body route");
requireMatch(html, /http:\/\/127\.0\.0\.1:8791\/constellation\/body\?presentation=0/, "local operator body route");
requireMatch(html, /class="button button-quiet" data-hero-body-cta href="http:\/\/127\.0\.0\.1:5002\/constellation\/body\?presentation=1" target="_blank" rel="noreferrer"/, "direct hero Living Anatomy entry");
requireMatch(html, /class="button button-primary" href="#ide-download"/, "primary Hive IDE download handoff");
requireMatch(html, /data-hero-atlas-cta href="#galaxy"/, "separate public atlas entry");
requireMatch(html, /href="http:\/\/127\.0\.0\.1:5002\/constellation\/body\?presentation=1"[^>]*target="_blank"[^>]*rel="noreferrer"/, "safe presentation body navigation");
requireMatch(html, /href="http:\/\/127\.0\.0\.1:8791\/constellation\/body\?presentation=0"[^>]*target="_blank"[^>]*rel="noreferrer"/, "safe operator body navigation");
requireMatch(html, /data-body-surface="atlas"[\s\S]*data-body-surface="presentation"[\s\S]*data-body-surface="operator"/, "three-surface Living Anatomy bridge");
requireMatch(html, /public page never claims or probes local availability/, "truthful local availability boundary");
requireMatch(html, /GitHub Pages never receives your prompt/, "prompt privacy");
const commandStepIds = [...html.matchAll(/data-command-step="(\d+)"/g)].map((match) => Number(match[1]));
if (JSON.stringify(commandStepIds) !== JSON.stringify([0, 1, 2, 3, 4, 5])) {
  throw new Error(`living command cycle stage order drifted: ${commandStepIds.join(",")}`);
}
requireMatch(html, /See[\s\S]*Understand[\s\S]*Select[\s\S]*Dispatch[\s\S]*Verify[\s\S]*Watch/, "living command cycle narrative");
requireMatch(html, /data-command-cycle data-command-state="idle"/, "inert command cycle startup");
requireMatch(html, /The walkthrough narrates the lifecycle; it performs zero effects\./, "zero-effect public command boundary");
requireMatch(html, /data-command-walkthrough aria-pressed="false"/, "explicit walkthrough state");
requireMatch(html, /Open command body[\s\S]*Real scan · missions · receipts/, "operator command handoff");
requireMatch(html, /canvas data-command-echo/, "command organism echo");
requireMatch(html, /data-command-prev[\s\S]*data-command-next[\s\S]*data-command-reset/, "presenter recovery navigation");
requireMatch(html, /data-command-flightdeck aria-pressed="false"[\s\S]*F · projector mode/, "projector flightdeck control");
if (html.indexOf("galaxy-commandbar") > html.indexOf("body-bridge-dock")) {
  throw new Error("galaxy spectacle must precede the expanded local-surface dock");
}
requireNoMatch(html, /href=["']#anatomy["']/, "obsolete anatomy anchor");
const disabledDownload = html.match(/<a\b[^>]*data-release-download[^>]*>/)?.[0] || "";
if (!disabledDownload || /\shref=/.test(disabledDownload) || !/tabindex="-1"/.test(disabledDownload)) {
  throw new Error("unverified release download must be inert and unfocusable");
}
for (const attribute of ["data-ide-download", "data-ide-manifest", "data-ide-release-page"]) {
  const inertLink = html.match(new RegExp(`<a\\b[^>]*${attribute}[^>]*>`))?.[0] || "";
  if (!inertLink || /\shref=/.test(inertLink) || !/tabindex="-1"/.test(inertLink) || !/aria-disabled="true"/.test(inertLink)) {
    throw new Error(`unverified Hive IDE link must be inert: ${attribute}`);
  }
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
if (rootCssVersion !== "stark-command-v8" || rootCssVersion !== rootJsVersion
  || !notFound.includes(`/hub-assets/hub.css?v=${rootCssVersion}`)
  || !notFound.includes(`/hub-assets/hub.js?v=${rootJsVersion}`)
  || !js.includes(`./galaxy-core.mjs?v=${rootJsVersion}`)
  || !js.includes(`./ide-release-core.mjs?v=${rootJsVersion}`)) {
  throw new Error("root and 404 asset versions must remain identical");
}

requireMatch(js, /Signed release index verified/, "signed-index status");
requireMatch(js, /button\.disabled = systemReduced;[\s\S]*button\.setAttribute\("aria-disabled", String\(systemReduced\)\)/, "motion control runtime enablement");
requireMatch(js, /PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256/, "pinned verifier fingerprint");
requireMatch(js, /data-release-evidence-index/, "separate evidence states");
requireMatch(js, /class GalaxyAtlas/, "galaxy renderer");
requireMatch(js, /function wireLenses\(\)[\s\S]*button\.disabled = false;/, "lens controls enabled only after module boot");
requireMatch(js, /setCameraControlsAvailable\(available[\s\S]*button\.disabled = !available;[\s\S]*aria-disabled[\s\S]*tabindex[\s\S]*aria-disabled/, "camera controls runtime availability gate");
requireMatch(js, /runSafely\("Living Anatomy galaxy", startGalaxy\)/, "galaxy call chain");
requireMatch(js, /const COMMAND_CYCLE_STEPS = Object\.freeze\(\[[\s\S]*SEE · SOURCE BOUND[\s\S]*WATCH · ABSORBED/, "command cycle semantic model");
requireMatch(js, /function wireCommandCycle\(\)[\s\S]*data-command-cycle[\s\S]*setInterval[\s\S]*1500/, "command cycle controller");
requireMatch(js, /reduceMotion\.matches \|\| document\.body\.classList\.contains\("motion-paused"\)/, "manual reduced-motion command cycle");
requireMatch(js, /detail: \{ snapshot, previous \}/, "previous source snapshot propagation");
requireMatch(js, /previous\.hiveAi\?\.sourceCommit === sourceCommit[\s\S]*New source truth absorbed\.[\s\S]*no runtime state was inferred/, "truth-bound source absorption");
requireMatch(js, /const paintEcho = \(\) =>[\s\S]*drawImage\(sourceCanvas/, "source-bound organism echo renderer");
requireMatch(js, /const setFlightdeck = \(active, announce = true\)[\s\S]*command-flightdeck-open[\s\S]*Projector flightdeck online/, "projector flightdeck controller");
requireMatch(js, /setAttribute\("role", "dialog"\)[\s\S]*setAttribute\("aria-modal", "true"\)[\s\S]*Living command cycle flightdeck/, "flightdeck modal semantics");
requireMatch(js, /event\.key === "Tab"[\s\S]*button:not\(:disabled\)[\s\S]*document\.activeElement === first[\s\S]*document\.activeElement === last/, "flightdeck focus containment");
requireMatch(js, /!editable && root\.classList\.contains\("is-flightdeck"\) && \["ArrowLeft", "ArrowRight"\]\.includes\(event\.key\)[\s\S]*select\(current \+ \(event\.key === "ArrowRight" \? 1 : -1\)\)[\s\S]*if \(interactive\) return;/, "flightdeck arrow keys precede interactive-control guard");
requireMatch(js, /data-command-prev[\s\S]*data-command-next[\s\S]*data-command-reset/, "presenter recovery controls");
requireMatch(js, /new CustomEvent\("hive:command-stage"[\s\S]*detail: \{ index: current, step \}/, "command-stage choreography event");
requireMatch(js, /runSafely\("Living command cycle", wireCommandCycle\)/, "command cycle call chain");
requireMatch(js, /focusFamily\(familyGeometryIndex\)/, "family semantic zoom");
requireMatch(js, /focusNeuron\(neuronIndex\)/, "neuron semantic zoom");
requireMatch(js, /presentCommandStage\(index\)[\s\S]*N121[\s\S]*N401[\s\S]*N561/, "truth-safe atlas stage choreography");
requireMatch(js, /hive:command-stage[\s\S]*this\.presentCommandStage\(event\.detail\?\.index\)/, "atlas command-stage listener");
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
requireMatch(js, /AbortController[\s\S]*fetch\("\/downloads\/hive-ide\/latest\.json"[\s\S]*cache: "no-store"/, "bounded Hive IDE release-feed fetch");
requireMatch(js, /validateIdeReleaseLatest\(JSON\.parse\(body\)\)/, "Hive IDE feed validation before render");
requireMatch(js, /blockIdeRelease\([\s\S]*removeAttribute\("href"\)/, "Hive IDE fail-closed link deauthorization");
requireMatch(js, /download\.href = latest\.installerUrl;[\s\S]*manifest\.href = latest\.manifestUrl;/, "validated Hive IDE download and manifest handoff");
requireMatch(ideReleaseCore, /release stage or channel is unsupported[\s\S]*an unsigned release cannot be advertised as stable/, "Hive IDE release channel truth gate");
requireMatch(ideReleaseCore, /manifest and installer do not share one release tag/, "Hive IDE immutable release-tag binding");
requireMatch(ideReleaseCore, /installer size is outside the bounded Windows package range/, "Hive IDE installer size bound");
requireNoMatch(ideReleaseCore, /eval\(|new Function\(/, "Hive IDE release validator dynamic code");
requireMatch(galaxyCore, /facts\.pmOnly === facts\.purposeMastered - facts\.twitches/, "PM Twitch invariant");
requireMatch(galaxyCore, /captured - now > 5 \* 60_000[\s\S]*snapshotFreshness\(snapshot\?\.capturedAt\)\.state !== "invalid"/, "capture timestamp validity and future-skew gate");
requireMatch(js, /SNAPSHOT_REFRESH_MS = 60_000/, "visibility-aware snapshot refresh interval");
requireMatch(js, /Last-good snapshot/, "last-good refresh behavior");
requireMatch(js, /AbortController/, "snapshot request cancellation");
requireMatch(js, /snapshotRequestGeneration/, "snapshot response generation gate");
requireMatch(js, /snapshotResponseCanCommit\([\s\S]*aborted:/, "behavioral snapshot response gate integration");
requireMatch(js, /const freshness = snapshotFreshness\(snapshot\.capturedAt\);[\s\S]*automaticBridgeEnabled[\s\S]*freshness\.state === "critical"[\s\S]*freshness\.state === "delayed"/, "freshness-aware source badge integration");
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
requireMatch(css, /\.motion-toggle:hover:not\(:disabled\)/, "inert motion control hover state");
requireMatch(css, /\.ide-release-console\s*{[\s\S]*grid-template-columns:[\s\S]*\.ide-stack-grid\s*{[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/, "desktop Hive IDE release composition");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*\.ide-release-facts,[\s\S]*\.ide-stack-grid,[\s\S]*\.ide-release-digest\s*{[\s\S]*grid-template-columns:\s*1fr;/, "mobile Hive IDE release composition");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.ide-release-console[\s\S]*\.ide-release-glow/, "forced-colors Hive IDE release fallback");
requireMatch(css, /\[data-reveal\]\s*{\s*opacity:\s*1;/, "progressive no-JS visibility");
requireMatch(css, /\[data-reveal\]\.reveal-ready/, "enhanced reveal state");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.galaxy-canvas/, "forced-colors galaxy fallback");
requireMatch(css, /@keyframes centered-orbit-spin[\s\S]*translate\(-50%, -50%\) rotate\(-13deg\)[\s\S]*translate\(-50%, -50%\) rotate\(347deg\)/, "stable centered hero orbit");
requireMatch(css, /\.motion-scene-paused[\s\S]*animation-play-state:\s*paused !important/, "offscreen CSS animation pause");
requireMatch(css, /\.galaxy-stage\s*{[\s\S]*?touch-action:\s*pan-y;/, "touch page-scroll preservation");
requireMatch(css, /\.galaxy-stage\.is-engaged\s*{[\s\S]*?touch-action:\s*none;/, "engaged touch orbit ownership");
requireMatch(css, /\.map-readout\s*{[\s\S]*?pointer-events:\s*none;/, "non-blocking graph readout overlay");
requireMatch(css, /\.mission-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/, "six-stage command flightdeck");
requireMatch(css, /\.command-cycle-readout\s*{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) auto;/, "command cycle proof readout");
requireMatch(css, /\.command-cycle-viewport\s*{[\s\S]*?min-height:\s*clamp\(20rem, 42vw, 34rem\)/, "command organism viewport");
requireMatch(css, /body\.command-flightdeck-open::after[\s\S]*\.mission-machine\.is-flightdeck\s*{[\s\S]*?position:\s*fixed;/, "projector flightdeck isolation");
requireMatch(css, /@keyframes command-cycle-scan[\s\S]*@keyframes command-cycle-node/, "command cycle motion language");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*?\.command-cycle-readout\s*{[\s\S]*?grid-template-columns:\s*1fr;/, "mobile command readout stack");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.command-cycle-readout[\s\S]*\.command-cycle-orb/, "forced-colors command fallback");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*?\.map-readout\s*{[\s\S]*?inset:\s*1rem 1rem auto auto;/, "separated mobile galaxy overlays");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*?\.body-surface-links\s*{[\s\S]*?grid-template-columns:\s*1fr;/, "mobile Living Anatomy bridge stack");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.galaxy-controls\s*{\s*display:\s*none;/, "forced-colors camera fallback");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.galaxy-atmosphere,[\s\S]*\.galaxy-scanline,[\s\S]*display:\s*none;/, "forced-colors decorative overlay removal");
requireMatch(css, /\.galaxy-fallback-active \.galaxy-controls\s*{\s*display:\s*none;/, "no-canvas camera fallback");
requireMatch(css, /\.lens-bar button:disabled,[\s\S]*\.galaxy-controls button:disabled/, "disabled galaxy control styling");
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
const activeLocalRefresh = facts.refresh?.automaticBridgeEnabled === true
  && facts.refresh?.privateSourceMode === "local-living-main-publisher"
  && facts.refresh?.reasonCode === "LOCAL_LIVING_MAIN_PUBLISHER";
const inactiveRefresh = facts.refresh?.automaticBridgeEnabled === false
  && facts.refresh?.privateSourceMode === "manual-source-bound-snapshot"
  && ["CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED", "PRIVATE_SOURCE_CHECKOUT_FAILED"].includes(facts.refresh?.reasonCode);
if (!activeRefresh && !activeLocalRefresh && !inactiveRefresh) throw new Error("refresh automation boundary drifted");

const syncWorkflow = read(".github/workflows/sync-living-galaxy.yml");
const verifyWorkflow = read(".github/workflows/verify-public-hub.yml");
const ideSmokeWorkflow = read(".github/workflows/hive-ide-public-windows-smoke.yml");
const ideSmokeScript = read("script/run-ide-public-windows-smoke.ps1");
const syncDocs = read("docs/PUBLIC_GALAXY_SYNC.md");
const requirements = read("script/requirements-galaxy-sync.txt");
const compileStart = syncWorkflow.indexOf("  compile:\n");
const publishStart = syncWorkflow.indexOf("  publish:\n");
if (compileStart === -1 || publishStart <= compileStart) throw new Error("split compiler/publisher jobs are missing");
const compileJob = syncWorkflow.slice(compileStart, publishStart);
const publishJob = syncWorkflow.slice(publishStart);
requireMatch(syncWorkflow, /cron:\s*["']\*\/5 \* \* \* \*["']/, "five-minute living-main schedule");
requireMatch(syncWorkflow, /workflow_dispatch:/, "manual living-main refresh");
requireMatch(syncWorkflow, /vars\.LIVING_GALAXY_CLOUD_SYNC_ENABLED == 'true'/, "explicit cloud publisher activation gate");
requireMatch(syncWorkflow, /permissions:\s*\n\s+contents:\s*read/, "default read-only workflow authority");
for (const [workflowName, workflow] of [["sync", syncWorkflow], ["verify", verifyWorkflow]]) {
  requireMatch(workflow, /actions\/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09/, `${workflowName} Node-24 checkout pin`);
  requireMatch(workflow, /actions\/setup-node@a0853c24544627f65ddf259abe73b1d18a591444/, `${workflowName} Node-24 setup-node pin`);
}
requireMatch(verifyWorkflow, /check-ide-release\.mjs --self-test/, "Hive IDE public-feed negative matrix");
requireMatch(ideSmokeWorkflow, /workflow_dispatch:[\s\S]*expected_source_commit:/, "manual exact-source Windows smoke");
requireMatch(ideSmokeWorkflow, /permissions:\s*\n\s+contents:\s*read/, "Windows smoke read-only authority");
requireNoMatch(ideSmokeWorkflow, /contents:\s*write|secrets\./, "Windows smoke publication or secret authority");
requireMatch(ideSmokeWorkflow, /runs-on:\s*windows-latest[\s\S]*timeout-minutes:\s*45/, "bounded fresh Windows runner");
requireMatch(ideSmokeWorkflow, /actions\/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09/, "Windows smoke checkout pin");
requireMatch(ideSmokeWorkflow, /run-ide-public-windows-smoke\.ps1[\s\S]*expected_source_commit/, "Windows smoke exact-source handoff");
requireMatch(ideSmokeWorkflow, /if:\s*always\(\)[\s\S]*actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/, "Windows smoke durable receipt upload");
requireMatch(ideSmokeScript, /GITHUB_ACTIONS[\s\S]*RUNNER_TEMP[\s\S]*ImageOS[\s\S]*freshHostedRunner/, "fresh hosted runner proof");
requireMatch(ideSmokeScript, /Existing Hive IDE|Fresh runner unexpectedly contains a Hive IDE install/, "pre-existing install refusal");
requireMatch(ideSmokeScript, /Live latest feed differs from the landed central hub document[\s\S]*Release manifest differs from the live feed or landed mirror/, "live-to-landed release binding");
requireMatch(ideSmokeScript, /Get-Sha256 \$InstallerPath[\s\S]*Downloaded installer bytes differ/, "full installer hash proof");
requireMatch(ideSmokeScript, /Start-Process -FilePath \$InstallerPath -ArgumentList '\/S'[\s\S]*applicationHashMatchesManifest = \$true/, "exact install and application hash proof");
requireMatch(ideSmokeScript, /MainWindowHandle -ne 0 -and \$Process\.Responding[\s\S]*CloseMainWindow\(\)[\s\S]*WaitForExit/, "responsive window and graceful close proof");
requireMatch(ideSmokeScript, /uninstallEntryCountAfter[\s\S]*installedApplicationRemoved[\s\S]*unrelatedProcessesTerminated = \$false/, "bounded uninstall proof");
requireMatch(ideSmokeScript, /\$installAttemptOwned = \$false[\s\S]*\$installAttemptOwned = \$true[\s\S]*if \(\$installAttemptOwned\)/, "installer-owned failure cleanup gate");
requireMatch(ideSmokeScript, /expectedTempPrefix[\s\S]*hive-ide-public-smoke-\*[\s\S]*Remove-Item -LiteralPath \$resolvedWorkRoot/, "bounded runner-temp cleanup");
requireNoMatch(`${syncWorkflow}\n${verifyWorkflow}`, /11d5960a326750d5838078e36cf38b85af677262|49933ea5288caeca8642d1e84afbd3f7d6820020/, "deprecated Node-20 action pin");
requireMatch(compileJob, /permissions:\s*\n\s+contents:\s*read/, "credential-free compiler authority");
requireNoMatch(compileJob, /contents:\s*write|pages:\s*write/, "compiler publication authority");
requireMatch(publishJob, /permissions:\s*\n\s+contents:\s*write\s*\n\s+pages:\s*write/, "isolated publisher authority");
requireMatch(compileJob, /persist-credentials:\s*false/, "trusted Pages compiler checkout credential removal");
requireMatch(compileJob, /sync-galaxy-snapshot\.mjs/, "living-main snapshot compiler call");
requireMatch(compileJob, /actions\/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4/, "pinned inert candidate upload");
requireMatch(publishJob, /actions\/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0/, "pinned inert candidate download");
requireMatch(publishJob, /candidate_bytes[\s\S]*524288[\s\S]*candidate_sha[\s\S]*installed_sha/, "bounded artifact admission and copy hash proof");
requireNoMatch(publishJob, /repository:\s*Dhenz14\/Hive-AI|HIVE_AI_READ_DEPLOY_KEY|GALAXY_BRIDGE_MODE|python\s+-m\s+pip/, "publisher private compiler execution");
requireNoMatch(publishJob, /git rebase/, "candidate-mutating Pages reconciliation");
requireMatch(publishJob, /base_sha[\s\S]*remote_sha[\s\S]*publisher-candidate-policy\.mjs[\s\S]*CONCURRENT_FACTS_WINNER/, "immutable candidate moving-main policy");
requireMatch(publishJob, /committed_candidate_sha[\s\S]*candidate_sha[\s\S]*git diff --name-only origin\/main\.\.\.HEAD/, "post-reconstruction candidate and path proof");
requireMatch(publishJob, /check-central-hub\.mjs/, "trusted pre-publish hub verification");
requireMatch(compileJob, /check-publisher-races\.mjs/, "credential-free publisher race verification");
requireMatch(publishJob, /check-publisher-races\.mjs/, "current-main publisher race verification");
requireMatch(publishJob, /git push origin HEAD:main/, "atomic Pages main publication");
requireMatch(publishJob, /pages\/builds\/latest[\s\S]*latest_commit[\s\S]*latest_status[\s\S]*"built"[\s\S]*"building"[\s\S]*POST/, "recoverable Pages deployment request");
requireMatch(publishJob, /POST ["']repos\/\$GITHUB_REPOSITORY\/pages\/builds["']/, "explicit workflow-authored Pages build");
requireMatch(compileJob, /secrets\.HIVE_AI_READ_DEPLOY_KEY/, "read-only private-source deploy key");
requireMatch(compileJob, /mark-galaxy-bridge-inactive\.mjs --credential-missing/, "credential-removal fail-closed path");
requireMatch(compileJob, /mark-galaxy-bridge-inactive\.mjs --checkout-failed/, "credential-failure fail-closed path");
const secretNames = [...syncWorkflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
if (secretNames.some((name) => name !== "HIVE_AI_READ_DEPLOY_KEY")) throw new Error("unexpected workflow secret authority");
requireNoMatch(syncWorkflow, /personal_access_token|\bPAT\b/i, "broad sync credential");
requireMatch(syncDocs, /read-only `compile` job[\s\S]*separate `publish` job[\s\S]*never checks out Hive-AI or executes its\s+code/, "documented split publisher trust boundary");
requireMatch(syncDocs, /remote `main` both before and after compilation[\s\S]*never a mixed-era artifact/, "documented living-main race boundary");
requireMatch(syncDocs, /never rebases[\s\S]*reconstructs the exact candidate bytes[\s\S]*concurrent writer changed the facts/, "documented immutable candidate reconciliation");
requireMatch(syncDocs, /compares the latest Pages[\s\S]*requests or retries the legacy build/, "documented Pages deployment recovery");
requireMatch(compileJob, /actions\/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1/, "pinned Python runtime");
requireMatch(compileJob, /pip install --require-hashes --only-binary=:all:/, "hash-locked binary-only Python install");
for (const requiredPath of [
  "/data/neuron_swarm/portable_green_evidence_membership_20260722.json",
  "/tests/fixtures/physiology/formal_l3_e01_v2/RATIFY_L3_E01_V2.json",
  "/tests/fixtures/physiology/formal_l3_e02/window_seal/RATIFY_L3_E02_V1.json",
]) {
  if (!compileJob.includes(requiredPath)) throw new Error(`publisher sparse evidence path missing: ${requiredPath}`);
}
const requirementSpecs = requirements.split(/\r?\n/).filter((line) => /^[a-z0-9-]+==/i.test(line));
const requirementHashes = [...requirements.matchAll(/--hash=sha256:[a-f0-9]{64}/g)];
if (requirementSpecs.length !== 6 || requirementHashes.length !== 6 || /(?:~=|>=|<=|>|<)/.test(requirements)) {
  throw new Error("galaxy compiler dependency lock must contain six exact, hash-bound artifacts");
}

requireMatch(generator, /"-C", hiveAiRepo, "ls-remote", "origin"/, "credential-preserving live remote source proof");
requireMatch(generator, /rev-parse", "HEAD\^\{commit\}"[\s\S]*checkoutCommit !== sourceCommit/, "exact compiled checkout identity");
requireMatch(generator, /--ignored=matching/, "ignored-input refusal");
requireMatch(generator, /truth-input commit[\s\S]*shallow boundary/, "shallow provenance refusal");
requireMatch(generator, /fs\.fsyncSync/, "atomic durable snapshot write");
requireMatch(generator, /process\.argv\.includes\("--check"\)/, "snapshot check mode");
requireMatch(generator, /statusProjection:\s*"none"/, "no status projection");
requireMatch(generator, /gitBlobSha1[\s\S]*ls-tree[\s\S]*verifyMaterializedSource/, "tracked source byte proof");
requireMatch(generator, /REQUIRED_PUBLISHER_EVIDENCE_PATHS[\s\S]*portable_green_evidence_membership_20260722[\s\S]*RATIFY_L3_E01_V2[\s\S]*RATIFY_L3_E02_V1/, "publisher evidence closure roster");
requireMatch(generator, /graph\.evidence[\s\S]*evidenceByPath[\s\S]*sourceTreeEntries\.has\(repositoryPath\)[\s\S]*verifyMaterializedSource\(repositoryPath, expected\)/, "generic tracked evidence closure");
requireMatch(generator, /required publisher evidence did not enter the compiled closure/, "required evidence compiler inclusion gate");
const compiledIndex = generator.indexOf("const compiled =");
const postCompileRaceIndex = generator.indexOf("const remoteMainAfterCompile = remoteMainCommit();");
const snapshotAssemblyIndex = generator.indexOf("const galaxyWithoutHash =");
const snapshotDecisionIndex = generator.indexOf("if (checkOnly) {");
if (compiledIndex === -1
  || snapshotAssemblyIndex <= compiledIndex
  || postCompileRaceIndex <= snapshotAssemblyIndex
  || snapshotDecisionIndex <= postCompileRaceIndex) {
  throw new Error("post-compile living-main race gate is missing or out of order");
}
requireMatch(generator, /Hive-AI main moved during compilation/, "moving-main retry signal");
requireMatch(generator, /GALAXY_AUTOMATIC_BRIDGE === "true"/, "explicit bridge activation input");
requireMatch(generator, /GALAXY_BRIDGE_MODE === "local"/, "local convergence mode");
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
requireMatch(galaxyCore, /export function snapshotFreshness/, "testable snapshot freshness state");
requireMatch(compileJob, /fetch-depth:\s*128/, "bounded initial source history");
requireMatch(compileJob, /persist-credentials:\s*true/, "authenticated post-checkout source proof");
requireMatch(compileJob, /--deepen=896[\s\S]*--unshallow/, "progressive source history proof");

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
