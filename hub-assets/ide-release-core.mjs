const HEX_40 = /^[a-f0-9]{40}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export const IDE_RELEASE_LATEST_MAX_BYTES = 64 * 1024;
export const IDE_RELEASE_TRUTH_MAX_BYTES = 128 * 1024;
export const IDE_RELEASE_LATEST_BYTES = 2927;
export const IDE_RELEASE_TRUTH_BYTES = 4390;
export const IDE_RELEASE_LATEST_SHA256 = "077c5010c1d590424b47366c75d8af3fa3bb96e9638dc31ae5cfc43731d22900";
export const IDE_RELEASE_TRUTH_MANIFEST_SHA256 = "90172e421380e0d3dc193b8dbb9b89b5f165954afb6cd11ecc8b1b6509158413";

const TRUTH_MANIFEST_URL = "https://dhenz14.github.io/downloads/hive-ide/hive-ide-release-manifest.json";
const HISTORICAL_INSTALLER_URL = "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.5/Hive-IDE-OneClick-Windows-x64.exe";
const HISTORICAL_RELEASE_PAGE_URL = "https://github.com/Dhenz14/Dhenz14.github.io/releases/tag/hive-ide-v0.3.0-tester.5";
const HISTORICAL_MANIFEST_URL = "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.5/hive-ide-release-manifest.json";
const HISTORICAL_SHA256 = "be1795640763e99315b426757c76d655f6f07f92701d040c62f6126c1401b000";
const HISTORICAL_BYTES = 924864317;
const OBSERVED_AT = "2026-08-23T19:20:09.7630961Z";
const VALID_UNTIL = "2026-08-24T19:20:09.7630961Z";
const CLAIM_BOUNDARY = "HISTORICAL_TESTER5_REMOTE_BYTE_OBSERVATION_EXPIRED; CURRENT_PACKAGE_RETRIEVABILITY_INSTALLER_RUNTIME_PRODUCT_LIVE_UNKNOWN; ACTIVE_DOWNLOAD_AND_PUBLIC_FUNCTIONAL_TESTING_HOLD";
const REQUIRED_ACTION = "FRESH_BOUNDED_REMOTE_READBACK_AND_SEPARATE_OPERATOR_AUTHORIZATION";
const RECEIPT_PATH = "tests/fixtures/constellation_public_truth/tester5_remote_bytes_observation_v1.json";
const RECEIPT_SHA256 = "6f8890a30285200e2ce1289672b17760e202ce85978cacd18e4eac7009ea3f56";

export class IdeReleaseContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IdeReleaseContractError";
    this.code = code;
  }
}

const reject = (message, code = "IDE_RELEASE_CONTRACT_VIOLATION") => { throw new IdeReleaseContractError(code, message); };
const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) reject(`${label} fields are not exact`);
};
const exact = (value, expected, label) => { if (value !== expected) reject(`${label} drifted`); };
const exactObject = (value, expected, label) => {
  exactKeys(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) exact(value[key], expectedValue, `${label}.${key}`);
};
const rfc3339 = (value, label) => {
  if (typeof value !== "string" || !RFC3339_UTC.test(value) || !Number.isFinite(Date.parse(value))) reject(`${label} is not RFC3339 UTC`);
};
const hex = (value, pattern, label) => { if (typeof value !== "string" || !pattern.test(value)) reject(`${label} is malformed`); };
const httpsUrl = (value, expected, label) => {
  exact(value, expected, label);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) reject(`${label} is not the frozen HTTPS URL`);
};

const EFFECTIVE = Object.freeze({
  effectiveStatus: "EVIDENCE_EXPIRED_HELD",
  activeDownloadAuthorized: false,
  currentPackageStatus: "UNKNOWN",
  currentPublicRetrievability: "UNKNOWN",
  currentInstallerUrl: null,
  currentInstallerSha256: null,
  currentInstallerSizeBytes: null,
  currentRuntimeStatus: "UNKNOWN",
  currentProductLiveStatus: "UNKNOWN",
  reason: "EVIDENCE_EXPIRED_HELD",
  requires: REQUIRED_ACTION,
});

function requireEffective(value, label) {
  exactObject(value, EFFECTIVE, label);
  return value;
}

function requireReceiptCustody(value, label) {
  exactObject(value, {
    repository: "Dhenz14/Hive-AI",
    path: RECEIPT_PATH,
    sha256: RECEIPT_SHA256,
    sha256VerificationStatus: "DECLARED_NOT_REVERIFIED_IN_SITE_CUSTODY",
    bytes: null,
    gitObjectStatus: "UNKNOWN_NOT_AVAILABLE_IN_SITE_CUSTODY",
    landingCommit: null,
    landingTree: null,
    gitBlobOid: null,
    landingStatus: "UNKNOWN_NOT_VERIFIED_FROM_PUBLIC_SITE_CUSTODY",
    publicRetrievability: "PRIVATE_SOURCE_NOT_PUBLICLY_RETRIEVABLE",
  }, label);
  hex(value.sha256, HEX_64, `${label}.sha256`);
  return value;
}

