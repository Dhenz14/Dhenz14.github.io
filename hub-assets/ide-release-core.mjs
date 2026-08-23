const HEX_40 = /^[a-f0-9]{40}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const MAX_INSTALLER_BYTES = 2 * 1024 * 1024 * 1024;

export const IDE_RELEASE_LATEST_MAX_BYTES = 64 * 1024;
export const IDE_RELEASE_TRUTH_MAX_BYTES = 128 * 1024;
export const IDE_RELEASE_LATEST_SHA256 = "8398740abf77ea67ff5288c69ab1805f1987a5f0b0259b935d1d6cc4462e2e51";
export const IDE_RELEASE_TRUTH_MANIFEST_SHA256 = "ed4fb1fe43dc17ccc81886e2e8dfcded89b1a4e864ff05fd49247681295a18cb";

const INSTALLER_URL = "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.5/Hive-IDE-OneClick-Windows-x64.exe";
const HISTORICAL_MANIFEST_URL = "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.5/hive-ide-release-manifest.json";
const TRUTH_MANIFEST_URL = "https://dhenz14.github.io/downloads/hive-ide/hive-ide-release-manifest.json";
const RELEASE_PAGE_URL = "https://github.com/Dhenz14/Dhenz14.github.io/releases/tag/hive-ide-v0.3.0-tester.5";
const UPDATE_FEED_URL = "https://dhenz14.github.io/downloads/hive-ide/latest.json";
const INSTALLER_SHA256 = "be1795640763e99315b426757c76d655f6f07f92701d040c62f6126c1401b000";
const INSTALLER_SIZE_BYTES = 924864317;
const OBSERVED_AT = "2026-08-23T19:20:09.7630961Z";
const HASH_OBSERVED_AT = "2026-08-23T19:19:54.1841621Z";
const VALID_UNTIL = "2026-08-24T19:20:09.7630961Z";
const CLAIM_BOUNDARY = `PUBLIC_REMOTE_OUTER_EXE_BYTES_VERIFIED_UNTIL_${VALID_UNTIL}; AUTHENTICODE_NOT_SIGNED; PACKAGE_CONTENTS_INSTALLATION_RUNTIME_UNKNOWN; PRODUCT_LIVE_FALSE; PUBLIC_FUNCTIONAL_TESTING_HOLD`;
const PUBLISHER_CLAIM = "The SHA-256 identifies the observed outer EXE bytes. It is not a publisher signature, identity proof, software-safety verdict, or runtime attestation.";

const LATEST_KEYS = Object.freeze([
  "schema", "product", "version", "stage", "channel", "releaseTag", "releasedAtUtc", "sourceCommit",
  "embeddedHiveAiCommit", "installerUrl", "installerSha256", "installerSizeBytes", "historicalManifestUrl",
  "historicalManifestSha256", "truthManifestUrl", "truthManifestSha256", "outerExecutableObservation",
  "publisherAuthentication", "claimPlanes", "downloadDisposition", "claimBoundary",
]);
const OBSERVATION_KEYS = Object.freeze([
  "status", "observer", "apiObservedAtUtc", "downloadHashObservedAtUtc", "validUntilUtc", "validityPolicy",
  "method", "releaseId", "assetId", "assetState", "responseChain", "tlsVerified", "fullBodyDownloaded",
  "exactByteCountMatched", "exactSha256Matched", "rawHttpRetained", "independentlySigned", "evidenceRef",
  "evidenceReceiptSchema", "evidenceReceiptId", "evidenceReceiptBytes", "evidenceReceiptSha256",
  "evidenceReceiptSelfZeroSha256", "evidenceReceiptGitBlobOid", "evidenceReceiptAvailability",
]);
const PUBLISHER_KEYS = Object.freeze([
  "status", "publisherAuthenticated", "authenticodeStatus", "signerCertificate", "timestampCertificate",
  "observedAtUtc", "validUntilUtc", "evidenceRef", "smartScreenWarningExpected", "claim",
]);
const LATEST_CLAIM_PLANE_KEYS = Object.freeze(["status", "observedAtUtc", "validUntilUtc", "evidenceRef"]);
const TRUTH_CLAIM_PLANE_KEYS = Object.freeze([...LATEST_CLAIM_PLANE_KEYS, "claim"]);
const CLAIM_PLANE_NAMES = Object.freeze([
  "outerExecutableBytes", "packageContents", "installation", "runtime", "productLive", "publicFunctionalTesting",
]);
const LATEST_DOWNLOAD_KEYS = Object.freeze(["status", "activeDownloadAuthorized", "reason", "requires"]);
const TRUTH_DOWNLOAD_KEYS = Object.freeze([...LATEST_DOWNLOAD_KEYS, "claim"]);

function requireExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are not exact`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`${label} must be a canonical non-empty string`);
  }
  return value;
}

function requireExact(value, expected, label) {
  if (value !== expected) throw new Error(`${label} is not the frozen release value`);
  return value;
}

function requireHex(value, pattern, label) {
  const canonical = requireString(value, label);
  if (!pattern.test(canonical)) throw new Error(`${label} is malformed`);
  return canonical;
}

function requireRfc3339Utc(value, label) {
  const canonical = requireString(value, label);
  if (!RFC3339_UTC.test(canonical) || !Number.isFinite(Date.parse(canonical))) throw new Error(`${label} is not RFC3339 UTC`);
  return canonical;
}

function requireNullableUtc(value, expected, label) {
  if (expected === null) {
    if (value !== null) throw new Error(`${label} must remain null`);
    return null;
  }
  requireExact(value, expected, label);
  return requireRfc3339Utc(value, label);
}

function requireHttpsUrl(value, expected, label) {
  requireExact(value, expected, label);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
    throw new Error(`${label} escaped the frozen HTTPS origin/path`);
  }
  return parsed.href;
}

function requireObservation(value, label) {
  requireExactKeys(value, OBSERVATION_KEYS, label);
  const exact = {
    status: "PUBLIC_REMOTE_BYTES_VERIFIED",
    observer: "independent-public-artifact-verifier",
    apiObservedAtUtc: OBSERVED_AT,
    downloadHashObservedAtUtc: HASH_OBSERVED_AT,
    validUntilUtc: VALID_UNTIL,
    validityPolicy: "24_HOURS_FROM_API_READBACK",
    method: "GITHUB_RELEASE_API_PLUS_FULL_BODY_DOWNLOAD_BYTE_COUNT_AND_SHA256",
    releaseId: 366980498,
    assetId: 505603161,
    assetState: "uploaded",
    responseChain: "302_TO_200",
    tlsVerified: true,
    fullBodyDownloaded: true,
    exactByteCountMatched: true,
    exactSha256Matched: true,
    rawHttpRetained: false,
    independentlySigned: false,
    evidenceRef: "Dhenz14/Hive-AI:tests/fixtures/constellation_public_truth/tester5_remote_bytes_observation_v1.json",
    evidenceReceiptSchema: "hiveai.public_artifact_remote_bytes_observation.v1",
    evidenceReceiptId: "tester5-remote-bytes-20260823T192009Z",
    evidenceReceiptBytes: 3026,
    evidenceReceiptSha256: "6f8890a30285200e2ce1289672b17760e202ce85978cacd18e4eac7009ea3f56",
    evidenceReceiptSelfZeroSha256: "8bf78ee21940a064daf51a621ecca7a4bbb9431f5cf7292a29b233a40f3da15b",
    evidenceReceiptGitBlobOid: "3703036fc42ab35413462ff343b5357a7dae9f05",
    evidenceReceiptAvailability: "SOURCE_CANDIDATE_NOT_LANDED",
  };
  for (const [key, expected] of Object.entries(exact)) requireExact(value[key], expected, `${label}.${key}`);
  requireRfc3339Utc(value.apiObservedAtUtc, `${label}.apiObservedAtUtc`);
  requireRfc3339Utc(value.downloadHashObservedAtUtc, `${label}.downloadHashObservedAtUtc`);
  requireRfc3339Utc(value.validUntilUtc, `${label}.validUntilUtc`);
  requireHex(value.evidenceReceiptSha256, HEX_64, `${label}.evidenceReceiptSha256`);
  requireHex(value.evidenceReceiptSelfZeroSha256, HEX_64, `${label}.evidenceReceiptSelfZeroSha256`);
  requireHex(value.evidenceReceiptGitBlobOid, HEX_40, `${label}.evidenceReceiptGitBlobOid`);
  if (Date.parse(value.downloadHashObservedAtUtc) > Date.parse(value.apiObservedAtUtc) || Date.parse(value.apiObservedAtUtc) >= Date.parse(value.validUntilUtc)) {
    throw new Error(`${label} evidence clock is invalid`);
  }
  return value;
}

function requirePublisher(value, label, { smartScreenKey }) {
  const expectedKeys = smartScreenKey ? PUBLISHER_KEYS : PUBLISHER_KEYS.filter((key) => key !== "smartScreenWarningExpected");
  requireExactKeys(value, expectedKeys, label);
  const exact = {
    status: "NOT_SIGNED",
    publisherAuthenticated: false,
    authenticodeStatus: "NotSigned",
    signerCertificate: null,
    timestampCertificate: null,
    observedAtUtc: OBSERVED_AT,
    validUntilUtc: VALID_UNTIL,
    claim: PUBLISHER_CLAIM,
  };
  for (const [key, expected] of Object.entries(exact)) requireExact(value[key], expected, `${label}.${key}`);
  requireRfc3339Utc(value.observedAtUtc, `${label}.observedAtUtc`);
  requireRfc3339Utc(value.validUntilUtc, `${label}.validUntilUtc`);
  requireExact(value.evidenceRef, smartScreenKey ? "outerExecutableObservation.evidenceReceiptSha256" : "outerExecutable.observation.evidenceReceiptSha256", `${label}.evidenceRef`);
  if (smartScreenKey) requireExact(value.smartScreenWarningExpected, true, `${label}.smartScreenWarningExpected`);
  return value;
}

function requireClaimPlanes(value, label, { withClaims }) {
  requireExactKeys(value, CLAIM_PLANE_NAMES, label);
  const keys = withClaims ? TRUTH_CLAIM_PLANE_KEYS : LATEST_CLAIM_PLANE_KEYS;
  const expected = {
    outerExecutableBytes: ["VERIFIED", OBSERVED_AT, VALID_UNTIL],
    packageContents: ["UNKNOWN", null, null],
    installation: ["UNKNOWN", null, null],
    runtime: ["UNKNOWN", null, null],
    productLive: ["FALSE", null, null],
    publicFunctionalTesting: ["HOLD", OBSERVED_AT, VALID_UNTIL],
  };
  const latestRefs = {
    outerExecutableBytes: "outerExecutableObservation",
    packageContents: "truthManifestUrl#historicalBuildDeclarations",
    installation: "truthManifestUrl#claimPlanes.installation",
    runtime: "truthManifestUrl#claimPlanes.runtime",
    productLive: "truthManifestUrl#claimPlanes.productLive",
    publicFunctionalTesting: "truthManifestUrl#claimPlanes.publicFunctionalTesting",
  };
  const truthRefs = {
    outerExecutableBytes: "outerExecutable.observation",
    packageContents: "historicalBuildDeclarations",
    installation: "historicalBuildDeclarations",
    runtime: "historicalBuildDeclarations",
    productLive: "claimPlanes.runtime",
    publicFunctionalTesting: "outerExecutable.observation + outerExecutable.publisherAuthentication + claimPlanes.runtime",
  };
  const truthClaims = {
    outerExecutableBytes: "Only the remote outer EXE byte count and SHA-256 are verified.",
    packageContents: "The outer EXE was not opened or inventoried in the current observation.",
    installation: "The installer was not executed and no current installed-state receipt exists.",
    runtime: "No current process, listener, behavior, restart, rollback, or operator-control attestation exists.",
    productLive: "No product-live claim is authorized without current installed-runtime and observed-behavior evidence.",
    publicFunctionalTesting: "Verified unsigned outer bytes alone do not authorize public functional testing.",
  };
  for (const name of CLAIM_PLANE_NAMES) {
    const plane = value[name];
    requireExactKeys(plane, keys, `${label}.${name}`);
    requireExact(plane.status, expected[name][0], `${label}.${name}.status`);
    requireNullableUtc(plane.observedAtUtc, expected[name][1], `${label}.${name}.observedAtUtc`);
    requireNullableUtc(plane.validUntilUtc, expected[name][2], `${label}.${name}.validUntilUtc`);
    requireExact(plane.evidenceRef, (withClaims ? truthRefs : latestRefs)[name], `${label}.${name}.evidenceRef`);
    if (withClaims) requireExact(plane.claim, truthClaims[name], `${label}.${name}.claim`);
  }
  return value;
}

function requireDownloadDisposition(value, label, { withClaim }) {
  requireExactKeys(value, withClaim ? TRUTH_DOWNLOAD_KEYS : LATEST_DOWNLOAD_KEYS, label);
  requireExact(value.status, "HOLD", `${label}.status`);
  requireExact(value.activeDownloadAuthorized, false, `${label}.activeDownloadAuthorized`);
  requireExact(value.reason, "UNSIGNED_AND_INSTALL_RUNTIME_UNVERIFIED", `${label}.reason`);
  requireExact(value.requires, "SEPARATE_UNEXPIRED_OPERATOR_AUTHORIZATION", `${label}.requires`);
  if (withClaim) requireExact(value.claim, "Evidence may be shown, but this truth contract does not authorize an active download action.", `${label}.claim`);
  return value;
}

export function validateIdeReleaseLatest(value) {
  requireExactKeys(value, LATEST_KEYS, "Hive IDE latest feed");
  const exact = {
    schema: "hive.ide.public_release_latest.v2",
    product: "Hive IDE",
    version: "0.3.0",
    stage: "tester",
    channel: "unsigned-public-tester",
    releaseTag: "hive-ide-v0.3.0-tester.5",
    releasedAtUtc: "2026-08-07T20:00:28.000Z",
    sourceCommit: "6f7fd8a9a18c8921aa0fad1fe5b0b901bacd3383",
    embeddedHiveAiCommit: "a0fe64832edb801c9944c0923e222a64ef14e498",
    installerSha256: INSTALLER_SHA256,
    installerSizeBytes: INSTALLER_SIZE_BYTES,
    historicalManifestSha256: "880df343aa2d2344f4e14547de72e0362afd5067e70d96821230b5fd46e463d9",
    truthManifestSha256: IDE_RELEASE_TRUTH_MANIFEST_SHA256,
    claimBoundary: CLAIM_BOUNDARY,
  };
  for (const [key, expected] of Object.entries(exact)) requireExact(value[key], expected, `latest.${key}`);
  requireRfc3339Utc(value.releasedAtUtc, "latest.releasedAtUtc");
  requireHex(value.sourceCommit, HEX_40, "latest.sourceCommit");
  requireHex(value.embeddedHiveAiCommit, HEX_40, "latest.embeddedHiveAiCommit");
  requireHex(value.installerSha256, HEX_64, "latest.installerSha256");
  requireHex(value.historicalManifestSha256, HEX_64, "latest.historicalManifestSha256");
  requireHex(value.truthManifestSha256, HEX_64, "latest.truthManifestSha256");
  requireHttpsUrl(value.installerUrl, INSTALLER_URL, "latest.installerUrl");
  requireHttpsUrl(value.historicalManifestUrl, HISTORICAL_MANIFEST_URL, "latest.historicalManifestUrl");
  requireHttpsUrl(value.truthManifestUrl, TRUTH_MANIFEST_URL, "latest.truthManifestUrl");
  if (!Number.isSafeInteger(value.installerSizeBytes) || value.installerSizeBytes <= 0 || value.installerSizeBytes > MAX_INSTALLER_BYTES) {
    throw new Error("latest.installerSizeBytes is outside the bounded package range");
  }
  requireObservation(value.outerExecutableObservation, "latest.outerExecutableObservation");
  requirePublisher(value.publisherAuthentication, "latest.publisherAuthentication", { smartScreenKey: true });
  requireClaimPlanes(value.claimPlanes, "latest.claimPlanes", { withClaims: false });
  requireDownloadDisposition(value.downloadDisposition, "latest.downloadDisposition", { withClaim: false });
  return Object.freeze(value);
}

export function validateIdeReleaseTruthManifest(value, latest, { now = Date.now() } = {}) {
  validateIdeReleaseLatest(latest);
  requireExactKeys(value, [
    "schema", "product", "release", "historicalReleaseManifest", "outerExecutable", "sourceDeclarations",
    "historicalBuildDeclarations", "claimPlanes", "downloadDisposition", "testerPolicy", "claimBoundary",
  ], "Hive IDE truth manifest");
  requireExact(value.schema, "hive.ide.public_release_truth_manifest.v2", "truth.schema");
  requireExact(value.claimBoundary, CLAIM_BOUNDARY, "truth.claimBoundary");

  requireExactKeys(value.product, ["name", "version", "platform", "architecture", "installerType", "profile"], "truth.product");
  const product = { name: "Hive IDE", version: "0.3.0", platform: "windows", architecture: "x86_64", installerType: "nsis-current-user", profile: "tester-complete-internal-option-c" };
  for (const [key, expected] of Object.entries(product)) requireExact(value.product[key], expected, `truth.product.${key}`);

  requireExactKeys(value.release, ["tag", "stage", "channel", "repository", "declaredReleasedAtUtc", "githubPublishedAtUtc", "releasePageUrl", "updateFeedUrl", "installerUrl"], "truth.release");
  const release = {
    tag: latest.releaseTag, stage: latest.stage, channel: latest.channel, repository: "Dhenz14/Dhenz14.github.io",
    declaredReleasedAtUtc: latest.releasedAtUtc, githubPublishedAtUtc: "2026-08-07T20:00:40Z",
    releasePageUrl: RELEASE_PAGE_URL, updateFeedUrl: UPDATE_FEED_URL, installerUrl: latest.installerUrl,
  };
  for (const [key, expected] of Object.entries(release)) requireExact(value.release[key], expected, `truth.release.${key}`);
  requireRfc3339Utc(value.release.declaredReleasedAtUtc, "truth.release.declaredReleasedAtUtc");
  requireRfc3339Utc(value.release.githubPublishedAtUtc, "truth.release.githubPublishedAtUtc");
  requireHttpsUrl(value.release.releasePageUrl, RELEASE_PAGE_URL, "truth.release.releasePageUrl");
  requireHttpsUrl(value.release.updateFeedUrl, UPDATE_FEED_URL, "truth.release.updateFeedUrl");
  requireHttpsUrl(value.release.installerUrl, INSTALLER_URL, "truth.release.installerUrl");

  requireExactKeys(value.historicalReleaseManifest, ["status", "url", "assetId", "sizeBytes", "sha256", "claim"], "truth.historicalReleaseManifest");
  const historical = {
    status: "HISTORICAL_RELEASE_DECLARATION_ONLY", url: HISTORICAL_MANIFEST_URL, assetId: 505602951, sizeBytes: 3528,
    sha256: latest.historicalManifestSha256,
    claim: "This immutable v1 document records release-time declarations. Its fields do not prove current package contents, installation, runtime behavior, or product-live status.",
  };
  for (const [key, expected] of Object.entries(historical)) requireExact(value.historicalReleaseManifest[key], expected, `truth.historicalReleaseManifest.${key}`);

  requireExactKeys(value.outerExecutable, ["name", "url", "sizeBytes", "sha256", "observation", "publisherAuthentication"], "truth.outerExecutable");
  requireExact(value.outerExecutable.name, "Hive-IDE-OneClick-Windows-x64.exe", "truth.outerExecutable.name");
  requireExact(value.outerExecutable.url, latest.installerUrl, "truth.outerExecutable.url");
  requireExact(value.outerExecutable.sizeBytes, latest.installerSizeBytes, "truth.outerExecutable.sizeBytes");
  requireExact(value.outerExecutable.sha256, latest.installerSha256, "truth.outerExecutable.sha256");
  requireObservation(value.outerExecutable.observation, "truth.outerExecutable.observation");
  requirePublisher(value.outerExecutable.publisherAuthentication, "truth.outerExecutable.publisherAuthentication", { smartScreenKey: false });

  requireExactKeys(value.sourceDeclarations, ["status", "hiveIde", "hiveAi", "hivePoAInternalSidecar", "claim"], "truth.sourceDeclarations");
  requireExact(value.sourceDeclarations.status, "HISTORICAL_RELEASE_MANIFEST_DECLARATION_ONLY", "truth.sourceDeclarations.status");
  requireExactKeys(value.sourceDeclarations.hiveIde, ["commit", "tree"], "truth.sourceDeclarations.hiveIde");
  requireExact(value.sourceDeclarations.hiveIde.commit, latest.sourceCommit, "truth.sourceDeclarations.hiveIde.commit");
  requireExact(value.sourceDeclarations.hiveIde.tree, "0c107f9fc6c788ab4aeb8a68092e52dfbf0e14cb", "truth.sourceDeclarations.hiveIde.tree");
  requireExactKeys(value.sourceDeclarations.hiveAi, ["commit", "tree"], "truth.sourceDeclarations.hiveAi");
  requireExact(value.sourceDeclarations.hiveAi.commit, latest.embeddedHiveAiCommit, "truth.sourceDeclarations.hiveAi.commit");
  requireExact(value.sourceDeclarations.hiveAi.tree, "c50fc59c1d4467984e279e0382768a82b705eb81", "truth.sourceDeclarations.hiveAi.tree");
  requireExactKeys(value.sourceDeclarations.hivePoAInternalSidecar, ["commit", "tree", "ref", "version", "artifactSha256", "checksumReceiptSha256", "publicHivePoAReleaseClaimed"], "truth.sourceDeclarations.hivePoAInternalSidecar");
  const sidecar = {
    commit: "24a3a39d830545d600ac4956a0ea9a92f939fe2c", tree: "fc264cc28edb485fcc6a786c484961c486e7693e",
    ref: "24a3a39d830545d600ac4956a0ea9a92f939fe2c", version: "2.0.1",
    artifactSha256: "fdf630831c83625ff5647e21814c810892f01c9ef567e7f653f18ef3b1e7a840",
    checksumReceiptSha256: "fa4f47cfbcdb998db402d2173cf2b6d487de38f25a223dfe692cde114820beb9",
    publicHivePoAReleaseClaimed: false,
  };
  for (const [key, expected] of Object.entries(sidecar)) requireExact(value.sourceDeclarations.hivePoAInternalSidecar[key], expected, `truth.sourceDeclarations.hivePoAInternalSidecar.${key}`);
  requireExact(value.sourceDeclarations.claim, "These are release-time source declarations from the historical v1 manifest. They are not current installed-runtime identities.", "truth.sourceDeclarations.claim");

  requireExactKeys(value.historicalBuildDeclarations, [
    "status", "declaredAtUtc", "currentObservationValidUntilUtc", "evidenceRef", "innerApplicationExpectedByProvenance",
    "runtimeManifestDeclared", "payloadReceiptDeclared", "installerProvenanceReceiptDeclared", "sourceWorktrees",
    "offlineBundledDependencies", "wslBootstrap", "claim",
  ], "truth.historicalBuildDeclarations");
  const build = value.historicalBuildDeclarations;
  requireExact(build.status, "DECLARATION_ONLY_NOT_CURRENTLY_OBSERVED", "truth.historicalBuildDeclarations.status");
  requireExact(build.declaredAtUtc, latest.releasedAtUtc, "truth.historicalBuildDeclarations.declaredAtUtc");
  requireExact(build.currentObservationValidUntilUtc, null, "truth.historicalBuildDeclarations.currentObservationValidUntilUtc");
  requireExact(build.evidenceRef, "historicalReleaseManifest", "truth.historicalBuildDeclarations.evidenceRef");
  const declaredArtifacts = {
    innerApplicationExpectedByProvenance: ["hive-workbench-v2.exe", 20375040, "1001ba35c6dfb51cb4c7253c021e7be3272c3d4e672a45deb8b5d9359b8f7097"],
    runtimeManifestDeclared: ["runtime-manifest.json", 47543, "47d5b81e9121ceaba86d9419ae312bdef5000f6297e571a62ba46af4bc8fe756"],
    payloadReceiptDeclared: ["oneclick-payload-receipt.json", 3041, "c6e161e71a7fe8c808bc5bb583296f7d8bea9a656cb5e322f51337ef7c1fbf33"],
    installerProvenanceReceiptDeclared: ["windows-installer-provenance.json", 4733, "217206519fd8fbbf6ff0efbc005a20b549d3e36016850d09750ba933c6f2ea4d"],
  };
  for (const [key, [name, sizeBytes, sha256]] of Object.entries(declaredArtifacts)) {
    requireExactKeys(build[key], ["name", "sizeBytes", "sha256"], `truth.historicalBuildDeclarations.${key}`);
    requireExact(build[key].name, name, `truth.historicalBuildDeclarations.${key}.name`);
    requireExact(build[key].sizeBytes, sizeBytes, `truth.historicalBuildDeclarations.${key}.sizeBytes`);
    requireExact(build[key].sha256, sha256, `truth.historicalBuildDeclarations.${key}.sha256`);
  }
  requireExact(build.sourceWorktrees, "DECLARED_CLEAN_NOT_CURRENTLY_RECHECKED", "truth.historicalBuildDeclarations.sourceWorktrees");
  requireExact(build.offlineBundledDependencies, "DECLARED_PRESENT_NOT_CURRENTLY_INSPECTED", "truth.historicalBuildDeclarations.offlineBundledDependencies");
  requireExact(build.wslBootstrap, "DECLARED_MAY_REQUIRE_WINDOWS_MANAGED_NETWORK", "truth.historicalBuildDeclarations.wslBootstrap");
  requireExact(build.claim, "No current review opened the installer, inspected its payload, installed it, or executed it. These historical declarations cannot upgrade the current UNKNOWN planes.", "truth.historicalBuildDeclarations.claim");

  requireClaimPlanes(value.claimPlanes, "truth.claimPlanes", { withClaims: true });
  requireDownloadDisposition(value.downloadDisposition, "truth.downloadDisposition", { withClaim: true });
  requireExactKeys(value.testerPolicy, ["publicFunctionalTesting", "signedPublicRelease", "smartScreenWarningExpected", "testCreditsHaveMonetaryValue", "testCreditsTransferable", "testCreditsRedeemable", "evidenceRef"], "truth.testerPolicy");
  const testerPolicy = {
    publicFunctionalTesting: "HOLD", signedPublicRelease: false, smartScreenWarningExpected: true,
    testCreditsHaveMonetaryValue: false, testCreditsTransferable: false, testCreditsRedeemable: false,
    evidenceRef: "outerExecutable.publisherAuthentication + claimPlanes.publicFunctionalTesting",
  };
  for (const [key, expected] of Object.entries(testerPolicy)) requireExact(value.testerPolicy[key], expected, `truth.testerPolicy.${key}`);

  const observed = Date.parse(value.outerExecutable.observation.apiObservedAtUtc);
  const validUntil = Date.parse(value.outerExecutable.observation.validUntilUtc);
  const evidenceCurrent = Number.isFinite(now) && now >= observed && now < validUntil;
  return Object.freeze({ manifest: value, evidenceCurrent, observedAtUtc: value.outerExecutable.observation.apiObservedAtUtc, validUntilUtc: value.outerExecutable.observation.validUntilUtc });
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
