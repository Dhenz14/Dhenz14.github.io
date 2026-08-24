import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  IDE_RELEASE_LATEST_MAX_BYTES,
  IDE_RELEASE_LATEST_SHA256,
  IDE_RELEASE_TRUTH_MANIFEST_SHA256,
  IDE_RELEASE_TRUTH_MAX_BYTES,
  IdeReleaseContractError,
  validateIdeReleaseLatest,
  validateIdeReleaseTruthManifest,
} from "../hub-assets/ide-release-core.mjs";
import { parseJsonBytesStrict, parseJsonStrict, StrictJsonError } from "../hub-assets/strict-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feedPath = path.join(root, "downloads", "hive-ide", "latest.json");
const manifestPath = path.join(root, "downloads", "hive-ide", "hive-ide-release-manifest.json");
const LATEST_BYTES = 4812;
const TRUTH_MANIFEST_BYTES = 8957;
const LATEST_GIT_BLOB = "493300e1f5b6848af1c3163b1228a062b859b2f8";
const TRUTH_MANIFEST_GIT_BLOB = "db07ae1a613a37d57cab957b36b7e461c1e2c97c";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobOid(bytes) {
  return crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function readPublishedSources() {
  assert(fs.existsSync(feedPath) && fs.existsSync(manifestPath), "Hive IDE v2 feed and truth manifest must both be published");
  const feedBytes = fs.readFileSync(feedPath);
  const manifestBytes = fs.readFileSync(manifestPath);
  assert(feedBytes.length <= IDE_RELEASE_LATEST_MAX_BYTES && manifestBytes.length <= IDE_RELEASE_TRUTH_MAX_BYTES, "Hive IDE v2 documents exceed browser byte ceilings");
  assert(feedBytes.length === LATEST_BYTES && sha256(feedBytes) === IDE_RELEASE_LATEST_SHA256 && gitBlobOid(feedBytes) === LATEST_GIT_BLOB, "Hive IDE latest v2 physical identity drifted");
  assert(manifestBytes.length === TRUTH_MANIFEST_BYTES
    && sha256(manifestBytes) === IDE_RELEASE_TRUTH_MANIFEST_SHA256
    && gitBlobOid(manifestBytes) === TRUTH_MANIFEST_GIT_BLOB, "Hive IDE truth manifest v2 physical identity drifted");
  const feedSource = feedBytes.toString("utf8");
  const manifestSource = manifestBytes.toString("utf8");
  return {
    feedBytes,
    manifestBytes,
    feedSource,
    manifestSource,
    latest: parseJsonBytesStrict(feedBytes, "Hive IDE latest v2 feed"),
    manifest: parseJsonBytesStrict(manifestBytes, "Hive IDE truth manifest v2"),
  };
}

function validatePair(latest, manifest, now) {
  const validatedLatest = validateIdeReleaseLatest(latest);
  assert(validatedLatest.truthManifestSha256 === IDE_RELEASE_TRUTH_MANIFEST_SHA256, "latest v2 no longer binds the frozen truth-manifest digest");
  return validateIdeReleaseTruthManifest(manifest, validatedLatest, { now });
}

function expectLatestReject(label, fixtures, mutation) {
  const latest = structuredClone(fixtures.latest);
  mutation(latest);
  try {
    validateIdeReleaseLatest(latest);
  } catch (error) {
    return { label, passed: error instanceof IdeReleaseContractError && error.code === "IDE_RELEASE_CONTRACT_VIOLATION", observedCode: error?.code ?? error?.name };
  }
  return { label, passed: false };
}

function expectPairReject(label, fixtures, mutation) {
  const latest = structuredClone(fixtures.latest);
  const manifest = structuredClone(fixtures.manifest);
  mutation(latest, manifest);
  try {
    validatePair(latest, manifest, Date.parse(fixtures.latest.outerExecutableObservation.apiObservedAtUtc) + 1);
  } catch (error) {
    return { label, passed: error instanceof IdeReleaseContractError && error.code === "IDE_RELEASE_CONTRACT_VIOLATION", observedCode: error?.code ?? error?.name };
  }
  return { label, passed: false };
}

function expectStrictJsonReject(label, source, expectedCode) {
  try {
    parseJsonStrict(source, label);
  } catch (error) {
    return { label, passed: error instanceof StrictJsonError && error.code === expectedCode, observedCode: error?.code ?? error?.name };
  }
  return { label, passed: false };
}

function selfTest() {
  const fixtures = readPublishedSources();
  const observedAt = Date.parse(fixtures.latest.outerExecutableObservation.apiObservedAtUtc);
  const validUntil = Date.parse(fixtures.latest.outerExecutableObservation.validUntilUtc);
  const admitted = validatePair(fixtures.latest, fixtures.manifest, observedAt + 1);
  assert(admitted.evidenceCurrent === true, "frozen within-window Hive IDE observation was not admitted");
  const exactExpiry = validatePair(fixtures.latest, fixtures.manifest, validUntil);
  const beforeObservation = validatePair(fixtures.latest, fixtures.manifest, observedAt - 1);

  const tests = [
    { label: "valid_frozen_v2_pair", passed: true },
    { label: "exact_expiry_is_held", passed: exactExpiry.evidenceCurrent === false },
    { label: "future_observation_is_held", passed: beforeObservation.evidenceCurrent === false },
    { label: "raw_latest_byte_tamper_refused", passed: sha256(Buffer.from(`${fixtures.feedSource} `, "utf8")) !== IDE_RELEASE_LATEST_SHA256 },
    { label: "raw_truth_manifest_byte_tamper_refused", passed: sha256(Buffer.from(`${fixtures.manifestSource} `, "utf8")) !== IDE_RELEASE_TRUTH_MANIFEST_SHA256 },
    expectLatestReject("latest_unknown_root_field_refused", fixtures, (value) => { value.untrusted = true; }),
    expectLatestReject("latest_missing_root_field_refused", fixtures, (value) => { delete value.schema; }),
    expectLatestReject("observation_unknown_nested_field_refused", fixtures, (value) => { value.outerExecutableObservation.authority = "self-attested"; }),
    expectPairReject("truth_unknown_root_field_refused", fixtures, (_latest, manifest) => { manifest.untrusted = true; }),
    expectPairReject("truth_unknown_nested_field_refused", fixtures, (_latest, manifest) => { manifest.outerExecutable.observation.authority = "self-attested"; }),
    expectLatestReject("http_installer_refused", fixtures, (value) => { value.installerUrl = value.installerUrl.replace("https:", "http:"); }),
    expectLatestReject("alternate_installer_host_refused", fixtures, (value) => { value.installerUrl = value.installerUrl.replace("github.com", "example.com"); }),
    expectLatestReject("tester6_promotion_refused", fixtures, (value) => { value.releaseTag = "hive-ide-v0.3.0-tester.6"; }),
    expectLatestReject("installer_byte_count_mismatch_refused", fixtures, (value) => { value.installerSizeBytes += 1; }),
    expectLatestReject("installer_digest_mismatch_refused", fixtures, (value) => { value.installerSha256 = "0".repeat(64); }),
    expectLatestReject("truth_manifest_digest_mismatch_refused", fixtures, (value) => { value.truthManifestSha256 = "0".repeat(64); }),
    expectLatestReject("receipt_byte_count_mismatch_refused", fixtures, (value) => { value.outerExecutableObservation.evidenceReceiptBytes += 1; }),
    expectLatestReject("receipt_physical_digest_mismatch_refused", fixtures, (value) => { value.outerExecutableObservation.evidenceReceiptSha256 = "0".repeat(64); }),
    expectLatestReject("receipt_self_zero_digest_mismatch_refused", fixtures, (value) => { value.outerExecutableObservation.evidenceReceiptSelfZeroSha256 = "0".repeat(64); }),
    expectLatestReject("receipt_git_blob_mismatch_refused", fixtures, (value) => { value.outerExecutableObservation.evidenceReceiptGitBlobOid = "0".repeat(40); }),
    expectLatestReject("receipt_landing_downgrade_refused", fixtures, (value) => { value.outerExecutableObservation.landingStatus = "SOURCE_CANDIDATE_NOT_LANDED"; }),
    expectLatestReject("receipt_public_retrievability_promotion_refused", fixtures, (value) => { value.outerExecutableObservation.publicRetrievability = "PUBLICLY_RETRIEVABLE"; }),
    expectLatestReject("observation_future_rewrite_refused", fixtures, (value) => { value.outerExecutableObservation.apiObservedAtUtc = "2027-08-23T19:20:09Z"; }),
    expectLatestReject("observation_inverted_window_refused", fixtures, (value) => { value.outerExecutableObservation.validUntilUtc = value.outerExecutableObservation.downloadHashObservedAtUtc; }),
    expectLatestReject("raw_http_retention_promotion_refused", fixtures, (value) => { value.outerExecutableObservation.rawHttpRetained = true; }),
    expectLatestReject("receipt_signature_promotion_refused", fixtures, (value) => { value.outerExecutableObservation.independentlySigned = true; }),
    expectLatestReject("authenticode_status_promotion_refused", fixtures, (value) => { value.publisherAuthentication.authenticodeStatus = "Valid"; }),
    expectLatestReject("publisher_authentication_promotion_refused", fixtures, (value) => { value.publisherAuthentication.publisherAuthenticated = true; }),
    expectLatestReject("signer_certificate_invention_refused", fixtures, (value) => { value.publisherAuthentication.signerCertificate = "CN=Hive"; }),
    expectLatestReject("digest_as_signature_claim_refused", fixtures, (value) => { value.publisherAuthentication.claim = "The SHA-256 proves publisher identity and authenticity."; }),
    expectLatestReject("package_contents_promotion_refused", fixtures, (value) => { value.claimPlanes.packageContents.status = "VERIFIED"; }),
    expectLatestReject("installation_promotion_refused", fixtures, (value) => { value.claimPlanes.installation.status = "VERIFIED"; }),
    expectLatestReject("runtime_promotion_refused", fixtures, (value) => { value.claimPlanes.runtime.status = "VERIFIED"; }),
    expectLatestReject("product_live_promotion_refused", fixtures, (value) => { value.claimPlanes.productLive.status = "TRUE"; }),
    expectLatestReject("functional_testing_promotion_refused", fixtures, (value) => { value.claimPlanes.publicFunctionalTesting.status = "PASS"; }),
    expectLatestReject("download_authorization_promotion_refused", fixtures, (value) => { value.downloadDisposition.activeDownloadAuthorized = true; }),
    expectLatestReject("download_disposition_promotion_refused", fixtures, (value) => { value.downloadDisposition.status = "AUTHORIZED"; }),
    expectLatestReject("v1_readiness_field_refused", fixtures, (value) => { value.readyForPublicFunctionalTesting = true; }),
    expectPairReject("latest_truth_observation_divergence_refused", fixtures, (_latest, manifest) => { manifest.outerExecutable.observation.evidenceReceiptBytes += 1; }),
    expectPairReject("latest_truth_release_tag_divergence_refused", fixtures, (_latest, manifest) => { manifest.release.tag = "hive-ide-v0.3.0-tester.6"; }),
    expectPairReject("latest_truth_source_divergence_refused", fixtures, (_latest, manifest) => { manifest.sourceDeclarations.hiveAi.commit = "0".repeat(40); }),
    expectPairReject("historical_clean_worktree_promotion_refused", fixtures, (_latest, manifest) => { manifest.historicalBuildDeclarations.sourceWorktrees = true; }),
    expectPairReject("historical_offline_bundle_promotion_refused", fixtures, (_latest, manifest) => { manifest.historicalBuildDeclarations.offlineBundledDependencies = true; }),
    expectPairReject("installed_application_field_refused", fixtures, (_latest, manifest) => { manifest.historicalBuildDeclarations.installedApplication = true; }),
    expectStrictJsonReject("duplicate_root_json_key_refused", '{"schema":"first","schema":"second"}', "JSON_DUPLICATE_KEY"),
    expectStrictJsonReject("duplicate_nested_json_key_refused", '{"outerExecutableObservation":{"status":"first","status":"second"}}', "JSON_DUPLICATE_KEY"),
    expectStrictJsonReject("non_finite_json_number_refused", '{"installerSizeBytes":1e999}', "JSON_NON_FINITE_NUMBER"),
    expectStrictJsonReject("malformed_json_refused", '{"schema":', "JSON_MISSING_VALUE"),
    expectStrictJsonReject("invalid_utf8_replacement_refused", '{"schema":"\uFFFD"}', "JSON_INVALID_UTF8"),
    expectStrictJsonReject("bom_refused", "\uFEFF{}", "JSON_BOM_FORBIDDEN"),
    expectStrictJsonReject("unpaired_surrogate_refused", '{"x":"\\ud800"}', "JSON_UNPAIRED_SURROGATE"),
    expectStrictJsonReject("normalization_collision_refused", '{"é":1,"e\\u0301":2}', "JSON_NORMALIZATION_COLLISION"),
    expectStrictJsonReject("non_rfc8259_whitespace_refused", '{\u00a0"x":1}', "JSON_EXPECTED_STRING"),
  ];
  const ok = tests.every((test) => test.passed);
  console.log(JSON.stringify({ schema: "hive.ide.public_hub_release_self_test.v2", ok, testCount: tests.length, tests }, null, 2));
  if (!ok) process.exitCode = 1;
}

function validatePublishedFeed(trustedNow = Date.now()) {
  const fixtures = readPublishedSources();
  const admitted = validatePair(fixtures.latest, fixtures.manifest, trustedNow);
  assert(fixtures.latest.truthManifestSha256 === sha256(fixtures.manifestBytes), "latest v2 does not bind the exact local truth-manifest bytes");
  assert(fixtures.latest.downloadDisposition.status === "HOLD"
    && fixtures.latest.downloadDisposition.activeDownloadAuthorized === false
    && fixtures.latest.claimPlanes.packageContents.status === "UNKNOWN"
    && fixtures.latest.claimPlanes.installation.status === "UNKNOWN"
    && fixtures.latest.claimPlanes.runtime.status === "UNKNOWN"
    && fixtures.latest.claimPlanes.productLive.status === "UNKNOWN"
    && fixtures.latest.claimPlanes.publicFunctionalTesting.status === "HOLD", "published Hive IDE v2 exceeded its evidence or authorization ceiling");
  console.log(
    `IDE_RELEASE_V2_OK structural=STRUCTURAL_SCHEMA_OK current=${admitted.evidenceCurrent ? "CURRENT_EVIDENCE_OK" : "CURRENT_EVIDENCE_EXPIRED_HOLD"} version=${fixtures.latest.version} tag=${fixtures.latest.releaseTag} receipt_landing=${fixtures.latest.outerExecutableObservation.landingStatus} retrievability=${fixtures.latest.outerExecutableObservation.publicRetrievability} outer_bytes=${fixtures.latest.outerExecutableObservation.status} authenticode=${fixtures.latest.publisherAuthentication.authenticodeStatus} package=${fixtures.latest.claimPlanes.packageContents.status} runtime=${fixtures.latest.claimPlanes.runtime.status} product_live=${fixtures.latest.claimPlanes.productLive.status} functional_testing=${fixtures.latest.claimPlanes.publicFunctionalTesting.status} download=${fixtures.latest.downloadDisposition.status} latest=${IDE_RELEASE_LATEST_SHA256.slice(0, 12)} truth=${IDE_RELEASE_TRUTH_MANIFEST_SHA256.slice(0, 12)}`,
  );
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const nowArgument = process.argv.find((value) => value.startsWith("--now="));
  const trustedNow = nowArgument ? Date.parse(nowArgument.slice("--now=".length)) : Date.now();
  assert(Number.isFinite(trustedNow), "--now must be an RFC3339 timestamp");
  validatePublishedFeed(trustedNow);
}