function requireLatestHistorical(value) {
  exactKeys(value, ["status", "observedAtUtc", "validUntilUtc", "release", "outerExecutable", "receiptCustody", "claim"], "latest.historicalEvidence");
  exact(value.status, "HISTORICAL_EXPIRED_OBSERVATION", "latest.historicalEvidence.status");
  exact(value.observedAtUtc, OBSERVED_AT, "latest.historicalEvidence.observedAtUtc");
  exact(value.validUntilUtc, VALID_UNTIL, "latest.historicalEvidence.validUntilUtc");
  rfc3339(value.observedAtUtc, "latest.historicalEvidence.observedAtUtc");
  rfc3339(value.validUntilUtc, "latest.historicalEvidence.validUntilUtc");
  exactObject(value.release, {
    tag: "hive-ide-v0.3.0-tester.5",
    releasedAtUtc: "2026-08-07T20:00:28.000Z",
    sourceCommit: "6f7fd8a9a18c8921aa0fad1fe5b0b901bacd3383",
    embeddedHiveAiCommit: "a0fe64832edb801c9944c0923e222a64ef14e498",
  }, "latest.historicalEvidence.release");
  hex(value.release.sourceCommit, HEX_40, "latest historical sourceCommit");
  hex(value.release.embeddedHiveAiCommit, HEX_40, "latest historical embeddedHiveAiCommit");
  const outer = value.outerExecutable;
  exactObject(outer, {
    historicalUrl: HISTORICAL_INSTALLER_URL,
    sha256: HISTORICAL_SHA256,
    sizeBytes: HISTORICAL_BYTES,
    releaseId: 366980498,
    assetId: 505603161,
    observationStatus: "VERIFIED_AT_OBSERVATION_EXPIRED",
    authenticodeStatus: "NotSigned",
    publisherAuthenticated: false,
    packageContentsStatus: "UNKNOWN_NOT_INSPECTED",
    retrievabilityAtObservation: "REMOTE_ASSET_RETRIEVED_OVER_HTTPS",
  }, "latest.historicalEvidence.outerExecutable");
  httpsUrl(outer.historicalUrl, HISTORICAL_INSTALLER_URL, "latest historical installer URL");
  hex(outer.sha256, HEX_64, "latest historical installer SHA-256");
  requireReceiptCustody(value.receiptCustody, "latest.historicalEvidence.receiptCustody");
  if (typeof value.claim !== "string" || !/evidence expired/i.test(value.claim)) reject("latest historical claim must state expiry");
}

export function validateIdeReleaseLatest(value) {
  exactKeys(value, ["schema", "product", "version", "stage", "truthManifestUrl", "truthManifestSha256", "effectiveDisposition", "historicalEvidence", "claimBoundary"], "Hive IDE latest feed");
  exact(value.schema, "hive.ide.public_release_latest.v3", "latest.schema");
  exact(value.product, "Hive IDE", "latest.product");
  exact(value.version, "0.3.0", "latest.version");
  exact(value.stage, "tester", "latest.stage");
  httpsUrl(value.truthManifestUrl, TRUTH_MANIFEST_URL, "latest.truthManifestUrl");
  exact(value.truthManifestSha256, IDE_RELEASE_TRUTH_MANIFEST_SHA256, "latest.truthManifestSha256");
  hex(value.truthManifestSha256, HEX_64, "latest.truthManifestSha256");
  requireEffective(value.effectiveDisposition, "latest.effectiveDisposition");
  requireLatestHistorical(value.historicalEvidence);
  exact(value.claimBoundary, CLAIM_BOUNDARY, "latest.claimBoundary");
  return Object.freeze(value);
}

