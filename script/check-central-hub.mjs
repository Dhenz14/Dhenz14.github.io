import crypto, { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GALAXY_CANONICAL_GEOMETRY_HASH,
  GALAXY_GENERATOR_VERSION,
  GALAXY_RENDERER_CONTRACT_HASH,
  GALAXY_SNAPSHOT_VERSION,
  canonicalJson,
  validSnapshot,
} from "../hub-assets/galaxy-core.mjs";
import { validateIdeReleaseLatest, validateIdeReleaseTruthManifest } from "../hub-assets/ide-release-core.mjs";
import { parseJsonBytesStrict, parseJsonStrict, StrictJsonError } from "../hub-assets/strict-json.mjs";
import { validatePublishedProductTruth } from "./check-product-truth.mjs";
import { readHubFactsSync, selfTestHubFactsCustody } from "./hub-facts-custody.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const readBytes = (relative) => fs.readFileSync(path.join(root, relative));
const TITLE_MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "per", "the", "to", "via", "with"]);
const titleCase = (value) => String(value || "").toLowerCase().replace(/\b[a-z0-9']+/g, (word, offset) =>
  (offset > 0 && TITLE_MINOR_WORDS.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1));
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
const selectorInventory = (value, label) => {
  const match = value.match(/:is\(\s*([\s\S]*?)\s*\)\s*\{/);
  if (!match) throw new Error(label + " selector inventory missing");
  return match[1]
    .split(",")
    .map((selector) => selector.replace(/\s+/g, " ").trim())
    .filter(Boolean);
};
const exactSequence = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label + " drifted:\nactual=" + JSON.stringify(actual) + "\nexpected=" + JSON.stringify(expected));
  }
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
  ".github/workflows/publish-reviewed-pages.yml",
  ".github/workflows/hive-ide-public-windows-smoke.yml",
  ".github/pages-public-allowlist.v1.json",
  ".github/pages-templates/hivepoa-quarantine.html",
  "docs/PUBLIC_GALAXY_SYNC.md",
  "favicon.svg",
  "favicon.ico",
  "hub-assets/hub.css",
  "hub-assets/hub.js",
  "hub-assets/galaxy-core.mjs",
  "hub-assets/ide-release-core.mjs",
  "hub-assets/hub-facts.json",
  "hub-assets/product-truth.json",
  "hub-assets/product-truth-ledger.v1.json",
  "hub-assets/strict-json.mjs",
  "hub-assets/og.png",
  "downloads/hive-ide/latest.json",
  "downloads/hive-ide/hive-ide-release-manifest.json",
  "script/sync-galaxy-snapshot.mjs",
  "script/mark-galaxy-bridge-inactive.mjs",
  "script/check-galaxy-bridge.mjs",
  "script/check-http-surface.mjs",
  "script/check-galaxy-core.mjs",
  "script/check-ide-release.mjs",
  "script/run-ide-public-windows-smoke.ps1",
  "script/check-signed-release.mjs",
  "script/check-signed-release-portability.mjs",
  "script/check-live-parity.mjs",
  "script/check-publisher-races.mjs",
  "script/check-product-truth.mjs",
  "script/build-public-pages.mjs",
  "script/check-public-pages-artifact.mjs",
  "script/hub-facts-custody.mjs",
  "script/publisher-candidate-policy.mjs",
  "script/requirements-galaxy-sync.txt",
  "HivePoA/index.html",
  "HivePoA/download/index.html",
  "HivePoA/verify/index.html",
  "HivePoA/releases/index.html",
  "HivePoA/get-started/index.html",
  "HivePoA/tester-network/index.html",
  "HivePoA/distribution/index.html",
  "HivePoA/public-surface-quarantine-receipt.json",
  ".github/test-fixtures/hivepoa/portable-signed-release-fixture.v1.json",
  ".github/test-fixtures/hivepoa/historical-index-1a607c451406.html",
  ".github/test-fixtures/hivepoa/tester-network-authorization-3f397e3bc3a6.js",
];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`required hub path missing: ${relative}`);
}

const retiredRawPublicPaths = Object.freeze([
  "HivePoA/distribution-assets/distribution.css",
  "HivePoA/distribution-assets/distribution.js",
  "HivePoA/distribution-assets/tester-network-authorization.d.ts",
  "HivePoA/distribution-assets/tester-network-authorization.js",
  "HivePoA/cid-mirrors/bafkreiatijblkzbvtdndxlme7rbx4r2zdfttoe44xahx7ab57fqplqshge.json",
  "HivePoA/cid-mirrors/bafkreibdvxhdmkxbnf6iqnvmloc3q3t2ngq34psakn5ys26yddn3z7xr5q.json",
  "HivePoA/cid-mirrors/bafkreicft4cqngoscw5c3st4bw6tvjc7a32gwhj2pysedmwedc7df7mu7y.json",
  "HivePoA/cid-mirrors/bafkreicglv7rvpweykprefu72z742ynj6by3p6vmwtnnqzti553njjvg24.json",
  "HivePoA/cid-mirrors/bafkreicnn2esivmzvtaqucmjcyysqixqaff2z32glicfs6ifsuckwvdc2a.json",
  "HivePoA/cid-mirrors/bafkreidt6fnduic6wijlhhmv3cf7jj7e2o2z4cxyndksrl4jb6npbubqa4.json",
  "HivePoA/cid-mirrors/bafkreiepwx7dxa4ljdfr2ygtclzfex7qhmwjpxdbgl54v6pcmdtjenpdaq.json",
  "HivePoA/cid-mirrors/bafkreifzenpkcb4pcu7ih5j3eb4jf6ooki6vnunxqg3bjd5a4tmrwwguly.json",
  "HivePoA/cid-mirrors/bafkreig7f36xgvlesj5htaobbdn6chigkp7jynselzxyqipo7ooa4fksqy.json",
  "HivePoA/cid-mirrors/bafkreiglr46qzxtrwyib37e5yskwmldk5pmiduaz5rdp2flg2gfjsnxhvu.json",
  "HivePoA/cid-mirrors/bafkreigztluszx7efo7h26g3k6fppisc6v5lgjeudld27typvtpjyc2mka.json",
  "HivePoA/cid-mirrors/bafkreih656qofx55wbzf4bjprmfk4pl57puazqjw6ixpn7g6wcxlp64fki.json",
  "HivePoA/cid-mirrors/bafkreihdfh5a2tig56aobhfmfjp5njxiguijg7ni2umy2bwxxigftaqeo4.json",
  "HivePoA/cid-mirrors/bafkreihhvomr6ncawwsg6fd4ma5rkrtkpsqgqzdyu4w6yd7egdzh7rqqte.json",
  "HivePoA/cid-mirrors/bafkreihnwn65vtnyrohj5vbi6efzv3vvlfholk7pz2nqirutic63qcevea.json",
  "HivePoA/cid-mirrors/bafkreihsrbx7h4sycmuf5mkmogpbvhqtbbhp7lajwxulrvjslsslzmjjky.json",
]);
for (const relative of retiredRawPublicPaths) {
  if (fs.existsSync(path.join(root, relative))) throw new Error(`retired raw public asset is still present: ${relative}`);
}