function requireTruthHistorical(value, latest) {
  exactKeys(value, ["status", "observedAtUtc", "validUntilUtc", "release", "outerExecutable", "receiptCustody", "sourceDeclarations", "historicalReleaseManifest", "claim"], "truth.historicalEvidence");
  exact(value.status, "HISTORICAL_EXPIRED_OBSERVATION", "truth historical status");
  exact(value.observedAtUtc, OBSERVED_AT, "truth historical observedAtUtc");
  exact(value.validUntilUtc, VALID_UNTIL, "truth historical validUntilUtc");
  exactObject(value.release, {
    tag: latest.historicalEvidence.release.tag,
    declaredReleasedAtUtc: latest.historicalEvidence.release.releasedAtUtc,
    githubPublishedAtUtc: "2026-08-07T20:00:40Z",
    historicalReleasePageUrl: HISTORICAL_RELEASE_PAGE_URL,
  }, "truth.historicalEvidence.release");
  httpsUrl(value.release.historicalReleasePageUrl, HISTORICAL_RELEASE_PAGE_URL, "truth historical release page");
  exactObject(value.outerExecutable, {
    name: "Hive-IDE-OneClick-Windows-x64.exe",
    historicalUrl: HISTORICAL_INSTALLER_URL,
    sizeBytes: HISTORICAL_BYTES,
    sha256: HISTORICAL_SHA256,
    releaseId: 366980498,
    assetId: 505603161,
    observationStatus: "VERIFIED_AT_OBSERVATION_EXPIRED",
    authenticodeStatus: "NotSigned",
    publisherAuthenticated: false,
    artifactExecuted: false,
    packageContentsStatus: "UNKNOWN_NOT_INSPECTED",
    retrievabilityAtObservation: "REMOTE_ASSET_RETRIEVED_OVER_HTTPS",
  }, "truth.historicalEvidence.outerExecutable");
  httpsUrl(value.outerExecutable.historicalUrl, HISTORICAL_INSTALLER_URL, "truth historical installer URL");
  requireReceiptCustody(value.receiptCustody, "truth.historicalEvidence.receiptCustody");
  if (JSON.stringify(value.receiptCustody) !== JSON.stringify(latest.historicalEvidence.receiptCustody)) {
    reject("truth receipt custody drifted from latest without a new evidence plane");
  }
  exactObject(value.sourceDeclarations, {
    status: "HISTORICAL_RELEASE_MANIFEST_DECLARATION_ONLY",
    hiveIdeCommit: latest.historicalEvidence.release.sourceCommit,
    embeddedHiveAiCommit: latest.historicalEvidence.release.embeddedHiveAiCommit,
    claim: "These release-time declarations are not current installed-runtime identities and do not prove current package contents.",
  }, "truth.historicalEvidence.sourceDeclarations");
  exactObject(value.historicalReleaseManifest, {
    url: HISTORICAL_MANIFEST_URL,
    sha256: "880df343aa2d2344f4e14547de72e0362afd5067e70d96821230b5fd46e463d9",
    status: "DECLARATION_ONLY_NOT_CURRENTLY_OBSERVED",
  }, "truth.historicalEvidence.historicalReleaseManifest");
  httpsUrl(value.historicalReleaseManifest.url, HISTORICAL_MANIFEST_URL, "truth historical manifest URL");
  if (typeof value.claim !== "string" || !/window expired/i.test(value.claim)) reject("truth historical claim must state expiry");
}

function requireClaimPlanes(value) {
  exactKeys(value, ["outerExecutableBytes", "packageContents", "installation", "runtime", "productLive", "publicFunctionalTesting"], "truth.claimPlanes");
  exactObject(value.outerExecutableBytes, { historicalStatus: "VERIFIED_AT_OBSERVATION_EXPIRED", effectiveStatus: "EVIDENCE_EXPIRED_HELD" }, "truth.claimPlanes.outerExecutableBytes");
  for (const name of ["packageContents", "installation", "runtime", "productLive"]) {
    exactObject(value[name], { effectiveStatus: "UNKNOWN" }, `truth.claimPlanes.${name}`);
  }
  exactObject(value.publicFunctionalTesting, { effectiveStatus: "HOLD" }, "truth.claimPlanes.publicFunctionalTesting");
}

export function validateIdeReleaseTruthManifest(value, latest, { now = Date.now() } = {}) {
  validateIdeReleaseLatest(latest);
  exactKeys(value, ["schema", "product", "effectiveDisposition", "historicalEvidence", "claimPlanes", "downloadDisposition", "claimBoundary"], "Hive IDE truth manifest");
  exact(value.schema, "hive.ide.public_release_truth_manifest.v3", "truth.schema");
  exactObject(value.product, { name: "Hive IDE", version: "0.3.0", platform: "windows", architecture: "x86_64" }, "truth.product");
  requireEffective(value.effectiveDisposition, "truth.effectiveDisposition");
  requireTruthHistorical(value.historicalEvidence, latest);
  requireClaimPlanes(value.claimPlanes);
  exactObject(value.downloadDisposition, { status: "HOLD", activeDownloadAuthorized: false, reason: "EVIDENCE_EXPIRED_HELD", requires: REQUIRED_ACTION }, "truth.downloadDisposition");
  exact(value.claimBoundary, CLAIM_BOUNDARY, "truth.claimBoundary");
  if (!Number.isFinite(now)) reject("truth evaluation time is invalid");
  return Object.freeze({
    manifest: value,
    evidenceCurrent: false,
    effectiveStatus: "EVIDENCE_EXPIRED_HELD",
    observedAtUtc: OBSERVED_AT,
    validUntilUtc: VALID_UNTIL,
  });
}

export function humanInstallerBytes(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return "Unavailable";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