const hivePoaQuarantineRoutes = Object.freeze([
  "HivePoA/index.html",
  "HivePoA/download/index.html",
  "HivePoA/verify/index.html",
  "HivePoA/releases/index.html",
  "HivePoA/get-started/index.html",
  "HivePoA/tester-network/index.html",
  "HivePoA/distribution/index.html",
]);
for (const relative of hivePoaQuarantineRoutes) {
  const bytes = fs.readFileSync(path.join(root, relative));
  const source = bytes.toString("utf8");
  const gitBlobOid = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if (bytes.length !== 9138
    || sha256(bytes) !== "568d50cb18499b975f4584b3c9b8b490c6e4ae9d44becec38078a23988472d78"
    || gitBlobOid !== "5b24c91992413d92781508bdd042e7030dea1e17") {
    throw new Error(`HivePoA quarantine route identity drifted: ${relative}`);
  }
  requireMatch(source, /default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'/, `${relative} fail-closed CSP`);
  requireMatch(source, /HOLD · ACTIONS DISABLED[\s\S]*provenance only:[\s\S]*not current proof of package delivery, a live coordinator, public enrollment, execution, runtime acceptance, public-network availability, or product-live behavior/i, `${relative} all-plane HOLD`);
  requireMatch(source, /No action surface[\s\S]*No download, verifier, installer, enrollment, credit, or network action is exposed/i, `${relative} action quarantine`);
  requireMatch(source, /<strong>DELIVERY<\/strong>HOLD[\s\S]*<strong>COORDINATOR<\/strong>NOT PROVEN[\s\S]*<strong>ENROLLMENT<\/strong>NOT PUBLISHED[\s\S]*<strong>PRODUCT LIVE<\/strong>FALSE/, `${relative} evidence-plane status`);
  requireMatch(source, /Authority: none · public actions: none · source repair: held/i, `${relative} authority ceiling`);
  const hrefs = [...source.matchAll(/\shref=["']([^"']+)["']/gi)].map((match) => match[1]);
  if (JSON.stringify(hrefs) !== JSON.stringify(["/#product-truth"])) {
    throw new Error(`HivePoA quarantine route must expose only the Product Truth link: ${relative}`);
  }
  requireNoMatch(source, /<\s*(?:script|form|button|input|select|textarea|iframe|object|embed)\b|\b(?:download|formaction|onclick|onload)=/i, `${relative} executable or action surface`);
}
const quarantineReceiptBytes = fs.readFileSync(path.join(root, "HivePoA", "public-surface-quarantine-receipt.json"));
const quarantineReceiptBlob = crypto.createHash("sha1").update(`blob ${quarantineReceiptBytes.length}\0`).update(quarantineReceiptBytes).digest("hex");
if (quarantineReceiptBytes.length !== 5310
  || sha256(quarantineReceiptBytes) !== "ac1cd5ac2a678b5bb46e2503c90ab9364b80cd562f2725039137ab74da94ec1a"
  || quarantineReceiptBlob !== "a4ff709e53106fd932224c6d7a6f2e48ee13e7e0") {
  throw new Error("HivePoA quarantine receipt physical identity drifted");
}
const quarantineReceipt = parseJsonBytesStrict(quarantineReceiptBytes, "HivePoA quarantine receipt");
const quarantinedReceiptPaths = quarantineReceipt.quarantinedEntries?.map((entry) => entry.path).sort();
if (quarantineReceipt.schema !== "hivepoa.public_surface_quarantine.v1"
  || quarantineReceipt.status !== "ACTIVE_CANDIDATE_NOT_DEPLOYED"
  || quarantineReceipt.mode !== "REVERSIBLE_PUBLIC_SITE_QUARANTINE"
  || quarantineReceipt.sharedReplacement?.bytes !== 9138
  || quarantineReceipt.sharedReplacement?.sha256 !== "568d50cb18499b975f4584b3c9b8b490c6e4ae9d44becec38078a23988472d78"
  || quarantineReceipt.sharedReplacement?.gitBlobOid !== "5b24c91992413d92781508bdd042e7030dea1e17"
  || JSON.stringify(quarantineReceipt.sharedReplacement?.scriptsLoaded) !== "[]"
  || JSON.stringify(quarantineReceipt.sharedReplacement?.externalAssetsLoaded) !== "[]"
  || quarantineReceipt.sharedReplacement?.onlyLink !== "/#product-truth"
  || JSON.stringify(quarantinedReceiptPaths) !== JSON.stringify([...hivePoaQuarantineRoutes].sort())
  || quarantineReceipt.preservedGeneratedAssets?.distributionScript?.servedByQuarantineEntries !== false
  || quarantineReceipt.preservedGeneratedAssets?.authorizationModule?.servedByQuarantineEntries !== false
  || quarantineReceipt.publicClaimBoundary?.packageDelivery !== "HOLD"
  || quarantineReceipt.publicClaimBoundary?.liveCoordinator !== "NOT_PROVEN"
  || quarantineReceipt.publicClaimBoundary?.publicEnrollment !== "NOT_PUBLISHED"
  || quarantineReceipt.publicClaimBoundary?.execution !== "NOT_PROVEN"
  || quarantineReceipt.publicClaimBoundary?.publicNetworkAvailability !== "NOT_PROVEN"
  || quarantineReceipt.publicClaimBoundary?.productLive !== false
  || quarantineReceipt.publicClaimBoundary?.downloadAction !== false
  || quarantineReceipt.publicClaimBoundary?.verificationAction !== false
  || quarantineReceipt.publicClaimBoundary?.enrollmentAction !== false
  || quarantineReceipt.publicClaimBoundary?.networkAction !== false
  || quarantineReceipt.canonicalSourceRepairPerformed !== false
  || quarantineReceipt.authorityConferred !== false
  || quarantineReceipt.commitCreated !== false
  || quarantineReceipt.pushed !== false
  || quarantineReceipt.deployed !== false) {
  throw new Error("HivePoA quarantine receipt exceeded or diverged from the frozen seven-route HOLD");
}

const portableFixtureBytes = fs.readFileSync(path.join(root, ".github", "test-fixtures", "hivepoa", "portable-signed-release-fixture.v1.json"));
const portableFixture = parseJsonBytesStrict(portableFixtureBytes, "portable signed-release fixture");
if (portableFixture.currentDeployment?.status !== "UNKNOWN_NOT_OBSERVED"
  || portableFixture.currentDeployment?.observedAt !== null
  || portableFixture.currentDeployment?.receiptRef !== null
  || portableFixture.currentDeployment?.reasonCode !== "NO_CURRENT_DEPLOYMENT_READBACK_IN_CANDIDATE") {
  throw new Error("portable signed-release fixture invented current deployment truth");
}

const html = read("index.html");
const gitAttributes = read(".gitattributes");
const notFound = read("404.html");
const css = read("hub-assets/hub.css");
for (const [label, source] of [
  ["root", html],
  ["404", notFound],
  ...hivePoaQuarantineRoutes.map((relative) => [relative, read(relative)]),
]) {
  requireNoMatch(source, /(?:cid-mirrors|distribution-assets|\.github\/test-fixtures)/i, `${label} retired raw-asset dependency`);
}
const zeroSquintCopyBlock = boundedBlock(css, "/* ZERO_SQUINT_COPY_START */", "/* ZERO_SQUINT_COPY_END */", "zero-squint copy");
const zeroSquintMetaBlock = boundedBlock(css, "/* ZERO_SQUINT_META_START */", "/* ZERO_SQUINT_META_END */", "zero-squint metadata");
const expectedZeroSquintCopySelectors = [
  ".truth-intro strong",
  ".truth-boundary",
  ".truth-stats dd",
  ".trust-chain small",
  ".organ-card p",
  ".organ-card.organ-hands a",
  ".organ-card.organ-memory small",
  ".ide-release-status strong",
  ".ide-release-warning",
  ".ide-release-actions a.button.button-primary",
  ".ide-start-steps p",
  ".ide-start-here-reassurance",
  ".ide-start-here-intro .text-link",
  ".ide-stack-grid p",
  ".ide-release-digest p",
  ".ide-release-digest code",
  ".body-bridge-copy small",
  ".body-bridge-boundary",
  ".body-surface.body-surface-presentation > small",
  ".body-surface.body-surface-operator > small",
  ".galaxy-public-boundary",
  ".galaxy-start-guidance",
  ".stage-label",
  ".pipeline-note p",
  ".pipeline-note p strong",
  ".microcopy",
  ".command-cycle-boundary",
  ".release-path small",
  ".release-bindings code",
  ".trust-audit p",
  ".trust-audit code",
  ".tester-cards p",
  ".site-footer > p",
];
const expectedZeroSquintMetaSelectors = [
  ".truth-intro span:last-child",
  ".panel-state",
  ".capability-list span",
  ".capability-list b",
  ".system-junction span",
  ".trust-chain > div > span",
  ".trust-chain strong",
  ".system-panels .text-link",
  ".system-panels .text-link span",
  ".organ-code",
  ".organ-card small",
  ".organ-card a",
  ".ide-release-status small",
  ".ide-release-actions .button",
  ".ide-release-actions .text-link",
  ".ide-release-actions .text-link span",
  ".ide-release-warning > span:first-child",
  ".ide-release-facts dt",
  ".ide-release-facts code",
  ".ide-start-steps li > span",
  ".ide-stack-grid article > span",
  ".ide-release-digest span",
  ".body-bridge-signal",
  ".body-surface > span",
  ".body-surface > span b",
  ".body-surface > strong",
  ".body-surface > strong i",
  ".body-surface > small",
  ".organ-footer span",
  ".body-bridge-boundary > span",
  ".boundary-note > span:first-child",
  ".pipeline-rail li > span",
  ".pipeline-rail strong",
  ".pipeline-rail small",
  ".pipeline-note > a",
  ".pipeline-note > a span",
  ".release-status-line small",
  ".release-status-line strong",
  ".release-sequence",
  ".release-evidence-bar span",
  ".release-evidence-bar strong",
  ".release-facts dt",
  ".release-facts dd",
  ".release-path li > span",
  ".release-path strong",
  ".release-bindings span",
  ".release-bindings button",
  ".transport-map span",
  ".transport-map strong",
  ".transport-map small",
  ".trust-audit span",
  ".trust-audit a",
  ".release-actions .button",
  ".release-actions .button span",
  ".tester-cta .button",
  ".tester-cta .button span",
  ".access-actions .button",
  ".access-actions .button span",
  ".access-actions .button small",
  ".access-actions .text-link",
  ".access-actions .text-link span",
  ".access-visual > span",
  ".footer-brand small",
  ".site-footer nav a",
];
const zeroSquintCopySelectors = selectorInventory(zeroSquintCopyBlock, "zero-squint copy");
const zeroSquintMetaSelectors = selectorInventory(zeroSquintMetaBlock, "zero-squint metadata");
exactSequence(zeroSquintCopySelectors, expectedZeroSquintCopySelectors, "zero-squint copy selectors");
exactSequence(zeroSquintMetaSelectors, expectedZeroSquintMetaSelectors, "zero-squint metadata selectors");
const zeroSquintSelectorOverlap = zeroSquintCopySelectors.filter((selector) => zeroSquintMetaSelectors.includes(selector));
if (zeroSquintSelectorOverlap.length) {
  throw new Error("zero-squint selector classes overlap: " + zeroSquintSelectorOverlap.join(","));
}
const js = read("hub-assets/hub.js");
const toastContractStart = js.indexOf("let toastTimer = 0;");
const toastContractEnd = js.indexOf("function safeStorageGet", toastContractStart);
if (toastContractStart < 0 || toastContractEnd <= toastContractStart) {
  throw new Error("toast routing implementation block missing");
}
const toastContract = js.slice(toastContractStart, toastContractEnd);
const globalToastFixture = {
  textContent: "",
  visible: new Set(),
  classList: {
    add(value) { globalToastFixture.visible.add(value); },
    remove(value) { globalToastFixture.visible.delete(value); },
  },
};
const atlasStatusFixture = { textContent: "" };
let atlasFixtureOpen = false;
let toastTimerDelay = 0;
const toastWindowFixture = {
  clearTimeout() {},
  setTimeout(callback, delay) {
    if (typeof callback !== "function") throw new Error("toast timer callback must be callable");
    toastTimerDelay = delay;
    return 1;
  },
};
const toastSelectorFixture = (selector) => {
  if (selector === "[data-toast]") return globalToastFixture;
  if (selector === "[data-galaxy-atlas-status]") return atlasStatusFixture;
  if (selector === "[data-galaxy-dialog].is-full-atlas [data-galaxy-atlas-status]") {
    return atlasFixtureOpen ? atlasStatusFixture : null;
  }
  throw new Error(`unexpected toast selector ${selector}`);
};
const toastContractFactory = new Function("window", "$", `${toastContract}\nreturn { clearToast, showToast };`);
const toastContractApi = toastContractFactory(toastWindowFixture, toastSelectorFixture);
toastContractApi.showToast("Global recovery");
if (globalToastFixture.textContent !== "Global recovery"
  || !globalToastFixture.visible.has("is-visible")
  || atlasStatusFixture.textContent !== ""
  || toastTimerDelay !== 2600) {
  throw new Error("global toast fixture no longer preserves normal outside-atlas guidance");
}
atlasFixtureOpen = true;
toastContractApi.showToast("Atlas recovery");
if (atlasStatusFixture.textContent !== "Atlas recovery"
  || globalToastFixture.textContent !== ""
  || globalToastFixture.visible.has("is-visible")) {
  throw new Error("full-atlas guidance did not move exclusively into the dialog-local live status");
}
toastContractApi.clearToast();
if (atlasStatusFixture.textContent !== "" || globalToastFixture.textContent !== "") {
  throw new Error("shared toast clear left transient guidance behind");
}
const galaxyCore = read("hub-assets/galaxy-core.mjs");
const ideReleaseCore = read("hub-assets/ide-release-core.mjs");
const generator = read("script/sync-galaxy-snapshot.mjs");
const bridgeFailClosed = read("script/mark-galaxy-bridge-inactive.mjs");
const facts = readHubFactsSync(path.join(root, "hub-assets", "hub-facts.json"), "checked-in hub-facts snapshot");
const hubFactsHostileCases = selfTestHubFactsCustody();
const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const landingFlags = ["--expect-landing-commit", "--expect-landing-tree", "--expect-landing-sha256", "--expect-landing-bytes", "--expect-landing-blob"];
const landingFlagCount = landingFlags.filter((flag) => process.argv.includes(flag)).length;
if (landingFlagCount !== 0 && landingFlagCount !== landingFlags.length) {
  throw new Error("central hub landing expectation requires commit, tree, SHA-256, byte-count, and blob flags together");
}
// The landing this hub is built to expect, pinned here rather than taken from the
// manifest it is checking. A manifest that claims a different landing must fail even
// when no flags are supplied, so the default run is the strict one.
const PINNED_LANDING = Object.freeze({
  commit: "0ab04f6c19ffd41bb162bea674e77853fb27cc0e",
  tree: "1de15a085a7c41788214d5c0d9c0dfaf4f02eb1c",
  sha256: "a4a336b47c3a28da3c08c79b07ff2ef92702dc35c09f8a330df74368faf7f056",
  bytes: 49342,
  blobOid: "c1036d2fc877e058965688fe8da5097576a37826",
});
const expectedLanding = landingFlagCount
  ? {
    commit: valueAfter("--expect-landing-commit") ?? "",
    tree: valueAfter("--expect-landing-tree") ?? "",
    sha256: valueAfter("--expect-landing-sha256") ?? "",
    bytes: Number(valueAfter("--expect-landing-bytes")),
    blobOid: valueAfter("--expect-landing-blob") ?? "",
  }
  : PINNED_LANDING;
const productTruthVerification = validatePublishedProductTruth({ selfTest: true, expectedLanding });
const browserTruthStart = js.indexOf('const PRODUCT_TRUTH_SCHEMA = "hive.ecosystem.product-truth.public-projection.v2";');
const browserTruthEnd = js.indexOf("function createTruthElement", browserTruthStart);
if (browserTruthStart < 0 || browserTruthEnd <= browserTruthStart) {
  throw new Error("browser Product Truth validator implementation block missing");
}
const browserTruthValidatorFactory = new Function(
  "parseJsonStrict",
  `${js.slice(browserTruthStart, browserTruthEnd)}\nreturn { canonicalJson, parseProductTruthJsonStrict, validateProductTruthManifest, ProductTruthBrowserError };`,
);
const browserTruthApi = browserTruthValidatorFactory(parseJsonStrict);
const rebindBrowserTruthFixture = (fixture) => {
  const projection = structuredClone(fixture);
  delete projection.bindingDigest;
  fixture.bindingDigest.value = sha256(canonicalJson(projection));
};
const expectBrowserTruthReject = async (label, mutate) => {
  const fixture = structuredClone(productTruthVerification.manifest);
  mutate(fixture);
  rebindBrowserTruthFixture(fixture);
  try {
    await browserTruthApi.validateProductTruthManifest(fixture, facts, productTruthVerification.ledger);
  } catch (error) {
    return {
      label,
      passed: error instanceof browserTruthApi.ProductTruthBrowserError && error.code === "PRODUCT_TRUTH_BROWSER_CONTRACT_VIOLATION",
      observedCode: error?.code ?? error?.name ?? typeof error,
    };
  }
  return { label, passed: false };
};
const expectBrowserTruthJsonReject = (label, source, expectedCode) => {
  try {
    browserTruthApi.parseProductTruthJsonStrict(source);
  } catch (error) {
    return {
      label,
      passed: error instanceof StrictJsonError && error.code === expectedCode,
      observedCode: error?.code ?? error?.name ?? typeof error,
    };
  }
  return { label, passed: false };
};
const expectBrowserTruthBytesReject = (label, bytes, expectedCode) => {
  try {
    parseJsonBytesStrict(bytes, `${label} fixture`);
  } catch (error) {
    return {
      label,
      passed: error instanceof StrictJsonError && error.code === expectedCode,
      observedCode: error?.code ?? error?.name ?? typeof error,
    };
  }
  return { label, passed: false };
};
await browserTruthApi.validateProductTruthManifest(productTruthVerification.manifest, facts, productTruthVerification.ledger);
const browserTruthSelfTests = await Promise.all([
  expectBrowserTruthReject("browser_rehashed_identity_answer_refused", (value) => { value.what_architecture_am_i.answer = "GENERIC_HIVE"; }),
  expectBrowserTruthReject("browser_rehashed_installed_runtime_promotion_refused", (value) => { value.truth_subjects.installed_runtime.subject_status = "PRODUCT_LIVE"; }),
  expectBrowserTruthReject("browser_rehashed_unbound_landing_promotion_refused", (value) => {
    value.canonicalManifest.status = "LANDED_HASH_VERIFIED";
    value.canonicalManifest.landedCommit = "1".repeat(40);
    value.canonicalManifest.landedTree = "3".repeat(40);
    value.canonicalManifest.landedSha256 = "2".repeat(64);
    value.canonicalManifest.landedBytes = value.canonicalManifest.candidateBytes;
    value.canonicalManifest.landedGitBlobOid = "4".repeat(40);
  }),
  expectBrowserTruthReject("browser_rehashed_unfrozen_subject_evidence_ref_refused", (value) => { value.truth_subjects.source_atlas.evidenceRef = "self-attested"; }),
  expectBrowserTruthReject("browser_rehashed_release_byte_verification_promotion_refused", (value) => {
    value.truth_subjects.released_tester_5.claim = "The public package is functionally certified.";
    value.truth_subjects.released_tester_5.packageContentsStatus = "VERIFIED";
    value.truth_subjects.released_tester_5.artifactExecuted = true;
  }),
  expectBrowserTruthReject("browser_rehashed_tester6_publication_promotion_refused", (value) => {
    value.truth_subjects.candidate_tester_6_publication.githubReleaseApiStatus = 200;
    value.truth_subjects.candidate_tester_6_publication.url = "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.6/Hive-IDE-OneClick-Windows-x64.exe";
  }),
  expectBrowserTruthReject("browser_rehashed_windows_platform_certification_refused", (value) => {
    const windows = value.platforms.find((entry) => entry.id === "windows-x64-remote");
    windows.supportStatus = "PUBLIC_FUNCTIONAL_TESTING_ARTIFACT";
    windows.testStatus = "FUNCTIONALLY_CERTIFIED";
    windows.packageStatus = "PUBLIC_HTTPS_ARTIFACT_BYTES_VERIFIED";
  }),
  expectBrowserTruthJsonReject("browser_duplicate_manifest_key_refused", '{"schema":"first","schema":"second"}', "JSON_DUPLICATE_KEY"),
  expectBrowserTruthJsonReject("browser_nested_duplicate_manifest_key_refused", '{"truth_subjects":{"released_tester_5":{"claim":"first","claim":"second"}}}', "JSON_DUPLICATE_KEY"),
  expectBrowserTruthJsonReject("browser_malformed_manifest_refused", '{"schema":', "JSON_MISSING_VALUE"),
  expectBrowserTruthJsonReject("browser_bom_refused", '\uFEFF{"schema":1}', "JSON_BOM_FORBIDDEN"),
  expectBrowserTruthJsonReject("browser_unpaired_surrogate_refused", '{"value":"\\ud800"}', "JSON_UNPAIRED_SURROGATE"),
  expectBrowserTruthJsonReject("browser_normalization_collision_refused", '{"e\\u0301":1,"é":2}', "JSON_NORMALIZATION_COLLISION"),
  expectBrowserTruthJsonReject("browser_non_rfc8259_whitespace_refused", '{\u00a0"schema":1}', "JSON_EXPECTED_STRING"),
  expectBrowserTruthJsonReject("browser_non_finite_number_refused", '{"value":1e999}', "JSON_NON_FINITE_NUMBER"),
  expectBrowserTruthBytesReject("browser_invalid_utf8_refused", new Uint8Array([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d]), "JSON_INVALID_UTF8"),
]);
if (browserTruthSelfTests.some((test) => !test.passed)) {
  throw new Error(`browser Product Truth hostile self-test failed: ${browserTruthSelfTests.filter((test) => !test.passed).map((test) => test.label).join(",")}`);
}
const ideLatestBytes = readBytes("downloads/hive-ide/latest.json");
const ideTruthManifestBytes = readBytes("downloads/hive-ide/hive-ide-release-manifest.json");
const ideLatestSource = ideLatestBytes.toString("utf8");
const ideTruthManifestSource = ideTruthManifestBytes.toString("utf8");
if (sha256(ideLatestBytes) !== "ea379e56f119f4f1e7f57befb1d7314aa3daefb8a97bcb28b6c811526a7de9f1"
  || ideLatestBytes.byteLength !== 4812
  || sha256(ideTruthManifestBytes) !== "9032328c7de85a750ae0f945ca29094782d2d20444737cbc39724a50b4603622"
  || ideTruthManifestBytes.byteLength !== 8957) {
  throw new Error("Hive IDE v2 public truth bytes drifted from the frozen candidate");
}
const ideLatest = parseJsonBytesStrict(ideLatestBytes, "Hive IDE latest v2 feed");
const ideTruthManifest = parseJsonBytesStrict(ideTruthManifestBytes, "Hive IDE release truth manifest v2");
const validatedIdeLatest = validateIdeReleaseLatest(ideLatest);
const validatedIdeTruth = validateIdeReleaseTruthManifest(ideTruthManifest, validatedIdeLatest, {
  now: Date.parse(ideLatest.outerExecutableObservation.apiObservedAtUtc) + 1,
});
if (!validatedIdeTruth.evidenceCurrent) throw new Error("Hive IDE v2 verifier rejected its frozen within-window observation fixture");
const expiredIdeTruth = validateIdeReleaseTruthManifest(ideTruthManifest, validatedIdeLatest, {
  now: Date.parse(ideLatest.outerExecutableObservation.validUntilUtc),
});
if (expiredIdeTruth.evidenceCurrent) throw new Error("Hive IDE v2 verifier accepted active evidence at the exact expiry boundary");
exactKeys(ideLatest, [
  "schema", "product", "version", "stage", "channel", "releaseTag", "releasedAtUtc", "sourceCommit", "embeddedHiveAiCommit",
  "installerUrl", "installerSha256", "installerSizeBytes", "historicalManifestUrl", "historicalManifestSha256", "truthManifestUrl",
  "truthManifestSha256", "outerExecutableObservation", "publisherAuthentication", "claimPlanes", "downloadDisposition", "claimBoundary",
], "Hive IDE latest v2 feed");
exactKeys(ideLatest.outerExecutableObservation, [
  "status", "observer", "apiObservedAtUtc", "downloadHashObservedAtUtc", "validUntilUtc", "validityPolicy", "method", "releaseId",
  "assetId", "assetState", "responseChain", "tlsVerified", "fullBodyDownloaded", "exactByteCountMatched", "exactSha256Matched",
  "rawHttpRetained", "independentlySigned", "evidenceRef", "evidenceReceiptSchema", "evidenceReceiptId", "evidenceReceiptBytes",
  "evidenceReceiptSha256", "evidenceReceiptSelfZeroSha256", "evidenceReceiptGitBlobOid", "landingStatus", "publicRetrievability",
], "Hive IDE outer executable observation");
exactKeys(ideLatest.publisherAuthentication, [
  "status", "publisherAuthenticated", "authenticodeStatus", "signerCertificate", "timestampCertificate", "observedAtUtc", "validUntilUtc",
  "evidenceRef", "smartScreenWarningExpected", "claim",
], "Hive IDE publisher authentication");
exactKeys(ideLatest.claimPlanes, ["outerExecutableBytes", "packageContents", "installation", "runtime", "productLive", "publicFunctionalTesting"], "Hive IDE claim planes");
for (const [plane, value] of Object.entries(ideLatest.claimPlanes)) {
  exactKeys(value, ["status", "observedAtUtc", "validUntilUtc", "evidenceRef"], `Hive IDE ${plane} claim plane`);
}
exactKeys(ideLatest.downloadDisposition, ["status", "activeDownloadAuthorized", "reason", "requires"], "Hive IDE download disposition");
exactKeys(ideTruthManifest, [
  "schema", "product", "release", "historicalReleaseManifest", "outerExecutable", "sourceDeclarations", "historicalBuildDeclarations",
  "claimPlanes", "downloadDisposition", "testerPolicy", "claimBoundary",
], "Hive IDE release truth manifest v2");
const expectedPublicTester = Object.freeze({
  tag: "hive-ide-v0.3.0-tester.5",
  historicalManifestUrl: "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.5/hive-ide-release-manifest.json",
  installerUrl: "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.5/Hive-IDE-OneClick-Windows-x64.exe",
  installerSizeBytes: 924864317,
  installerSha256: "be1795640763e99315b426757c76d655f6f07f92701d040c62f6126c1401b000",
  sourceCommit: "6f7fd8a9a18c8921aa0fad1fe5b0b901bacd3383",
  embeddedHiveAiCommit: "a0fe64832edb801c9944c0923e222a64ef14e498",
});
const outerObservation = ideLatest.outerExecutableObservation;
const publisherAuthentication = ideLatest.publisherAuthentication;
if (ideLatest.schema !== "hive.ide.public_release_latest.v2"
  || ideLatest.releaseTag !== expectedPublicTester.tag
  || ideLatest.historicalManifestUrl !== expectedPublicTester.historicalManifestUrl
  || ideLatest.installerUrl !== expectedPublicTester.installerUrl
  || ideLatest.installerSizeBytes !== expectedPublicTester.installerSizeBytes
  || ideLatest.installerSha256 !== expectedPublicTester.installerSha256
  || ideLatest.sourceCommit !== expectedPublicTester.sourceCommit
  || ideLatest.embeddedHiveAiCommit !== expectedPublicTester.embeddedHiveAiCommit
  || ideLatest.truthManifestUrl !== "https://dhenz14.github.io/downloads/hive-ide/hive-ide-release-manifest.json"
  || ideLatest.truthManifestSha256 !== sha256(ideTruthManifestSource)
  || ideLatest.stage !== "tester"
  || ideLatest.channel !== "unsigned-public-tester") {
  throw new Error("current public Hive IDE feed must remain the exact tester.5 v2 truth cut");
}
if (outerObservation.status !== "PUBLIC_REMOTE_BYTES_VERIFIED"
  || outerObservation.observer !== "independent-public-artifact-verifier"
  || outerObservation.validityPolicy !== "24_HOURS_FROM_API_READBACK"
  || outerObservation.method !== "GITHUB_RELEASE_API_PLUS_FULL_BODY_DOWNLOAD_BYTE_COUNT_AND_SHA256"
  || outerObservation.releaseId !== 366980498
  || outerObservation.assetId !== 505603161
  || outerObservation.assetState !== "uploaded"
  || outerObservation.responseChain !== "302_TO_200"
  || outerObservation.tlsVerified !== true
  || outerObservation.fullBodyDownloaded !== true
  || outerObservation.exactByteCountMatched !== true
  || outerObservation.exactSha256Matched !== true
  || outerObservation.rawHttpRetained !== false
  || outerObservation.independentlySigned !== false
  || outerObservation.evidenceRef !== "Dhenz14/Hive-AI:tests/fixtures/constellation_public_truth/tester5_remote_bytes_observation_v1.json"
  || outerObservation.evidenceReceiptSchema !== "hiveai.public_artifact_remote_bytes_observation.v1"
  || outerObservation.evidenceReceiptId !== "tester5-remote-bytes-20260823T192009Z"
  || outerObservation.evidenceReceiptBytes !== 3026
  || outerObservation.evidenceReceiptSha256 !== "6f8890a30285200e2ce1289672b17760e202ce85978cacd18e4eac7009ea3f56"
  || outerObservation.evidenceReceiptSelfZeroSha256 !== "8bf78ee21940a064daf51a621ecca7a4bbb9431f5cf7292a29b233a40f3da15b"
  || outerObservation.evidenceReceiptGitBlobOid !== "3703036fc42ab35413462ff343b5357a7dae9f05"
  || outerObservation.landingStatus !== "LANDED_HASH_VERIFIED"
  || outerObservation.publicRetrievability !== "PRIVATE_SOURCE_NOT_PUBLICLY_RETRIEVABLE"
  || Date.parse(outerObservation.validUntilUtc) <= Date.parse(outerObservation.apiObservedAtUtc)) {
  throw new Error("tester.5 remote outer-byte observation or receipt custody drifted");
}
if (publisherAuthentication.status !== "NOT_SIGNED"
  || publisherAuthentication.publisherAuthenticated !== false
  || publisherAuthentication.authenticodeStatus !== "NotSigned"
  || publisherAuthentication.signerCertificate !== null
  || publisherAuthentication.timestampCertificate !== null
  || publisherAuthentication.smartScreenWarningExpected !== true
  || publisherAuthentication.validUntilUtc !== outerObservation.validUntilUtc
  || !/not a publisher signature, identity proof, software-safety verdict, or runtime attestation/i.test(publisherAuthentication.claim)) {
  throw new Error("tester.5 unsigned publisher-authentication boundary drifted");
}
if (ideLatest.claimPlanes.outerExecutableBytes.status !== "VERIFIED"
  || ideLatest.claimPlanes.packageContents.status !== "UNKNOWN"
  || ideLatest.claimPlanes.installation.status !== "UNKNOWN"
  || ideLatest.claimPlanes.runtime.status !== "UNKNOWN"
  || ideLatest.claimPlanes.productLive.status !== "UNKNOWN"
  || ideLatest.claimPlanes.publicFunctionalTesting.status !== "HOLD"
  || ideLatest.downloadDisposition.status !== "HOLD"
  || ideLatest.downloadDisposition.activeDownloadAuthorized !== false
  || ideLatest.downloadDisposition.reason !== "UNSIGNED_AND_INSTALL_RUNTIME_UNVERIFIED"
  || ideLatest.downloadDisposition.requires !== "SEPARATE_UNEXPIRED_OPERATOR_AUTHORIZATION") {
  throw new Error("tester.5 claim planes or download HOLD were promoted beyond evidence");
}
if (ideTruthManifest.schema !== "hive.ide.public_release_truth_manifest.v2"
  || ideTruthManifest.release?.tag !== expectedPublicTester.tag
  || ideTruthManifest.release?.installerUrl !== expectedPublicTester.installerUrl
  || ideTruthManifest.outerExecutable?.sizeBytes !== expectedPublicTester.installerSizeBytes
  || ideTruthManifest.outerExecutable?.sha256 !== expectedPublicTester.installerSha256
  || JSON.stringify(ideTruthManifest.outerExecutable?.observation) !== JSON.stringify(outerObservation)
  || ideTruthManifest.outerExecutable?.publisherAuthentication?.status !== "NOT_SIGNED"
  || ideTruthManifest.claimPlanes?.packageContents?.status !== "UNKNOWN"
  || ideTruthManifest.claimPlanes?.installation?.status !== "UNKNOWN"
  || ideTruthManifest.claimPlanes?.runtime?.status !== "UNKNOWN"
  || ideTruthManifest.claimPlanes?.productLive?.status !== "UNKNOWN"
  || ideTruthManifest.claimPlanes?.publicFunctionalTesting?.status !== "HOLD"
  || ideTruthManifest.downloadDisposition?.activeDownloadAuthorized !== false) {
  throw new Error("Hive IDE latest and truth manifest evidence planes diverged");
}
const ideReleaseSerialization = `${ideLatestSource}\n${ideTruthManifestSource}`;
if (!ideLatest.installerUrl.includes(expectedPublicTester.tag)
  || !ideLatest.historicalManifestUrl.includes(expectedPublicTester.tag)
  || ideLatest.installerUrl.includes("tester.6")
  || ideLatest.historicalManifestUrl.includes("tester.6")) {
  throw new Error("unpublished tester.6 must not become a current or downloadable public release");
}
if (/readyForPublicFunctionalTesting|"cleanSourceWorktrees"\s*:\s*true|"offlineBundledDependencies"\s*:\s*true|installedApplication/i.test(ideReleaseSerialization)) {
  throw new Error("superseded Hive IDE v1 readiness or installed-state claims leaked into the v2 truth cut");
}
const divisionNavigatorLabels = facts.galaxy.divisions.map((division) => `${division.code} · ${titleCase(division.name)}`);
if (divisionNavigatorLabels.length !== 16 || divisionNavigatorLabels.some((label, index) => (
  !label.startsWith(`${String.fromCharCode(65 + index)} · `)
  || label !== `${facts.galaxy.divisions[index].code} · ${titleCase(facts.galaxy.divisions[index].name)}`
  || label.includes("…")
))) {
  throw new Error("division navigator must map the exact facts-backed A–P full-name catalog");
}
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
const wheelWiring = boundedBlock(
  js,
  'this.canvas.addEventListener("wheel"',
  'this.canvas.addEventListener("keydown"',
  "wheel handler",
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

requireMatch(html, /One Constellation Brain\.[\s\S]*Every system in orbit\./, "hero Constellation identity");
requireMatch(html, /Reasoning layer[\s\S]*Hive-AI[\s\S]*Historical boundary · HOLD[\s\S]*HivePoA[\s\S]*No public actions · runtime unknown/, "held HivePoA system boundary");
requireMatch(html, /Held proof boundary[\s\S]*Boundary[\s\S]*HivePoA · HOLD/, "held HivePoA hero readout");
requireMatch(html, /source-badge[^>]+title="JavaScript verifies[^>]*>[\s\S]*Snapshot verification pending/, "truthful no-JS source state");
requireMatch(html, /data-motion-toggle[^>]+aria-disabled="true"[^>]+disabled[^>]*>[\s\S]*Motion control pending/, "inert no-JS motion control");
requireMatch(html, /<noscript>[\s\S]*no package or live-source claim is authorized/, "explicit no-JS truth boundary");
const noScriptBlock = boundedBlock(html, "<noscript>", "</noscript>", "no-script truth boundary");
requireMatch(noScriptBlock, /Source freshness, manifest validation, and motion controls need JavaScript/, "no-script source and manifest boundary");
requireNoMatch(noScriptBlock, /signed-index|HivePoA verifier/i, "no-script quarantined HivePoA action claim");
requireMatch(html, /data-command-step="0"[\s\S]*Constellation Atlas[\s\S]*Observe source-authored topology/, "Mission begins from the public Atlas rather than unobserved Living Anatomy");
requireMatch(html, /id="galaxy"/, "public galaxy section");
requireMatch(html, /class="hero-outcomes"[\s\S]*Ask Hive[\s\S]*Ground answers in visible evidence[\s\S]*Build with Hive[\s\S]*Shape changes you can inspect[\s\S]*Improve Hive[\s\S]*Promote only after proof/, "immediate outcome-first hero story");
requireMatch(html, /class="button button-primary hero-enter" href="#pipeline"[\s\S]*Watch one request travel through Hive[\s\S]*Target path · proof gates · zero effects/, "dominant causal-trace hero entry");
requireMatch(html, /data-hero-atlas-cta[^>]+href="#galaxy"/, "semantic Atlas anchor hero entry");
requireNoMatch(html, /data-hero-atlas-cta[^>]+data-galaxy-open/, "hero anchor intercepted as a dialog opener");
requireMatch(html, /data-hero-atlas-cta[\s\S]*Explore the Constellation Atlas[\s\S]*640 source-authored capabilities/, "explicit source-atlas CTA");
const heroCopyStart = html.indexOf('<div class="hero-copy"');
const heroCopyEnd = html.indexOf('<div class="hero-system"', heroCopyStart);
if (heroCopyStart < 0 || heroCopyEnd <= heroCopyStart) throw new Error("bounded opening hero copy is missing");
const openingHeroCopy = html.slice(heroCopyStart, heroCopyEnd);
requireNoMatch(openingHeroCopy, /\b(?:H10|BYOM|tester\.\d+|SHA-256|workflow history)\b|472131baa|0ab04f6c/i, "plain-language opening before forensic detail");
requireMatch(html, /class="semantic-roadmap[\s\S]*TARGET EXPERIENCE[\s\S]*Ask Hive[\s\S]*Designed to turn[\s\S]*TARGET EXPERIENCE[\s\S]*Build with Hive[\s\S]*Designed to route[\s\S]*TARGET EXPERIENCE[\s\S]*Improve Hive[\s\S]*blind evaluation, causal ablation, independent verification, and rollback-safe promotion/i, "three target-experience outcomes");
requireMatch(html, /class="roadmap-rail"[\s\S]*SOURCE-PRESENT[\s\S]*source-authored Constellation Atlas[\s\S]*NEXT PROOF GATES[\s\S]*installed-process evidence[\s\S]*LONG-TERM TARGET[\s\S]*Hive-native generation[\s\S]*explicitly operator-invoked caller/i, "source-present proof-gates long-term roadmap");
const constellationIdentityIndex = html.indexOf("HiveBrain Constellation");
const publicGalaxyIndex = html.indexOf('id="galaxy"');
if (constellationIdentityIndex < 0 || publicGalaxyIndex < 0 || constellationIdentityIndex > publicGalaxyIndex) {
  throw new Error("HiveBrain Constellation identity must be explained before the public galaxy");
}
requireMatch(html, /id="architecture"[^>]+data-current-legacy-boundary/, "current-versus-legacy architecture section");
requireMatch(html, /PUBLISHED SOURCE SNAPSHOT @ 0ab04f6c · captured 2026-08-23 22:53:32 UTC[\s\S]*640[\s\S]*cataloged capabilities[\s\S]*636[\s\S]*unique row-backed Twitch records[\s\S]*448[\s\S]*trainable-classified identities/i, "published source snapshot metrics");
requireMatch(html, /data-metaphor-definitions[\s\S]*<h3>Neuron<\/h3>[\s\S]*448 trainable-classified[\s\S]*192 deterministic-classified[\s\S]*<h3>Halo<\/h3>[\s\S]*EVIDENCE BASELINE @ 472131baa:[\s\S]*zero populated Halo sections and zero indexes/i, "separately cut neuron and Halo evidence ceilings");
const publishedSnapshotSummary = boundedBlock(html, '<article class="constellation-core"', '<div class="doctrine-grid"', "published-snapshot summary");
requireNoMatch(publishedSnapshotSummary, /\b37\b/, "misleading baseline influence count in published-snapshot summary");
requireMatch(html, /data-architecture-live-boundary[\s\S]*Source architecture[\s\S]*Presentation body[\s\S]*No local runtime PASS is claimed[\s\S]*Dedicated Operator body[\s\S]*127\.0\.0\.1:5003[\s\S]*not been independently observed or deployed/i, "architecture-versus-local surfaces boundary");
requireMatch(html, /PUBLISHED SOURCE SNAPSHOT @ 0ab04f6c · HISTORICAL CAPTURE[\s\S]*freshness HOLD[\s\S]*SUBJECT-SCOPED DISPOSITIONS[\s\S]*Electron removal remains an unlanded IDE candidate[\s\S]*hive\/wt\/theyc\/ide-electron-final-20260822[\s\S]*41df9be[\s\S]*UNKNOWN_NOT_INSPECTED[\s\S]*GENERATION BOUNDARY · HOLD[\s\S]*blind evaluation, causal ablation, independent verification, and rollback-safe promotion[\s\S]*Full source-doctrine term[\s\S]*centralized AI-as-user traffic until H10/i, "subject-scoped IDE and generation boundary translation");
requireNoMatch(html, /current Hive IDE trunk uses Tauri|Electron is removed on the current Hive IDE trunk|tester\.5[^<]{0,120}bundles Electron/i, "unsupported current-trunk or package-content claim");
requireMatch(html, /id="product-truth"[^>]+data-product-truth[^>]+data-state="checking"/, "fail-closed Product Truth root");
requireMatch(html, /data-product-truth-status[^>]+role="status"[^>]+aria-live="polite"/, "Product Truth live validation status");
requireMatch(html, /id="product-truth"[\s\S]*target brain,[\s\S]*source atlas,[\s\S]*released tester metadata,[\s\S]*installed runtime,[\s\S]*observed behavior[\s\S]*data-product-truth-claims/i, "subject-scoped Product Truth fallback");
requireMatch(html, /data-platform-matrix/, "platform artifact matrix");
const heroCtaIndex = html.indexOf("data-hero-atlas-cta");
const heroOrganismIndex = html.indexOf("data-hero-organism-preview");
const heroSupportIndex = html.indexOf('class="hero-support"');
if (heroCtaIndex === -1 || heroOrganismIndex <= heroCtaIndex || heroSupportIndex !== -1) {
  throw new Error("first-frame hero must remain outcome copy, semantic CTA, then recognizable organism without forensic support clutter");
}
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
const divisionNavCount = [...html.matchAll(/\sdata-galaxy-division-nav(?=[\s>])/g)].length;
const divisionNavCurrentCount = [...html.matchAll(/\sdata-galaxy-division-nav-current(?=[\s>])/g)].length;
const divisionNavSelectCount = [...html.matchAll(/\sdata-galaxy-division-nav-select(?=[\s>])/g)].length;
if (divisionNavCount !== 1 || divisionNavCurrentCount !== 1 || divisionNavSelectCount !== 1) {
  throw new Error(`compact division navigator must be unique, found nav/current/select ${divisionNavCount}/${divisionNavCurrentCount}/${divisionNavSelectCount}`);
}
const divisionDialogIndex = html.indexOf("data-galaxy-dialog");
const divisionInspectorIndex = html.indexOf('class="lens-inspector galaxy-inspector"', divisionDialogIndex);
const divisionToolbarIndex = html.indexOf('class="galaxy-atlas-toolbar"', divisionInspectorIndex);
const divisionNavIndex = html.indexOf("data-galaxy-division-nav ", divisionToolbarIndex);
const atlasStatusIndex = html.indexOf("data-galaxy-atlas-status", divisionToolbarIndex);
const divisionToolbarEndIndex = html.indexOf('class="galaxy-director-motion-note"', divisionToolbarIndex);
if (!(divisionDialogIndex >= 0
  && divisionInspectorIndex > divisionDialogIndex
  && divisionToolbarIndex > divisionInspectorIndex
  && divisionNavIndex > divisionToolbarIndex
  && atlasStatusIndex > divisionNavIndex
  && divisionToolbarEndIndex > atlasStatusIndex)) {
  throw new Error("compact division navigator and local atlas status must remain ordered inside the dialog inspector");
}
const atlasStatusCount = [...html.matchAll(/\sdata-galaxy-atlas-status(?=[\s>])/g)].length;
if (atlasStatusCount !== 1) throw new Error(`dialog-local atlas status must be unique, found ${atlasStatusCount}`);
requireMatch(html, /<\/label>\s*<\/div>\s*<\/div>\s*<p class="galaxy-atlas-status"[^>]*data-galaxy-atlas-status[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"><\/p>/, "polite normal-flow atlas status immediately follows the toolbar");
requireMatch(html, /data-galaxy-division-nav-current[^>]*>A · Route, Hold, and Activation Budget<\//, "full initial compact division name");
requireMatch(html, /<select[^>]+data-galaxy-division-nav-select[^>]+disabled[^>]+aria-disabled="true"[^>]*><\/select>/, "fail-closed native division select");
requireMatch(html, /<select[^>]+data-galaxy-division-nav-select[^>]+aria-label="Jump to division"/, "explicit short-mode native division label");
requireMatch(html, /data-galaxy-context-summary>Context unavailable · source not yet bound<[\s\S]*data-galaxy-context-copy>Future context parameters remain unavailable until this browser validates/, "unbound future local-context truth");
const directorButtons = rootButtonTags.filter((tag) => /\sdata-galaxy-director(?:\s|>)/.test(tag));
if (directorButtons.length !== 1 || !directorButtons[0].includes('aria-pressed="false"')) {
  throw new Error(`exactly one startup Director control is required, found ${directorButtons.length}`);
}
requireMatch(html, /galaxy-inspector[\s\S]*galaxy-atlas-toolbar[\s\S]*data-galaxy-fit-selected[\s\S]*data-galaxy-director[\s\S]*data-galaxy-reset-modal/, "dominant focus action plus Director and recovery tools");
requireMatch(html, /id="galaxy-director-motion-note"[^>]+data-galaxy-director-motion-note[^>]+hidden/, "adjacent reduced-motion Director explanation");
requireMatch(html, /Gold marks a row-backed Twitch record\.[\s\S]*formal row-backed Twitch record[\s\S]*separately attested local Living Anatomy overlay[\s\S]*does not by itself claim current execution, served influence, or product-live behavior[\s\S]*public Atlas points stay neutral/i, "plain row-backed Twitch legend and public privacy boundary");
requireMatch(html, /data-galaxy-division-name[^>]*>Focus · A · 40 neurons · 4 families/, "accessible full selected division stage label");
requireNoMatch(html, /data-galaxy-division-name[^>]+aria-live|data-galaxy-director-caption[^>]+aria-live|data-galaxy-division-nav-current[^>]+aria-live/, "duplicate Atlas live regions");
requireMatch(html, /16 DIVISIONS[\s\S]*64 FAMILIES[\s\S]*640 NEURONS/, "projector-readable atlas hierarchy key");
requireMatch(html, /galaxy-mark-key[\s\S]*Body[\s\S]*Ring[\s\S]*division[\s\S]*Hub[\s\S]*family[\s\S]*Point[\s\S]*neuron[\s\S]*Route[\s\S]*authored membership/, "explicit atlas visual grammar without Halo collision");
requireNoMatch(html, /galaxy-mark-key[\s\S]{0,500}<b>Halo<\/b>\s*division/i, "visual division ring named as neuron Halo");
requireMatch(html, /galaxy-mobile-context[\s\S]*BODY[\s\S]*DIVISION[\s\S]*FAMILY[\s\S]*NEURON[\s\S]*data-fact="twitches"[\s\S]*PROVEN/, "mobile hierarchy and source-proof context");
requireMatch(html, /galaxy-state-rail[\s\S]*data-fact="neurons"[\s\S]*data-fact="twitches"[\s\S]*data-fact="pmOnly"[\s\S]*data-galaxy-snapshot-state/, "aggregate public command state rail");
requireMatch(html, /class="inspector-topline"[\s\S]*class="galaxy-family-list"[\s\S]*<details class="galaxy-gold-legend"[\s\S]*<summary>[\s\S]*Gold marks a row-backed Twitch record\.[\s\S]*<\/details>/, "selected context before collapsible public truth disclosure");
if (facts.boundaries?.runtimeTelemetry === false) {
  requireNoMatch(html, /data-fact="twitches"[^>]*>[\s\S]{0,120}(?:\bLIVE\b|live Twitches|active live work|mastered-and-alive)/i, "source Twitch proof rendered as current runtime liveness");
  requireMatch(html, /data-fact="twitches"[^>]*>[\s\S]{0,120}(?:TWITCH-PROVEN|Twitch proofs|PROVEN)/i, "source Twitch proof language");
}
const hivePoaPanel = boundedBlock(html, '<section class="tester', '<section class="access', "HivePoA quarantine panel");
requireMatch(hivePoaPanel, /actionless historical boundary[\s\S]*One quarantine panel\. No implied action\.[\s\S]*public actions quarantined · HOLD/i, "actionless HivePoA quarantine identity");
requireMatch(hivePoaPanel, /Immutable observation[\s\S]*Historical metadata preserved[\s\S]*Current deployment[\s\S]*UNKNOWN · NOT OBSERVED[\s\S]*Runtime \+ behavior[\s\S]*UNKNOWN[\s\S]*Public actions[\s\S]*HOLD/i, "HivePoA observation and effective-disposition planes");
requireMatch(hivePoaPanel, /executes no HivePoA verifier and publishes none of the retired delivery or authorization assets/i, "HivePoA staged-publication boundary");
const hivePoaLinks = [...hivePoaPanel.matchAll(/<a\b[^>]+href=/g)];
if (hivePoaLinks.length !== 1 || !/href="\/HivePoA\/"/.test(hivePoaPanel)) throw new Error("HivePoA quarantine must expose exactly one honest boundary link");
requireNoMatch(hivePoaPanel, /<button\b|href="[^"]*(?:download|release|verify|tester|enroll)/i, "HivePoA quarantine action affordance");
requireMatch(html, /id="ide-download"[^>]+data-ide-release data-state="checking"/, "inert Hive IDE release section");
const ideDownloadBlock = boundedBlock(html, '<section class="ide-release', '<section class="anatomy', "Hive IDE evidence section");
// The tester surface is historical evidence only: both time-bounded public readbacks
// are expired and every download/install/test action remains HELD.
requireMatch(ideDownloadBlock, /Hive IDE integration \/ WAIT[\s\S]*The IDE is still being finished\. Integration remains WAIT\./, "IDE future integration headline");
requireMatch(ideDownloadBlock, /not presented as available, installed, tested, or live[\s\S]*historical independent observation[\s\S]*outer bytes[\s\S]*evidence window has expired[\s\S]*NotSigned[\s\S]*package contents, installation, and runtime remain[\s\S]*UNKNOWN/i, "expired outer-byte observation scoped to historical bytes only");
requireMatch(ideDownloadBlock, /authorizes no download\./, "evidence-only download boundary");
requireMatch(ideDownloadBlock, /DIFFERENT GENERATION[\s\S]*Tester\.5 must not be presented as realizing the mapped HiveBrain Constellation[\s\S]*0ab04f6c[\s\S]*a0fe6483/, "tester/atlas generation mismatch disclosed at the download surface");
requireMatch(ideDownloadBlock, /tester\.6 absence\/readback evidence is also expired[\s\S]*publication remains a separate HOLD pending fresh evidence and authority/i, "expired tester.6 readback remains visible and held");
requireMatch(ideDownloadBlock, /EVIDENCE LADDER[\s\S]*Remote outer bytes[\s\S]*HISTORICAL \/ EXPIRED[\s\S]*Publisher authentication[\s\S]*NOT SIGNED[\s\S]*Package contents[\s\S]*UNKNOWN[\s\S]*Installation \+ runtime[\s\S]*UNKNOWN[\s\S]*Public functional testing[\s\S]*HOLD/, "five-plane expired evidence ladder");
requireMatch(html, /A separate, unexpired operator authorization is required before this truth contract can expose an active download\./, "download requires separate operator authority");
// "Run anyway" may appear exactly once, and only inside the sentence that refuses it.
// Any second occurrence means the retired install-and-run onboarding has come back.
requireMatch(html, /No\s*[\u201c"]Run anyway[\u201d"]\s*guidance, install promise, or runtime claim is authorized by this evidence-only candidate\./, "explicit refusal of run-anyway guidance");
{
  const runAnywayHits = (html.match(/Run anyway/gi) || []).length;
  if (runAnywayHits !== 1) {
    throw new Error(`retired run-anyway guidance must not return while the download is held: found ${runAnywayHits} occurrences, expected exactly the refusal sentence`);
  }
}
requireNoMatch(html, /One download\. Five calm steps\./, "retired one-download onboarding must not return while the download is held");
// The ecosystem diagram must not imply that a normal local prompt reaches chain,
// IPFS, or pooled compute.
requireMatch(html, /Ecosystem map[\s\S]{0,20}not a default prompt route/, "ecosystem map is not a prompt route");
requireMatch(html, /does not claim that chain, IPFS, or pooled compute receives a normal local prompt; every handoff needs its own authorized route\./, "IDE versus HivePoA handoff boundary");
requireMatch(html, /public page never probes, starts, or aliases either service/i, "public page never probes the visitor machine");
const localChatLinks = [...html.matchAll(/<a\b[^>]*\bhref=["'][^"']*\/chat(?:[/?#][^"']*)?["'][^>]*>/gi)];
if (localChatLinks.length) {
  throw new Error(`presentation-safe hub must not expose a clickable local chat route, found ${localChatLinks.length}`);
}
requireNoMatch(js, /localChatUrl|127\.0\.0\.1:5002\/chat/, "browser-created local chat presentation route");
requireNoMatch(html, /href="http:\/\/127\.0\.0\.1:5002\/constellation\/body\?presentation=1/, "unattested local presentation navigation");
requireMatch(html, /Local Body · HOLD[\s\S]{0,180}Intended :5002 handoff not attested/, "held future Local Body handoff");
requireNoMatch(html, /presentation=0/, "operator alias to the presentation service");
requireNoMatch(html, /href="http:\/\/127\.0\.0\.1:5003/, "unobserved Operator service navigation");
requireMatch(html, /Operator body · HOLD[\s\S]{0,180}Distinct :5003 service not observed/, "disabled distinct Operator handoff");
requireNoMatch(html, /127\.0\.0\.1:8791/, "retired split-port Living Anatomy route");
requireNoMatch(html, /data-local-handoff-dialog|data-local-handoff-confirm/, "obsolete active local-handoff dialog");
requireNoMatch(html, /href="http:\/\/127\.0\.0\.1:[^"]*"[^>]*target="_blank"/, "local links never scatter into unnamed tabs");
requireMatch(html, /data-body-surface="atlas"[\s\S]*data-body-surface="presentation"[\s\S]*data-body-surface="operator"[^>]+aria-disabled="true"/, "public Atlas plus presentation and held Operator bridge");
requireMatch(html, /No local handoff is enabled in this public candidate[\s\S]*Local Body awaits exact :5002 runtime evidence[\s\S]*Operator remains a separate intended :5003 service[\s\S]*Chat remains WAIT/i, "truthful local availability boundary");
requireMatch(html, /class="pipeline-rail"[\s\S]*Intent[\s\S]*Route[\s\S]*Halo[\s\S]*Trust[\s\S]*Compose[\s\S]*Gate[\s\S]*Witness[\s\S]*Record outcome or HOLD/, "constellation causal flight path");
requireNoMatch(html, /class="pipeline-rail"[\s\S]{0,2000}<strong>Generate<\/strong>/, "retired conventional Generate endpoint");
const commandStepIds = [...html.matchAll(/data-command-step="(\d+)"/g)].map((match) => Number(match[1]));
if (JSON.stringify(commandStepIds) !== JSON.stringify([0, 1, 2, 3, 4, 5])) {
  throw new Error(`living command cycle stage order drifted: ${commandStepIds.join(",")}`);
}
requireMatch(html, /See[\s\S]*Understand[\s\S]*Select[\s\S]*Dispatch[\s\S]*Verify[\s\S]*Watch/, "living command cycle narrative");
requireMatch(html, /data-command-cycle data-command-state="idle"/, "inert command cycle startup");
requireMatch(html, /The walkthrough narrates the lifecycle; it performs zero effects\./, "zero-effect public command boundary");
requireMatch(html, /data-command-walkthrough aria-pressed="false"/, "explicit walkthrough state");
requireMatch(html, /Operator body · HOLD[\s\S]*Distinct :5003 service not observed/, "held operator command handoff");
requireMatch(html, /canvas data-command-echo/, "command organism echo");
requireMatch(html, /data-command-climax[\s\S]*DEMONSTRATION · ZERO EFFECTS[\s\S]*body absorbs source[\s\S]*changes only after authority, validated landing, and snapshot absorption/, "truth-bound WATCH climax");
requireMatch(html, /data-command-prev[\s\S]*data-command-next[\s\S]*data-command-reset/, "presenter recovery navigation");
requireMatch(html, /data-command-flightdeck aria-pressed="false"[\s\S]*F · projector mode/, "projector flightdeck control");
if (html.indexOf("galaxy-commandbar") > html.indexOf("body-bridge-dock")) {
  throw new Error("galaxy spectacle must precede the expanded local-surface dock");
}
requireNoMatch(html, /href=["']#anatomy["']/, "obsolete anatomy anchor");
requireNoMatch(html, /data-release-download|data-release-manifest|data-release-index|data-release-page/, "retired HivePoA action controls");
for (const [attribute, expectedCount] of [["data-ide-download", 1], ["data-ide-start-here", 2], ["data-ide-manifest", 1], ["data-ide-release-page", 1]]) {
  const inertLinks = [...html.matchAll(new RegExp(`<a\\b[^>]*${attribute}[^>]*>`, "g"))].map((match) => match[0]);
  if (inertLinks.length !== expectedCount || inertLinks.some((link) => (
    /\shref=/.test(link) || !/tabindex="-1"/.test(link) || !/aria-disabled="true"/.test(link)
  ))) {
    throw new Error(`unverified Hive IDE link must be inert: ${attribute}`);
  }
}
requireNoMatch(html, /galaxy-inspector["'][^>]*aria-live/, "hover-driven live-region noise");
requireMatch(js, /PRODUCT_TRUTH_SCHEMA = "hive\.ecosystem\.product-truth\.public-projection\.v2"/, "browser Product Truth schema gate");
requireMatch(js, /PRODUCT_TRUTH_SUBJECTS[\s\S]*target_architecture:[\s\S]*SOURCE_BOUND_DOCTRINE[\s\S]*source_atlas:[\s\S]*SOURCE_PRESENT_AT_PIN[\s\S]*tip_influence:[\s\S]*SOURCE_GOVERNED_HOLD[\s\S]*fleet_halos:[\s\S]*DECLARED_HARD_OFF[\s\S]*released_tester_5:[\s\S]*PUBLIC_REMOTE_BYTES_VERIFIED_OLDER_SOURCE_SUBJECT[\s\S]*candidate_tester_6_publication:[\s\S]*HELD_NOT_PUBLIC[\s\S]*windows_wsl_candidate_design:[\s\S]*DECLARED_AT_PIN_BY_NON_DURABLE_EXTERNAL_OBSERVATION[\s\S]*linux_hive_ide_publication:[\s\S]*UNKNOWN_NO_ADMISSIBLE_PUBLICATION_OBSERVATION[\s\S]*macos_hive_ide_publication:[\s\S]*HELD_MISSING_ADMISSIBLE_PUBLICATION_OBSERVATION[\s\S]*installed_runtime:[\s\S]*UNKNOWN[\s\S]*observed_behavior:[\s\S]*UNKNOWN/, "browser subject-scoped truth status gate");
requireMatch(js, /WHAT_ARCHITECTURE_AM_I\?[\s\S]*SOVEREIGN_HIVEBRAIN_CONSTELLATION[\s\S]*hiveai\.sovereign_hivebrain_constellation\.v1[\s\S]*971437dd8d1474262627881e6c2d4baef9b0d705424d7eb4abd09a5d2baf5b61/, "browser canonical architecture identity gate");
// Order-free: the browser must independently gate every piece of subject evidence
// metadata, including the newer doesNotProve and recertification contracts.
for (const field of ["evidence", "claim", "invalidators", "doesNotProve", "evidenceRef", "verifiedAt", "validUntil", "freshness", "recertification"]) {
  requireMatch(js, new RegExp(`subject\\.${field}\\b`), `browser subject evidence metadata gate (${field})`);
}
// The browser must hold tester.5 at exactly one upgraded plane: outer bytes verified,
// everything downstream of the bytes still unproven.
requireMatch(js, /artifactBytesIndependentlyVerified === true[\s\S]{0,120}artifactSha256IndependentlyVerified === true/, "browser tester.5 byte-verification plane gate");
requireMatch(js, /artifactExecuted === false[\s\S]{0,120}packageContentsStatus === "UNKNOWN_NOT_INSPECTED"/, "browser tester.5 contents-and-execution ceiling");
requireMatch(js, /representsCurrentSourceAtlas === false/, "browser tester/atlas generation separation");
requireMatch(js, /released_tester_5:[\s\S]{0,200}PUBLIC_RELEASE_REMOTE_ARTIFACT_BYTES[\s\S]{0,120}PUBLIC_REMOTE_BYTES_VERIFIED/, "browser tester.5 subject kind and plane");
requireMatch(js, /windows\.subjectId === "released_tester_5"[\s\S]{0,400}PUBLIC_RELEASE_AVAILABLE_UNSIGNED[\s\S]{0,200}REMOTE_BYTES_VERIFIED_NOT_EXECUTED[\s\S]{0,200}AUTHENTICODE_NOT_SIGNED/, "browser Windows remote-byte platform ceiling");
// Both tester subjects carry their own independently pinned observation window.
requireMatch(js, /tester5\.verifiedAt === "2026-08-23T19:20:09\.7630961Z"[\s\S]{0,80}tester5\.validUntil === "2026-08-24T19:20:09\.7630961Z"/, "browser tester.5 evidence expiry contract");
requireMatch(js, /tester6\.verifiedAt === "2026-08-23T19:37:31\.6497275Z"[\s\S]{0,80}tester6\.validUntil === "2026-08-24T19:37:31\.6497275Z"/, "browser tester.6 evidence expiry contract");
requireMatch(js, /Date\.parse\(subject\.validUntil\) > Date\.parse\(subject\.verifiedAt\)/, "browser advancing validity window contract");
// When an observation window lapses the surface must degrade to HELD, not keep
// rendering the last green state.
requireMatch(js, /evidenceExpired \? "EVIDENCE FRESHNESS EXPIRED · HELD"/, "expired subject Product Truth rendering");
requireMatch(js, /EVIDENCE EXPIRED · HELD/, "expired platform row rendering");
requireMatch(js, /Remote-byte evidence expired · every action held/, "expired tester action hold");
requireMatch(js, /No action is authorized; refresh the evidence contract before relying on availability or byte identity\./, "expired tester refresh instruction");
requireMatch(js, /evidenceExpired[\s\S]*EVIDENCE EXPIRED · HELD[\s\S]*Current publication claims are HELD pending a fresh readback/, "expired platform evidence rendering");
requireMatch(js, /function renderIdeRelease\(latest, truthResult\)[\s\S]*truthResult\.evidenceCurrent[\s\S]*Date\.now\(\) < Date\.parse\(truthResult\.validUntilUtc\)[\s\S]*Remote-byte evidence expired · every action held[\s\S]*window\.setTimeout[\s\S]*evidenceCurrent: false/, "wall-clock tester evidence expiry HOLD");
requireMatch(js, /bindingDigest[\s\S]*recursive-key-sort-json-utf8[\s\S]*delete projection\.bindingDigest[\s\S]*sha256Text\(canonicalJson\(projection\)\)[\s\S]*projection digest mismatch/, "browser full-projection digest gate");
requireMatch(js, /PRODUCT_TRUTH_MAX_BYTES = 128 \* 1024[\s\S]*readBoundJson = async[\s\S]*response\.arrayBuffer\(\)[\s\S]*expectedBytes[\s\S]*expectedSha256[\s\S]*parseJsonBytesStrict\(bytes, label\)[\s\S]*\/hub-assets\/product-truth\.json[\s\S]*\/hub-assets\/product-truth-ledger\.v1\.json[\s\S]*blockProductTruth/, "strict fail-closed Product Truth and ledger fetch");
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
if (rootCssVersion !== "galaxy-stark-v18" || rootCssVersion !== rootJsVersion
  || !notFound.includes(`/hub-assets/hub.css?v=${rootCssVersion}`)
  || !notFound.includes(`/hub-assets/hub.js?v=${rootJsVersion}`)
  || !js.includes(`./galaxy-core.mjs?v=${rootJsVersion}`)
  || !js.includes(`./ide-release-core.mjs?v=${rootJsVersion}`)) {
  throw new Error("root and 404 asset versions must remain identical");
}

// The verifier loader was deleted by the quarantine; the quarantine renderer replaces it.
requireNoMatch(js, /function loadAuthorizedRelease\(/, "retired HivePoA verifier loader must stay deleted");
const quarantinedHivePoaBlock = boundedBlock(js, "function renderHivePoaQuarantine()", "function holdIdeReleaseActions()", "HivePoA quarantine rendering");
requireMatch(quarantinedHivePoaBlock, /consoleNode\.dataset\.state = "held"/, "HivePoA quarantine remains HELD");
requireMatch(quarantinedHivePoaBlock, /Historical HivePoA metadata quarantined · delivery\/network held/, "scoped HivePoA quarantine status");
requireMatch(quarantinedHivePoaBlock, /executes no HivePoA verifier and fetches no HivePoA release surface/, "HivePoA verifier and fetch quarantine");
requireMatch(quarantinedHivePoaBlock, /Coordinator \+ enrollment held[\s\S]*No execution or award is authorized/, "HivePoA coordinator, enrollment, and execution HOLD");
requireMatch(quarantinedHivePoaBlock, /download\.classList\.add\("is-disabled"\)[\s\S]*download\.setAttribute\("aria-disabled", "true"\)[\s\S]*download\.setAttribute\("tabindex", "-1"\)[\s\S]*download\.removeAttribute\("href"\)/, "hydrated HivePoA download deauthorization");
requireNoMatch(quarantinedHivePoaBlock, /\b(?:fetch|import)\s*\(|renderRelease\s*\(|download\.(?:href\s*=|setAttribute\(["']href["']|classList\.remove\(["']is-disabled["']|removeAttribute\(["'](?:aria-disabled|tabindex)["'])/, "hydrated HivePoA quarantine escape");
requireMatch(js, /button\.disabled = systemReduced;[\s\S]*button\.setAttribute\("aria-disabled", String\(systemReduced\)\)/, "motion control runtime enablement");
requireNoMatch(js, /PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256|tester-network-authorization|fetch\(["']\/HivePoA\//, "active HivePoA verifier or surface fetch");
requireMatch(js, /data-release-evidence-index/, "separate evidence states");
requireMatch(js, /class GalaxyAtlas/, "galaxy renderer");
requireMatch(js, /wireFullAtlas\(\)[\s\S]*setAttribute\("role", "dialog"\)[\s\S]*setAttribute\("aria-modal", "true"\)/, "full-viewport atlas dialog and focus contract");
requireMatch(js, /startDirector\(\)[\s\S]*setTimeout\(\(\) => this\.cancelDirector\(true\), 4000\)[\s\S]*cancelDirector\(completed = false\)/, "interruptible 24-second director");
requireMatch(js, /syncContextHandoff\(\)[\s\S]*Context unavailable · source not yet bound[\s\S]*buildPublicHandoffUrl\([\s\S]*presentation,[\s\S]*sourceCommit:[\s\S]*graphHash:[\s\S]*lens:[\s\S]*node,[\s\S]*level,/, "validated no-probe public-to-local context handoff");
requireMatch(galaxyCore, /artifact: "build"[\s\S]*division: "district"[\s\S]*rawNode\.slice\("neuron:"\.length\)/, "canonical local context taxonomy");
requireMatch(galaxyCore, /searchParams\.set\("presentation"[\s\S]*publicContextVersion[\s\S]*sourceCommit[\s\S]*graphHash[\s\S]*lens[\s\S]*node[\s\S]*level/, "closed handoff URL query");
requireMatch(js, /focusInsideFullAtlas\(\)[\s\S]*data-galaxy-director[\s\S]*this\.canvas[\s\S]*data-galaxy-exit/, "modal-internal focus recovery");
requireNoMatch(js, /data-galaxy-director-modal/, "duplicate Director control");
requireMatch(js, /setModalIsolation\(root, active\)[\s\S]*node\.inert = inert;[\s\S]*ariaHidden === null[\s\S]*sibling\.inert = true;[\s\S]*sibling\.setAttribute\("aria-hidden", "true"\)/, "exact modal background isolation restoration");
requireMatch(js, /openFullAtlas\(trigger = null\)[\s\S]*this\.setModalIsolation\(root, true\)[\s\S]*closeFullAtlas\(restoreFocus = true\)[\s\S]*this\.setModalIsolation\(root, false\)/, "full-atlas modal isolation lifecycle");
requireMatch(js, /openFullAtlas\(trigger = null\)[\s\S]*this\.focusInsideFullAtlas\(\);[\s\S]*this\.setModalIsolation\(root, true\)/, "focus enters the atlas before background isolation");
requireMatch(js, /!root\?\.contains\(document\.activeElement\)[\s\S]*event\.shiftKey \? last : first/, "full-atlas focus containment from outside focus");
requireMatch(js, /button:not\(:disabled\), select:not\(:disabled\), a\[href\]/, "native division select participates in the full-atlas focus trap");
requireMatch(js, /event\.key !== "Escape" \|\| !this\.engaged[\s\S]*this\.cancelDirector\(false\);[\s\S]*this\.setEngaged\(false, true\);[\s\S]*this\.focusInsideFullAtlas\(\)/, "first Escape preserves modal focus and restores Director state");
requireMatch(js, /closeFullAtlas\(restoreFocus = true\)[\s\S]*this\.cancelDirector\(false\)/, "full-atlas close restores Director state");
requireMatch(js, /this\.paused = Boolean\(event\.detail\?\.paused\)[\s\S]*if \(this\.paused\) this\.cancelDirector\(false\)/, "motion pause restores Director state");
requireMatch(js, /exactGalaxyDirectorState\(\{[\s\S]*targetPanY:[\s\S]*if \(returnContext\)[\s\S]*this\.rotationX = returnContext\.rotationX[\s\S]*this\.targetPanY = returnContext\.targetPanY/, "exact Director state restoration");
requireMatch(js, /function wireLenses\(\)[\s\S]*button\.disabled = false;/, "lens controls enabled only after module boot");
requireMatch(js, /setCameraControlsAvailable\(available[\s\S]*button\.disabled = !available;[\s\S]*aria-disabled[\s\S]*tabindex[\s\S]*aria-disabled/, "camera controls runtime availability gate");
requireMatch(js, /syncDirectorMotionPolicy\(renderAvailable[\s\S]*button\.disabled = !renderAvailable;[\s\S]*button\.dataset\.motionBlocked[\s\S]*button\.textContent = "Guided tour";[\s\S]*button\.setAttribute\("aria-label", `Guided tour\. \$\{blockedReason\}`\)/, "presentation-clean Director label with complete accessible motion reason");
requireMatch(js, /root\.dataset\.commandState = "discrete";[\s\S]*select\(COMMAND_CYCLE_STEPS\.length - 1, false\)[\s\S]*Replay verified-change reveal/, "reduced-motion discrete WATCH reveal");
requireMatch(js, /focusPoint\(center, minimumZoom, exactFit = false\)[\s\S]*galaxyFocusCamera\(center,[\s\S]*exactFit \? minimumZoom[\s\S]*targetYRatio:[\s\S]*this\.targetPanY = camera\.panY/, "safe-inset selected camera focus");
requireMatch(js, /fitSelected\(\)[\s\S]*focusNeuron\(this\.activeNeuron, false, true\)[\s\S]*focusFamily\(this\.activeFamily, false, true\)[\s\S]*focusDivision\(Math\.max\(this\.activeDivision, 0\), false, true\)/, "fit-selected exact zoom recovery");
requireMatch(js, /buildDivisionIndex\(\)[\s\S]*addEventListener\("focus"[\s\S]*showDivision\(index, false, false\)[\s\S]*addEventListener\("blur"/, "division full-name keyboard discovery");
requireMatch(js, /showDivision\(index[\s\S]*data-galaxy-division-name[\s\S]*titleCase\(division\.name\)/, "persistent selected division full name");
requireMatch(galaxyCore, /export function galaxyOverviewCamera\([\s\S]*rotationX: -0\.25,[\s\S]*rotationY: -0\.64,[\s\S]*narrow \? 0\.98[\s\S]*compact \? 1\.2[\s\S]*short \? 1\.14 : 1\.3[\s\S]*panY: clamp/, "pure viewport-aware overview camera");
requireMatch(js, /resetCamera\(manual = true\)[\s\S]*galaxyOverviewCamera\(\{ width: this\.width, height: this\.height \}\)[\s\S]*this\.targetPanY = overview\.panY/, "overview camera reset integration");
requireMatch(js, /const formatGalaxyDivisionChoice = \(division\) => `\$\{division\.code\} · \$\{titleCase\(division\.name\)\}`;/, "exact division navigator formatter");
requireMatch(js, /const formatGalaxyDivisionSelectChoice = \(division\) => `Division \$\{division\.code\}`;/, "compact unclipped division select formatter");
requireMatch(js, /wireDivisionNavigator\(\)[\s\S]*data-galaxy-division-nav-select[\s\S]*addEventListener\("change"[\s\S]*findIndex\([\s\S]*this\.focusDivision\(index\)/, "native division navigator selection path");
requireMatch(js, /buildDivisionNavigator\(\)[\s\S]*this\.divisions\.length === 16[\s\S]*String\.fromCharCode\(65 \+ index\)[\s\S]*option\.textContent = formatGalaxyDivisionSelectChoice\(division\)[\s\S]*option\.title = formatGalaxyDivisionChoice\(division\)[\s\S]*select\.replaceChildren\(\.\.\.options\)[\s\S]*aria-disabled/, "facts-gated sixteen-option division navigator");
requireMatch(js, /syncDivisionNavigator\(index\)[\s\S]*data-galaxy-division-nav-current[\s\S]*Jump to division\. Current:[\s\S]*select\.value = division\.code[\s\S]*option\.selected = option\.value === division\.code/, "division navigator current and selected-option sync");
requireMatch(js, /showDivision\(index, updateButtons = true[\s\S]*if \(updateButtons\)[\s\S]*this\.syncDivisionNavigator\(index\)/, "canvas index and Director division sync path");
requireMatch(css, /\.galaxy-division-nav-current strong\s*\{[^}]*overflow: visible;[^}]*font: 800 1rem\/1\.4[^}]*overflow-wrap: break-word;[^}]*text-overflow: clip;[^}]*white-space: normal;/, "unclipped wrapping current division label");
requireMatch(css, /\.galaxy-division-name\s*\{[^}]*overflow: visible;[^}]*font: 800 0\.95rem\/1\.35[^}]*text-transform: uppercase;[^}]*overflow-wrap: break-word;[^}]*text-overflow: clip;[^}]*white-space: normal;/, "unclipped compact selected stage focus summary");
requireMatch(css, /\.galaxy-division-nav-field select\s*\{[^}]*min-height: 2\.75rem;[^}]*font: 750 0\.875rem\/1\.35/, "44px native division target and 14px type floor");
requireMatch(css, /\.galaxy-division-nav-current > span,[\s\S]*\.galaxy-division-nav-field > span\s*\{[^}]*margin-bottom: 0\.35rem;[^}]*font: 800 0\.875rem\/1\.3/, "division navigator eyebrow height budget");
requireMatch(css, /\.galaxy-atlas-toolbar\s*\{[^}]*position: sticky;[^}]*top: 0;[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*\.galaxy-atlas-toolbar \.galaxy-division-nav\s*\{[^}]*grid-column: 1 \/ -1;[^}]*grid-template-columns: minmax\(0, 1fr\)/, "contained sticky command hierarchy and single-column division navigator");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*\.galaxy-atlas-toolbar \.galaxy-division-nav\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/, "mobile toolbar division navigator specificity");
requireMatch(css, /@media \(max-width: 24rem\), \(max-height: 36rem\)[\s\S]*\.galaxy-atlas-toolbar\s*\{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)[\s\S]*data-galaxy-director[\s\S]*grid-column: auto/, "short mobile toolbar compaction");
requireMatch(css, /@media \(max-width: 24rem\), \(max-height: 36rem\)[\s\S]*\.galaxy-atlas-toolbar \.galaxy-division-nav-current > span,[\s\S]*\.galaxy-atlas-toolbar \.galaxy-division-nav-field > span\s*\{\s*display: none;/, "short-height redundant eyebrow removal");
const shortDivisionNavReclaimPx = Math.round(16 * ((0.875 * 1.3) + 0.35) * 10) / 10;
if (shortDivisionNavReclaimPx < 20) throw new Error(`short division navigator reclaims only ${shortDivisionNavReclaimPx}px`);
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.galaxy-division-nav-field select[\s\S]*background: Canvas;/, "forced-colors native division navigator");
requireMatch(css, /main > section,[\s\S]*\.site-footer\s*\{[\s\S]*content-visibility: visible;[\s\S]*contain-intrinsic-size: none;/, "stable eager anchor-section geometry");
requireNoMatch(css, /main > section,[\s\S]{0,180}content-visibility:\s*auto/, "geometry-unstable anchored section containment");
requireMatch(js, /const primeAtlas = \(\) =>[\s\S]*is-render-primed[\s\S]*pointerenter[\s\S]*pointerdown[\s\S]*focus/, "intent-driven atlas prewarm");
requireMatch(js, /runAfterFirstPaint\("Constellation Atlas", startGalaxy, 20\)/, "deferred galaxy call chain");
requireMatch(js, /const COMMAND_CYCLE_STEPS = Object\.freeze\(\[[\s\S]*SEE · SOURCE BOUND[\s\S]*WATCH · ABSORBED/, "command cycle semantic model");
requireMatch(js, /function wireCommandCycle\(\)[\s\S]*data-command-cycle[\s\S]*setInterval[\s\S]*1500/, "command cycle controller");
requireMatch(js, /reduceMotion\.matches \|\| document\.body\.classList\.contains\("motion-paused"\)/, "manual reduced-motion command cycle");
requireMatch(js, /detail: \{ snapshot, previous \}/, "previous source snapshot propagation");
requireMatch(js, /const applyCommandSnapshot = \(snapshot, previous = null\)[\s\S]*hive:snapshot[\s\S]*window\.hivePublicSnapshot[\s\S]*applyCommandSnapshot\(window\.hivePublicSnapshot\)/, "late command-cycle snapshot initialization");
requireMatch(js, /previous\.hiveAi\?\.sourceCommit === sourceCommit[\s\S]*New source truth absorbed\.[\s\S]*no runtime state was inferred/, "truth-bound source absorption");
requireMatch(js, /const paintEcho = \(\) =>[\s\S]*drawImage\(sourceCanvas/, "source-bound organism echo renderer");
requireMatch(js, /const setFlightdeck = \(active, announce = true\)[\s\S]*command-flightdeck-open[\s\S]*Projector flightdeck open/, "projector flightdeck controller");
requireMatch(js, /setAttribute\("role", "dialog"\)[\s\S]*setAttribute\("aria-modal", "true"\)[\s\S]*Living command cycle flightdeck/, "flightdeck modal semantics");
requireMatch(js, /event\.key === "Tab"[\s\S]*button:not\(:disabled\)[\s\S]*document\.activeElement === first[\s\S]*document\.activeElement === last/, "flightdeck focus containment");
requireMatch(js, /!editable && root\.classList\.contains\("is-flightdeck"\) && \["ArrowLeft", "ArrowRight"\]\.includes\(event\.key\)[\s\S]*select\(current \+ \(event\.key === "ArrowRight" \? 1 : -1\)\)[\s\S]*if \(interactive\) return;/, "flightdeck arrow keys precede interactive-control guard");
requireMatch(js, /data-command-prev[\s\S]*data-command-next[\s\S]*data-command-reset/, "presenter recovery controls");
requireMatch(js, /new CustomEvent\("hive:command-stage"[\s\S]*detail: \{ index: current, step \}/, "command-stage choreography event");
requireMatch(js, /runAfterFirstPaint\("Living command cycle", wireCommandCycle, 120\)/, "deferred command cycle call chain");
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
requireMatch(pointerDownBlock, /this\.takeManualControl\(\);/, "pointer interrupts Director");
requireMatch(pointerDownBlock, /const pointerPolicy = galaxyPointerPolicy\(event\.pointerType, this\.engaged\);[\s\S]*pointerPolicy\.engage[\s\S]*this\.pointer\.orbitAllowed = pointerPolicy\.orbitAllowed;/, "behavioral pointer policy integration");
requireMatch(pointerMoveBlock, /tracked && !this\.engaged[\s\S]*this\.dragMoved \|\|= Math\.hypot\(dx, dy\) > 6;[\s\S]*galaxyGestureCamera\(/, "unengaged touch scroll and engaged pinch ownership");
requireMatch(js, /pointercancel[^\n]+release\(event, true\)/, "non-activating pointer cancellation");
requireMatch(js, /focusedFamilyIndex[\s\S]*data-family-geometry-index[\s\S]*focus\(\{ preventScroll: true \}\)/, "family focus continuity");
requireMatch(js, /focusedNeuronId[\s\S]*data-neuron-id[\s\S]*focus\(\{ preventScroll: true \}\)/, "neuron focus continuity");
requireMatch(js, /resolveGalaxySelection\([\s\S]*previousNeuronId/, "semantic snapshot selection continuity integration");
requireMatch(js, /galaxy-fallback-active/, "semantic no-canvas fallback activation");
requireMatch(js, /1 - Math\.exp\(-elapsed \/ 145\)/, "time-based camera damping");
requireMatch(js, /if \(!this\.engaged\) return;\s*event\.preventDefault\(\);[\s\S]*this\.zoomAt\(factor, this\.pointer\.x, this\.pointer\.y\)/, "explicit wheel ownership and pointer-centered zoom");
requireMatch(wheelWiring, /this\.takeManualControl\(\);/, "wheel interrupts Director");
requireMatch(wheelWiring, /this\.directorRunning[\s\S]*this\.takeManualControl\(\);[\s\S]*if \(!this\.engaged\) return;/, "unengaged wheel still interrupts Director without stealing scroll");
requireMatch(js, /event\.shiftKey[\s\S]*this\.targetPanX[\s\S]*PageUp[\s\S]*PageDown/, "keyboard pan and semantic selection path");
requireMatch(js, /const handled = \["ArrowLeft"[\s\S]*if \(!this\.engaged\)[\s\S]*if \(!handled\.includes\(event\.key\)\) return;[\s\S]*this\.takeManualControl\(\);[\s\S]*this\.setEngaged\(true, true\);/, "unengaged keyboard camera input interrupts Director and takes explicit control");
requireMatch(js, /adaptiveGalaxyDpr\([\s\S]*depthSortGalaxyPoints\(this\.projectedNeurons\)/, "adaptive high-DPI and stable depth rendering");
requireMatch(js, /event\.key !== "Escape" \|\| !this\.engaged[\s\S]*this\.setEngaged\(false, true\);[\s\S]*data-galaxy-engage[\s\S]*focus\(\{ preventScroll: true \}\)/, "keyboard scroll release and focus return");
requireMatch(js, /this\.intersecting = true;[\s\S]*this\.documentVisible = !document\.hidden;/, "visibility state separation");
requireMatch(js, /if \(!this\.context\) return;/, "canvas fail-soft guard");
requireMatch(js, /download\.removeAttribute\("href"\)/, "blocked download deauthorization");
const holdIdeActionsBlock = boundedBlock(js, "function holdIdeReleaseActions()", "function blockIdeRelease", "Hive IDE action HOLD");
requireMatch(holdIdeActionsBlock, /data-ide-download[\s\S]*data-ide-start-here[\s\S]*data-ide-manifest[\s\S]*data-ide-release-page[\s\S]*classList\.add\("is-disabled"\)[\s\S]*aria-disabled[\s\S]*tabindex[\s\S]*removeAttribute\("href"\)/, "all Hive IDE actions remain inert");
const renderIdeReleaseBlock = boundedBlock(js, "function renderIdeRelease(latest, truthResult)", "async function loadIdeRelease()", "Hive IDE held rendering");
requireMatch(renderIdeReleaseBlock, /root\.dataset\.state = "held"[\s\S]*Remote outer EXE bytes verified · unsigned · every action held[\s\S]*package contents, installation, and runtime remain UNKNOWN[\s\S]*public functional testing is HOLD/, "Hive IDE outer-byte-only rendering");
requireMatch(renderIdeReleaseBlock, /LANDED_HASH_VERIFIED[\s\S]*PRIVATE_SOURCE_NOT_PUBLICLY_RETRIEVABLE[\s\S]*Authenticode NotSigned[\s\S]*not package contents, safety, installability, runtime, or testing authority/i, "Hive IDE landing, retrievability, and unsigned evidence ceiling");
requireMatch(renderIdeReleaseBlock, /Download held · unsigned \+ runtime unknown[\s\S]*START HERE held[\s\S]*Truth contract validated · action held[\s\S]*Release action held[\s\S]*holdIdeReleaseActions\(\)/, "Hive IDE hydrated action HOLD");
requireNoMatch(renderIdeReleaseBlock, /\.href\s*=|classList\.remove\(["']is-disabled["']|removeAttribute\(["'](?:aria-disabled|tabindex)["']\)/, "Hive IDE hydrated action promotion");
const loadIdeReleaseBlock = boundedBlock(js, "async function loadIdeRelease()", "async function copyText", "Hive IDE v2 evidence loading");
requireMatch(loadIdeReleaseBlock, /AbortController[\s\S]*fetch\("\/downloads\/hive-ide\/latest\.json"[\s\S]*IDE_RELEASE_LATEST_MAX_BYTES[\s\S]*IDE_RELEASE_LATEST_SHA256[\s\S]*validateIdeReleaseLatest\(parseJsonBytesStrict\(body/, "bounded and strict Hive IDE v2 feed validation");
requireMatch(loadIdeReleaseBlock, /new URL\(latest\.truthManifestUrl\)\.pathname[\s\S]*fetch\(truthPath[\s\S]*IDE_RELEASE_TRUTH_MAX_BYTES[\s\S]*IDE_RELEASE_TRUTH_MANIFEST_SHA256[\s\S]*latest\.truthManifestSha256[\s\S]*validateIdeReleaseTruthManifest\(parseJsonBytesStrict\(truthBody/, "same-origin Hive IDE truth-manifest byte and semantic validation");
requireNoMatch(loadIdeReleaseBlock, /JSON\.parse|\.href\s*=|classList\.remove\(["']is-disabled["']/, "Hive IDE v2 loose parse or action promotion");
// Order-free custody gate: landing and public retrievability remain distinct;
// the receipt is unsigned and retains no raw bytes.
requireMatch(ideReleaseCore, /status: "PUBLIC_REMOTE_BYTES_VERIFIED"/, "Hive IDE remote-byte receipt custody gate (status)");
requireMatch(ideReleaseCore, /landingStatus: "LANDED_HASH_VERIFIED"/, "Hive IDE remote-byte receipt custody gate (landed hash)");
requireMatch(ideReleaseCore, /publicRetrievability: "PRIVATE_SOURCE_NOT_PUBLICLY_RETRIEVABLE"/, "Hive IDE remote-byte receipt custody gate (private retrievability)");
requireMatch(ideReleaseCore, /rawHttpRetained: false/, "Hive IDE remote-byte receipt custody gate (no raw bytes retained)");
requireMatch(ideReleaseCore, /independentlySigned: false/, "Hive IDE remote-byte receipt custody gate (unsigned)");
requireMatch(ideReleaseCore, /packageContents:[\s\S]*UNKNOWN[\s\S]*installation:[\s\S]*UNKNOWN[\s\S]*runtime:[\s\S]*UNKNOWN[\s\S]*productLive:[\s\S]*UNKNOWN[\s\S]*publicFunctionalTesting:[\s\S]*HOLD/, "Hive IDE subject-scoped claim-plane gate");
requireMatch(ideReleaseCore, /requireDownloadDisposition[\s\S]*activeDownloadAuthorized[\s\S]*UNSIGNED_AND_INSTALL_RUNTIME_UNVERIFIED[\s\S]*SEPARATE_UNEXPIRED_OPERATOR_AUTHORIZATION/, "Hive IDE download-disposition HOLD gate");
requireNoMatch(ideReleaseCore, /eval\(|new Function\(/, "Hive IDE release validator dynamic code");
requireMatch(galaxyCore, /facts\.pmOnly !== facts\.purposeMastered - facts\.twitches/, "PM Twitch invariant");
requireMatch(galaxyCore, /captured - now > 5 \* 60_000[\s\S]*snapshotFreshness\(snapshot\.capturedAt\)\.state === "invalid"/, "capture timestamp validity and future-skew gate");
const loadSourceSnapshotBlock = boundedBlock(js, "async function loadSourceSnapshot()", "function scheduleSnapshotRefresh()", "source snapshot loading");
requireMatch(js, /const HUB_FACTS_MAX_BYTES = 512 \* 1024;/, "hub-facts browser byte ceiling");
requireMatch(loadSourceSnapshotBlock, /content-length[\s\S]*HUB_FACTS_MAX_BYTES[\s\S]*response\.arrayBuffer\(\)[\s\S]*snapshotBytes\.byteLength[\s\S]*parseJsonBytesStrict\(snapshotBytes, "hub-facts source snapshot"\)/, "bounded raw-byte strict hub-facts browser custody");
requireMatch(generator, /COMPILED_SNAPSHOT_MAX_BYTES = 512 \* 1024[\s\S]*runCompiledJson[\s\S]*parseJsonBytesStrict\(bytes, "compiled source snapshot"\)/, "bounded strict compiler-to-hub-facts custody");
requireNoMatch(generator, /JSON\.parse\(run\(/, "permissive compiler-to-hub-facts JSON boundary");
requireNoMatch(loadSourceSnapshotBlock, /response\.json\(\)|JSON\.parse/, "loose hub-facts browser parsing");
requireMatch(js, /SNAPSHOT_REFRESH_MS = 60_000/, "visibility-aware snapshot refresh interval");
requireMatch(js, /Last-good snapshot/, "last-good refresh behavior");
requireMatch(js, /AbortController/, "snapshot request cancellation");
requireMatch(js, /snapshotRequestGeneration/, "snapshot response generation gate");
requireMatch(js, /snapshotResponseCanCommit\([\s\S]*aborted:/, "behavioral snapshot response gate integration");
requireMatch(js, /sourceSnapshotPresentation\([\s\S]*automaticBridgeEnabled === true[\s\S]*presentation\.freshness === "historical"[\s\S]*presentation\.freshness === "aged"[\s\S]*presentation\.bridge === "configured"/, "source-age and bridge-configuration separation");
requireMatch(galaxyCore, /freshnessDisposition: freshness\.state === "recent" \? "CURRENT_EVIDENCE_OK" : "FRESHNESS_HOLD"[\s\S]*badgeState: freshness\.state === "recent" \? "" : "stale"/, "aged source capture always holds freshness independently of bridge state");
requireMatch(js, /freshnessHeld = presentation\.freshnessDisposition === "FRESHNESS_HOLD"[\s\S]*HISTORICAL CAPTURE[\s\S]*FRESHNESS HOLD[\s\S]*data-galaxy-snapshot-state[\s\S]*freshnessHeld \? "historical" : "recent"/, "compact source-binding and freshness badge separation");
requireMatch(forcedColorsWiring, /const onForcedColorsChange = \(event\) => this\.applyRenderAvailability\(Boolean\(event\.matches\)\);/, "live forced-colors transition callback");
requireMatch(forcedColorsWiring, /this\.forcedColors\.addEventListener\("change", onForcedColorsChange\)/, "live forced-colors transition listener");
requireMatch(forcedColorsWiring, /this\.forcedColors\.addListener\(onForcedColorsChange\)/, "legacy forced-colors transition listener");
requireMatch(js, /applyRenderAvailability\(forcedColorsActive\)/, "live render fallback transition");
requireMatch(js, /applyRenderAvailability\(forcedColorsActive\)[\s\S]*if \(fallback\) \{[\s\S]*this\.cancelDirector\(false\);[\s\S]*this\.setEngaged\(false\);/, "render fallback cancels Director before controls become unavailable");
requireMatch(js, /if \(\$\("\[data-source-stamp\], \[data-galaxy-canvas\]"\)\)[\s\S]*loadSourceSnapshot\(\)\.finally\(startSnapshotRefresh\)/, "snapshot refresh surface gate");
requireMatch(js, /runAfterFirstPaint\("Offscreen scene control", wireSceneActivity, 40\)/, "deferred offscreen CSS animation control");
requireNoMatch(js, /wireLocalHandoffGate|data-local-handoff-confirm|hive:request-local-handoff/, "obsolete active local navigation wiring");
requireMatch(js, /Future handoff context is source-bound[\s\S]*link\.dataset\.futureHandoff = href[\s\S]*link\.dataset\.contextBound = "true"/, "disabled future Local Body context hook");
requireNoMatch(js, /link\.href = href/, "future local context promoted to active navigation");
requireNoMatch(js, /time\s*-\s*this\.lastFrame\s*<\s*32/, "30fps frame throttle");
requireNoMatch(js, /Math\.random\(/, "non-deterministic visual geometry");
requireNoMatch(galaxyCore, /GOLDEN_ANGLE|syntheticGeometry|fallbackGeometry/i, "synthetic public galaxy geometry");
requireMatch(generator, /build_public_geometry_projection[\s\S]*load_renderer_contract[\s\S]*RENDERER_CONTRACT_HASH/, "canonical authored-geometry bridge");
requireMatch(galaxyCore, /GALAXY_CANONICAL_GEOMETRY_HASH = "29948f2c[0-9a-f]+c314"[\s\S]*computedHash === GALAXY_CANONICAL_GEOMETRY_HASH/, "runtime tuple-content geometry digest");
requireMatch(galaxyCore, /semanticAnatomicalDepthMilli[\s\S]*row\[5\] !== 10_500[\s\S]*row\[6\] !== 7_000[\s\S]*row\[6\] !== 3_100/, "authored taxonomy, depth, and size invariants");
requireMatch(galaxyCore, /GALAXY_PUBLIC_PALETTES[\s\S]*runtime:[\s\S]*product:/, "neutral public neuron palette contract");
requireNoMatch(galaxyCore, /\[255,\s*209,\s*102\]|\[52,\s*255,\s*136\]|\[113,\s*246,\s*188\]/, "reserved physiology color in public neuron palettes");

requireMatch(css, /@media \(prefers-reduced-motion: reduce\)/, "reduced motion");
requireMatch(css, /button:focus-visible,[\s\S]*a:focus-visible/, "visible focus");
requireMatch(css, /\.motion-toggle:hover:not\(:disabled\)/, "inert motion control hover state");
requireMatch(css, /\.ide-release-console\s*{[\s\S]*grid-template-columns:[\s\S]*\.ide-stack-grid\s*{[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/, "desktop Hive IDE release composition");
requireMatch(css, /\.ide-start-here\s*{[\s\S]*grid-template-columns:[\s\S]*\.ide-start-steps li\s*{[\s\S]*grid-template-columns:/, "desktop START HERE composition");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*\.ide-release-facts,[\s\S]*\.ide-start-here,[\s\S]*\.ide-stack-grid,[\s\S]*\.ide-release-digest\s*{[\s\S]*grid-template-columns:\s*1fr;/, "mobile Hive IDE release composition");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.ide-release-console[\s\S]*\.ide-release-glow/, "forced-colors Hive IDE release fallback");
requireMatch(css, /\[data-reveal\]\s*{\s*opacity:\s*1;/, "progressive no-JS visibility");
requireMatch(css, /\[data-reveal\]\.reveal-ready/, "enhanced reveal state");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.galaxy-canvas/, "forced-colors galaxy fallback");
requireMatch(css, /@keyframes centered-orbit-spin[\s\S]*translate\(-50%, -50%\) rotate\(-13deg\)[\s\S]*translate\(-50%, -50%\) rotate\(347deg\)/, "stable centered hero orbit");
requireMatch(css, /\.motion-scene-paused[\s\S]*animation-play-state:\s*paused !important/, "offscreen CSS animation pause");
requireMatch(css, /body\.motion-paused \*[\s\S]*animation-play-state:\s*paused !important;[\s\S]*transition-duration:\s*0s !important;/, "manual motion pause suppresses animations and transitions");
requireMatch(css, /\.galaxy-stage\s*{[\s\S]*?touch-action:\s*pan-y;/, "touch page-scroll preservation");
requireMatch(css, /\.galaxy-stage\.is-engaged\s*{[\s\S]*?touch-action:\s*none;/, "engaged touch orbit ownership");
requireMatch(css, /\.hero-system \.satellite-ide\s*{\s*grid-column:\s*6;[\s\S]*\.hero-system \.stage-readout\s*{[\s\S]*grid-column:\s*2 \/ 5;/, "collision-proof hero stage ownership");
requireMatch(css, /\.galaxy-workbench\.is-full-atlas\s*{[\s\S]*position:\s*fixed;[\s\S]*height:\s*100dvh;/, "full-viewport atlas layout");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*\.galaxy-workbench\.is-full-atlas[\s\S]*grid-template-rows:/, "mobile same-viewport atlas and inspector");
requireMatch(css, /@media \(min-width: 42\.01rem\) and \(max-width: 62rem\) and \(max-height: 40rem\)\s*{[\s\S]*\.galaxy-workbench\.is-full-atlas\s*{[^}]*grid-template-rows:\s*max\(100dvh, 24rem\) auto;[^}]*overflow-y:\s*auto;[\s\S]*\.galaxy-workbench\.is-full-atlas \.galaxy-stage\s*{[^}]*height:\s*max\(100dvh, 24rem\);[^}]*min-height:\s*24rem;[\s\S]*\.galaxy-workbench\.is-full-atlas \.galaxy-inspector\s*{[^}]*min-height:\s*100dvh;[^}]*overflow-y:\s*visible;/, "medium-width short-height atlas preserves a full-height stage and scrolls the inspector below");
requireMatch(css, /\.galaxy-stage-bottom\s*{[\s\S]*right:\s*1rem;[\s\S]*bottom:\s*1rem;[\s\S]*left:\s*1rem;[\s\S]*\.galaxy-stage-rail\s*{[\s\S]*grid-template-columns:/, "collision-proof shared atlas bottom rail");
requireMatch(css, /@media \(max-width: 20rem\)[\s\S]*\.galaxy-demo-proof\s*{[\s\S]*top:\s*4rem;/, "200-percent mobile overlay stack");
requireMatch(css, /\.galaxy-atlas-toolbar\s*{[\s\S]*position:\s*sticky;[\s\S]*\.galaxy-atlas-toolbar \[data-galaxy-director\]\s*{[\s\S]*grid-column:\s*auto;/, "compact persistent Director, Reset, and Fit toolbar");
requireMatch(js, /const GALAXY_OVERVIEW_LABEL_LIMIT = 1;[\s\S]*const fontSize = active \? 19 : 17;[\s\S]*selected \? 18 : 16[\s\S]*800 17px/, "single-focus overview label and typography floors");
requireMatch(js, /context\.globalAlpha = Math\.min\(this\.width, this\.height\) < 640 \? 0\.38 : 0\.28;/, "subordinate warm-field exposure");
requireMatch(js, /stageFocusSummary = this\.width < 420[\s\S]*FOCUS · \$\{division\.code\} · \$\{division\.neuronCount\}N · \$\{division\.families\.length\}F[\s\S]*Focus · \$\{division\.code\} · \$\{division\.neuronCount\} neurons · \$\{division\.families\.length\} families/, "responsive non-duplicative atlas focus summary");
requireMatch(js, /const expansive = active && hovered && !this\.fullAtlas && semanticAnchor/, "full-atlas canvas label stays compact");
requireMatch(js, /if \(!selected && this\.zoom < 1\.55\) return false;/, "semantic family-label zoom gate");
requireMatch(js, /this\.fullAtlas && this\.width >= 620 && this\.zoom < 1\.5[\s\S]*\? this\.divisions\.length/, "all-division desktop atlas orientation");
requireMatch(css, /\.galaxy-director-motion-note\s*\{[^}]*position: absolute;[^}]*width: 1px;[^}]*clip-path: inset\(50%\);[^}]*white-space: nowrap;/, "reduced-motion explanation remains accessible without dominating the inspector");
requireMatch(css, /\.galaxy-mark-key\s*\{[^}]*font: 760 0\.875rem\/1\.3/, "projector-readable atlas visual key");
requireMatch(js, /galaxyMembershipBundleGeometry[\s\S]*familyMembershipBundle\([\s\S]*quadraticCurveTo\(bundle\.sourceControl[\s\S]*quadraticCurveTo\(bundle\.trunkControl[\s\S]*bundle\.junction/, "deterministic authored membership route bundling");
requireMatch(css, /\.galaxy-depth,[\s\S]*\.map-readout span\s*\{[^}]*color:\s*#bdccde;[\s\S]*\.galaxy-hint\s*\{[^}]*color:\s*#b8c8da;[\s\S]*\.galaxy-state-rail span\s*\{[^}]*color:\s*#b7c6d8;/, "projector-grade HUD microcopy contrast");
requireMatch(css, /\.galaxy-atlas-toolbar \[data-galaxy-fit-selected\]\s*\{[^}]*linear-gradient[\s\S]*\.galaxy-state-rail\s*\{[^}]*flex: 0 0 auto;[^}]*grid-template-columns: minmax\(0, 0\.9fr\)[^;]*minmax\(0, 1\.35fr\)/, "dominant focus action and non-collapsing command state rail");
requireMatch(css, /\.galaxy-workbench\.is-full-atlas \.galaxy-depth\s*\{[^}]*display:\s*grid;[\s\S]*\.galaxy-workbench\.is-full-atlas \.galaxy-mobile-context\s*\{[^}]*display:\s*grid;/, "mobile full-atlas hierarchy and live-state visibility");
requireMatch(js, /glideStickyBox\(cacheKey, point, width, height, occupied\)[\s\S]*never re-enters[\s\S]*clamp\(pushX, -2, 2\)[\s\S]*occupied\.push\(placed\)/, "plate object permanence: sticky plates glide, never re-ladder");
requireMatch(js, /this\.glideStickyBox\(`d\$\{index\}`, point, width, height, occupied\)\s*\|\| this\.placeSafeCanvasLabel/, "division plates take the glide path before any ladder");
requireMatch(js, /this\.glideStickyBox\(`f\$\{familyGeometryIndex\}`, point, width, height, occupied\)\s*\|\| this\.placeSafeCanvasLabel/, "family plates take the glide path before any ladder");
requireMatch(css, /\.hero\s*{[\s\S]*grid-template-rows:\s*auto auto;[\s\S]*min-height:\s*calc\(100svh - 5\.25rem\)[\s\S]*\.hero-outcomes\s*{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/, "outcome-first hero layout contract");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*\.hero-system\s*{[\s\S]*grid-template-columns:\s*repeat\(2,[\s\S]*min-height:\s*11\.5rem;[\s\S]*\.hero-system \.satellite-core,[\s\S]*display:\s*none;/, "recognizable compact mobile organism");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*\.hero-primary-action \.hero-enter\s*{[\s\S]*flex:\s*none;[\s\S]*width:\s*100%;/, "mobile primary CTA uses intrinsic height");
requireMatch(css, /@media \(max-width: 24rem\) and \(max-height: 36rem\)[\s\S]*\.primary-nav,[\s\S]*\.hero-copy > \.eyebrow[\s\S]*display:\s*none;[\s\S]*\.hero-system\s*{[\s\S]*min-height:\s*5\.75rem;/, "short mobile first-frame hierarchy");
requireMatch(css, /\.hero-lede\s*{[\s\S]*font-size:\s*clamp\(1rem,[\s\S]*\.primary-nav a,[\s\S]*font-size:\s*0\.875rem;[\s\S]*\.hero-outcomes b\s*{[\s\S]*font-size:\s*0\.9375rem;/, "zero-squint hero and navigation typography");
requireMatch(css, /@media \(max-width: 62rem\)[\s\S]*\.platform-table-scroll\s*{[\s\S]*overflow:\s*visible;[\s\S]*\.platform-table tbody td\s*{[\s\S]*grid-template-columns:/, "tablet platform matrix semantic cards");
requireMatch(css, /@media \(min-width: 42\.01rem\) and \(max-width: 62rem\)[\s\S]*\.outcome-grid,[\s\S]*\.roadmap-rail\s*{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/, "tablet two-column outcome and roadmap cards");
requireMatch(css, /@media \(max-width: 62rem\) and \(max-height: 40rem\)[\s\S]*\.outcome-grid,[\s\S]*\.roadmap-rail\s*{[\s\S]*grid-template-columns:\s*1fr;/, "short presentation one-column outcome and roadmap cards");
requireMatch(js, /fragmentCorrectionArmed[\s\S]*gap < 12 \|\| gap > 28[\s\S]*headerHeight - 18[\s\S]*hashchange[\s\S]*scheduleFragmentCorrection\(true\)/, "measured cold-fragment correction contract");
requireMatch(js, /button\.tabIndex = selected \? 0 : -1[\s\S]*ArrowRight[\s\S]*ArrowLeft[\s\S]*Home[\s\S]*End/, "Atlas lens roving tabindex contract");
requireMatch(js, /const openers = \$\$\('\[data-galaxy-fullscreen\]'\)[\s\S]*anchorPrimes[\s\S]*openers\.forEach[\s\S]*event\.preventDefault\(\)[\s\S]*this\.openFullAtlas/, "explicit Full Atlas dialog opener");
const atlasAnchorPrimeWiring = boundedBlock(js, "anchorPrimes.forEach", "openers.forEach", "semantic Atlas anchor priming");
requireNoMatch(atlasAnchorPrimeWiring, /addEventListener\("click"|preventDefault/, "semantic hero Atlas anchor interception");
requireMatch(css, /\.mission-machine-head > div:first-child strong,[\s\S]*\.authority-wall p:last-child\s*{[\s\S]*font-size:\s*1rem;/, "16px command narrative typography floor");
requireMatch(css, /\.inspector-stats dd,[\s\S]*\.mission-machine-head > div:first-child span,[\s\S]*\.mission-step > span,[\s\S]*\.command-cycle-orb b,[\s\S]*\.command-cycle-navigation > span,[\s\S]*\.command-cycle-actions \.button small,[\s\S]*\.command-cycle-boundary,[\s\S]*\.wall-state\s*{[\s\S]*font-size:\s*0\.875rem;/, "14px projector truth and navigation typography floor");
requireMatch(css, /--type-copy-min:\s*1rem;[\s\S]*--type-meta-min:\s*0\.875rem;/, "page-wide zero-squint typography tokens");
requireMatch(zeroSquintCopyBlock, /\)\s*\{\s*font-size:\s*var\(--type-copy-min\);\s*\}/, "16px evidence-classified copy floor");
requireMatch(zeroSquintMetaBlock, /\)\s*\{\s*font-size:\s*var\(--type-meta-min\);\s*\}/, "14px metadata and control typography floor");
requireMatch(css, /\.primary-nav a,[\s\S]*\.galaxy-atlas-toolbar button,[\s\S]*\.mission-step,[\s\S]*min-height:\s*2\.75rem;/, "44px presentation control targets");
requireMatch(css, /\.ide-release-digest button\s*\{[^}]*min-height:\s*44px;/, "44px IDE release digest targets");
requireMatch(css, /\.release-bindings button\s*\{[^}]*min-height:\s*44px;/, "44px signed-release copy targets");
requireMatch(css, /\.toast\s*\{[^}]*font-size:\s*1rem;[^}]*line-height:\s*1\.45;/, "16px recovery guidance toast");
requireMatch(css, /\.galaxy-atlas-status\s*\{[^}]*position:\s*static;[^}]*font-size:\s*1rem;[^}]*line-height:\s*1\.45;/, "16px normal-flow local atlas status");
requireMatch(css, /\.galaxy-atlas-status:empty\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;[^}]*border:\s*0;/, "zero-box empty atlas status remains in the accessibility tree");
requireNoMatch(css, /\.galaxy-atlas-status:empty\s*\{[^}]*(?:display\s*:\s*none|visibility\s*:\s*hidden)/, "hidden empty atlas live status");
requireNoMatch(css, /body\.galaxy-fullscreen-open > \.toast/, "full-atlas global toast overlay");
requireMatch(js, /function clearToast\(\)[\s\S]*data-toast[\s\S]*data-galaxy-atlas-status[\s\S]*globalToast\.textContent = ""[\s\S]*atlasStatus\.textContent = ""/, "shared global and atlas status clearing");
requireMatch(js, /function showToast\(message\)[\s\S]*clearToast\(\);[\s\S]*data-galaxy-dialog\]\.is-full-atlas \[data-galaxy-atlas-status\][\s\S]*const toast = atlasStatus \|\| globalToast;/, "toast guidance routes inside the isolated atlas");
requireMatch(js, /closeFullAtlas\(restoreFocus = true\)[\s\S]*if \(!this\.fullAtlas\) return;[\s\S]*this\.cancelDirector\(false\);[\s\S]*this\.setEngaged\(false\);[\s\S]*clearToast\(\);[\s\S]*this\.fullAtlas = false;/, "atlas close clears teardown guidance before restoring the hero");
requireMatch(js, /showToast\("Atlas open\. Escape releases controls, then exits\."\);/, "concise atlas Escape recovery guidance");
requireMatch(css, /\.primary-nav,[\s\S]*\.galaxy-controls,[\s\S]*\.lens-bar,[\s\S]*\.command-cycle-navigation\s*{[\s\S]*gap:\s*0\.5rem;/, "eight-pixel presentation control spacing");
requireMatch(css, /\.command-cycle-climax\s*{[\s\S]*opacity:\s*0;[\s\S]*\.mission-machine\.is-climax \.command-cycle-climax\s*{[\s\S]*opacity:\s*1;/, "WATCH visual climax state");
requireMatch(css, /\.mission-machine\.is-climax \.mission-grid\s*{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(6,[\s\S]*\.mission-machine\.is-climax \.mission-step\s*{[\s\S]*min-height:\s*5rem;[\s\S]*\.mission-machine\.is-climax \.command-cycle-viewport\s*{[\s\S]*min-height:\s*clamp\(19rem, 44vh, 26rem\);/, "focus-safe fully visible WATCH climax frame");
requireMatch(css, /\.local-handoff-dialog\s*{[\s\S]*max-height:\s*calc\(100dvh - 2rem\)[\s\S]*\.local-handoff-dialog::backdrop/, "persistent local recovery dialog layout");
requireMatch(css, /\.map-readout\s*{[\s\S]*?pointer-events:\s*none;/, "non-blocking graph readout overlay");
requireMatch(css, /\.mission-grid\s*{[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/, "six-stage command flightdeck");
requireMatch(css, /\.command-cycle-readout\s*{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) auto;/, "command cycle proof readout");
requireMatch(css, /\.command-cycle-viewport\s*{[\s\S]*?min-height:\s*clamp\(20rem, 42vw, 34rem\)/, "command organism viewport");
requireMatch(css, /body\.command-flightdeck-open::after[\s\S]*\.mission-machine\.is-flightdeck\s*{[\s\S]*?position:\s*fixed;/, "projector flightdeck isolation");
requireMatch(css, /@keyframes command-cycle-scan[\s\S]*@keyframes command-cycle-node/, "command cycle motion language");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*?\.command-cycle-readout\s*{[\s\S]*?grid-template-columns:\s*1fr;/, "mobile command readout stack");
requireMatch(css, /@media \(forced-colors: active\)[\s\S]*\.command-cycle-readout[\s\S]*\.command-cycle-orb/, "forced-colors command fallback");
requireMatch(css, /@media \(max-width: 42rem\)[\s\S]*?\.galaxy-stage-bottom\s*{[\s\S]*?bottom:\s*0\.6rem;[\s\S]*?\.galaxy-stage-rail\s*{[\s\S]*?grid-template-columns:\s*1fr;/, "separated mobile galaxy overlays");
requireMatch(css, /@media \(max-width: 24rem\), \(max-height: 36rem\)[\s\S]*\.galaxy-stage-bottom \.galaxy-hint\s*{[\s\S]*display:\s*none;[\s\S]*\.galaxy-demo-proof\s*{[\s\S]*display:\s*none !important;[\s\S]*\.galaxy-stage\[data-director-step\] \.galaxy-stage-rail,[\s\S]*data-galaxy-director-copy[\s\S]*display:\s*none;[\s\S]*\.galaxy-director-inline-proof\s*{[\s\S]*display:\s*block;/, "short-height 200-percent atlas stack");
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

if (facts.schema !== "hive.ecosystem.public-source-snapshot.v3" || facts.snapshotVersion !== GALAXY_SNAPSHOT_VERSION) throw new Error("source snapshot schema mismatch");
exactKeys(facts, ["schema", "snapshotVersion", "hiveAi", "galaxy", "ecosystem", "refresh", "boundaries", "capturedAt", "snapshotHash"], "source snapshot");
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
if (!/^(?!0{64}$)[a-f0-9]{64}$/.test(facts.hiveAi?.sourceFingerprint || "")) throw new Error("Living Anatomy source fingerprint is not exact");

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
if (galaxy?.schema !== "hive.ecosystem.public-galaxy.v2" || galaxy?.generatorVersion !== GALAXY_GENERATOR_VERSION || galaxy?.statusProjection !== "none") throw new Error("public galaxy schema or status boundary drifted");
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
if (projectionHash !== sha256(canonicalJson(galaxyWithoutHash))) throw new Error("public galaxy projection hash mismatch");
const geometry = galaxy.geometry;
exactKeys(geometry, ["schema", "projection", "sourceGraphHash", "contractVersion", "contractHash", "coordinateSpace", "divisions", "families", "neurons", "geometryHash"], "public authored geometry");
if (geometry.schema !== "hive.galaxy.public-geometry.v1"
  || geometry.projection !== "living-anatomy-body"
  || geometry.sourceGraphHash !== facts.hiveAi.graphHash
  || geometry.contractVersion !== "1.0.0"
  || geometry.contractHash !== GALAXY_RENDERER_CONTRACT_HASH
  || geometry.coordinateSpace !== "hiveai.living_anatomy_layout.v1"
  || geometry.divisions?.length !== 16
  || geometry.families?.length !== 64
  || geometry.neurons?.length !== 640) throw new Error("public authored geometry contract drifted");
const geometryBody = {
  coordinateSpace: geometry.coordinateSpace,
  divisions: geometry.divisions,
  families: geometry.families,
  neurons: geometry.neurons,
};
if (geometry.geometryHash !== GALAXY_CANONICAL_GEOMETRY_HASH
  || geometry.geometryHash !== sha256(canonicalJson(geometryBody))) throw new Error("public authored geometry hash mismatch");
const { snapshotHash, ...snapshotWithoutHash } = facts;
if (snapshotHash !== sha256(canonicalJson(snapshotWithoutHash))) throw new Error("public snapshot hash mismatch");
if (!await validSnapshot(facts)) throw new Error("runtime rejected the checked-in strict public snapshot");

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
  && ["CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED", "PRIVATE_SOURCE_CHECKOUT_FAILED", "MANUAL_WORKFLOW_DISPATCH"].includes(facts.refresh?.reasonCode);
if (!activeRefresh && !activeLocalRefresh && !inactiveRefresh) throw new Error("refresh automation boundary drifted");

const syncWorkflow = read(".github/workflows/sync-living-galaxy.yml");
const verifyWorkflow = read(".github/workflows/verify-public-hub.yml");
const pagesWorkflow = read(".github/workflows/publish-reviewed-pages.yml");
const pagesBuilder = read("script/build-public-pages.mjs");
const pagesArtifactCheck = read("script/check-public-pages-artifact.mjs");
const liveParity = read("script/check-live-parity.mjs");
const pagesAllowlist = parseJsonBytesStrict(readBytes(".github/pages-public-allowlist.v1.json"), "Pages public allowlist");
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
requireMatch(ideSmokeScript, /@\(Get-HiveUninstallEntries\)\.Count -ne 0/, "empty uninstall-registry normalization");
requireMatch(ideSmokeScript, /Live latest feed differs from the landed central hub document[\s\S]*Release manifest differs from the live feed or landed mirror/, "live-to-landed release binding");
requireMatch(ideSmokeScript, /Get-Sha256 \$InstallerPath[\s\S]*Downloaded installer bytes differ/, "full installer hash proof");
requireMatch(ideSmokeScript, /Start-Process -FilePath \$InstallerPath -ArgumentList '\/S'[\s\S]*applicationHashMatchesManifest = \$true/, "exact install and application hash proof");
requireMatch(ideSmokeScript, /MainWindowHandle -ne 0 -and \$Process\.Responding[\s\S]*CloseMainWindow\(\)[\s\S]*WaitForExit/, "responsive window and graceful close proof");
requireMatch(ideSmokeScript, /\[ValidateRange\(15, 120\)\][\s\S]*\$CloseTimeoutSeconds = 60[\s\S]*WaitForExit\(\$CloseTimeoutSeconds \* 1000\)/, "bounded runtime-aware close timeout");
requireMatch(ideSmokeScript, /uninstallEntryCountAfter[\s\S]*installedApplicationRemoved[\s\S]*unrelatedProcessesTerminated = \$false/, "bounded uninstall proof");
requireMatch(ideSmokeScript, /\$installAttemptOwned = \$false[\s\S]*\$installAttemptOwned = \$true[\s\S]*if \(\$installAttemptOwned\)/, "installer-owned failure cleanup gate");
requireMatch(ideSmokeScript, /expectedTempPrefix[\s\S]*hive-ide-public-smoke-\*[\s\S]*Remove-Item -LiteralPath \$resolvedWorkRoot/, "bounded runner-temp cleanup");
requireNoMatch(`${syncWorkflow}\n${verifyWorkflow}`, /11d5960a326750d5838078e36cf38b85af677262|49933ea5288caeca8642d1e84afbd3f7d6820020/, "deprecated Node-20 action pin");
requireMatch(compileJob, /permissions:\s*\n\s+contents:\s*read/, "credential-free compiler authority");
requireNoMatch(compileJob, /contents:\s*write|pages:\s*write/, "compiler publication authority");
requireMatch(publishJob, /permissions:\s*\n\s+contents:\s*write/, "isolated snapshot publisher authority");
requireNoMatch(publishJob, /pages:\s*write|id-token:\s*write/, "snapshot publisher Pages deployment authority");
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
requireNoMatch(syncWorkflow, /pages\/builds|pages:\s*write|id-token:\s*write/, "legacy or direct Pages deployment from snapshot publisher");
requireMatch(pagesWorkflow, /workflow_run:[\s\S]*workflows: \["Sync living galaxy"\][\s\S]*conclusion == 'success'[\s\S]*head_branch == 'main'/, "GITHUB_TOKEN snapshot push deployment route");
requireMatch(pagesWorkflow, /cancel-in-progress:\s*true[\s\S]*git checkout --detach refs\/remotes\/origin\/main[\s\S]*Refuse a stale main artifact/, "current-main monotonic Pages custody");
requireMatch(pagesWorkflow, /actions\/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b[\s\S]*actions\/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b[\s\S]*actions\/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e/, "pinned custom Pages action chain");
requireMatch(pagesWorkflow, /stage="\$\{RUNNER_TEMP\}\/hive-pages-reviewed"[\s\S]*test ! -e "\$stage"[\s\S]*build-public-pages\.mjs build[\s\S]*check-http-surface\.mjs --root "\$stage"/, "fresh allowlisted Pages stage and staged HTTP gate");
requireMatch(pagesBuilder, /REQUIRED_FORBIDDEN_EXACT[\s\S]*forbiddenExactPaths\.length !== 23/, "Pages builder exact forbidden-path gate");
requireMatch(pagesBuilder, /lstat[\s\S]*isSymbolicLink[\s\S]*nlink[\s\S]*PUBLIC_ARTIFACT_MEMBERSHIP_MISMATCH/, "Pages builder unsafe-member and exact-membership gate");
requireMatch(pagesArtifactCheck, /mkdtemp[\s\S]*check-http-surface\.mjs[\s\S]*rm\(resolvedTemporaryRoot, \{ recursive: true, force: true \}\)/, "self-cleaning staged HTTP integration wrapper");
requireMatch(liveParity, /generatedQuarantineRoutes[\s\S]*forbiddenExactPaths\.length !== 23[\s\S]*content-length[\s\S]*BODY_SIZE_OUT_OF_BOUNDS_OR_MISMATCHED[\s\S]*EXPECTED_404_OR_410/, "bounded deployed allowlist parity and retired-path negative gate");
if (pagesAllowlist.forbiddenExactPaths?.length !== 23
  || !pagesAllowlist.forbiddenPrefixes?.includes(".github/")
  || !pagesAllowlist.forbiddenPrefixes?.includes("docs/")
  || !pagesAllowlist.forbiddenPrefixes?.includes("fixtures/")
  || !pagesAllowlist.forbiddenPrefixes?.includes("script/")
  || !pagesAllowlist.forbiddenPrefixes?.includes("tests/")
  || !pagesAllowlist.privateSourceOnlyPaths?.includes("README.md")) {
  throw new Error("Pages allowlist does not freeze the exact private publication boundary");
}
requireMatch(compileJob, /secrets\.HIVE_AI_READ_DEPLOY_KEY/, "read-only private-source deploy key");
requireMatch(compileJob, /mark-galaxy-bridge-inactive\.mjs --credential-missing/, "credential-removal fail-closed path");
requireMatch(compileJob, /mark-galaxy-bridge-inactive\.mjs --checkout-failed/, "credential-failure fail-closed path");
const secretNames = [...syncWorkflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
if (secretNames.some((name) => name !== "HIVE_AI_READ_DEPLOY_KEY")) throw new Error("unexpected workflow secret authority");
requireNoMatch(syncWorkflow, /personal_access_token|\bPAT\b/i, "broad sync credential");
requireMatch(syncDocs, /read-only `compile` job[\s\S]*separate `publish` job[\s\S]*never checks out Hive-AI or executes its\s+code/, "documented split publisher trust boundary");
requireMatch(syncDocs, /remote `main` both before and after compilation[\s\S]*never a mixed-era artifact/, "documented living-main race boundary");
requireMatch(syncDocs, /never rebases[\s\S]*reconstructs the exact candidate bytes[\s\S]*concurrent writer changed the facts/, "documented immutable candidate reconciliation");
requireMatch(syncDocs, /never requests a legacy branch-root Pages build[\s\S]*workflow_run[\s\S]*exact current Pages `main`[\s\S]*without a PAT/, "documented allowlisted Pages deployment recovery");
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
requireMatch(galaxyCore, /galaxy\.sourceGraphHash !== facts\?\.graphHash/, "runtime graph binding");
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
const manifest = parseJsonBytesStrict(readBytes("site.webmanifest"), "site webmanifest");
if (manifest.start_url !== "/" || manifest.scope !== "/" || !Array.isArray(manifest.icons) || manifest.icons.length < 1) throw new Error("web manifest contract drifted");
requireMatch(read("robots.txt"), /Sitemap: https:\/\/dhenz14\.github\.io\/sitemap\.xml/, "root robots sitemap");
const sitemap = read("sitemap.xml");
requireMatch(sitemap, /<loc>https:\/\/dhenz14\.github\.io\/<\/loc>/, "root sitemap URL");
requireNoMatch(sitemap, /HivePoA/, "noindex HivePoA sitemap exclusion");

// Superseded by the quarantine contract above: every HivePoA route is now one
// byte-identical hold page whose only href is the Product Truth escape. The retired
// subsite navigation must not come back while the surface is quarantined.
for (const relative of hivePoaQuarantineRoutes) {
  const routeHtml = read(relative);
  requireNoMatch(routeHtml, /Hive ecosystem hub|HivePoA home/, `${relative} retired subsite navigation`);
}

for (const match of html.matchAll(/(?:href|src)=["'](\/[^"'#?]*)["']/g)) {
  const publicPath = match[1];
  const candidate = publicPath.endsWith("/")
    ? path.join(root, publicPath.slice(1), "index.html")
    : path.join(root, publicPath.slice(1));
  if (!fs.existsSync(candidate)) throw new Error(`root hub target missing: ${publicPath}`);
}

console.log(
  `CENTRAL_HUB_CONTRACT_OK source=${facts.hiveAi.sourceCommit.slice(0, 12)} canonical=${productTruthVerification.manifest.canonicalManifest.status} product_truth=${productTruthVerification.manifest.bindingDigest.value.slice(0, 12)} hostile_cases=${productTruthVerification.tests.length} browser_hostile_cases=${browserTruthSelfTests.length} hub_facts_hostile_cases=${hubFactsHostileCases} nodes=${facts.hiveAi.nodes} edges=${facts.hiveAi.edges} twitches=${facts.hiveAi.twitches} pm_only=${facts.hiveAi.pmOnly} division_nav_options=${divisionNavigatorLabels.length} short_nav_reclaim_px=${shortDivisionNavReclaimPx}`,
);
