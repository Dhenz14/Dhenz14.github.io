import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  IDE_RELEASE_LATEST_BYTES,
  IDE_RELEASE_LATEST_MAX_BYTES,
  IDE_RELEASE_LATEST_SHA256,
  IDE_RELEASE_TRUTH_BYTES,
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
const LATEST_GIT_BLOB = "bba5886a2f5938558185aa3f94a76a5b7afd5bfe";
const TRUTH_GIT_BLOB = "fb83829b50f8573cdd5cd2783b881c496635eeed";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const gitBlobOid = (bytes) => crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

function readPublishedSources() {
  const feedBytes = fs.readFileSync(feedPath);
  const manifestBytes = fs.readFileSync(manifestPath);
  assert(feedBytes.length === IDE_RELEASE_LATEST_BYTES && feedBytes.length <= IDE_RELEASE_LATEST_MAX_BYTES, "Hive IDE latest v3 byte count drifted");
  assert(manifestBytes.length === IDE_RELEASE_TRUTH_BYTES && manifestBytes.length <= IDE_RELEASE_TRUTH_MAX_BYTES, "Hive IDE truth v3 byte count drifted");
  assert(sha256(feedBytes) === IDE_RELEASE_LATEST_SHA256 && gitBlobOid(feedBytes) === LATEST_GIT_BLOB, "Hive IDE latest v3 physical identity drifted");
  assert(sha256(manifestBytes) === IDE_RELEASE_TRUTH_MANIFEST_SHA256 && gitBlobOid(manifestBytes) === TRUTH_GIT_BLOB, "Hive IDE truth v3 physical identity drifted");
  return {
    feedBytes,
    manifestBytes,
    latest: parseJsonBytesStrict(feedBytes, "Hive IDE latest v3 feed"),
    manifest: parseJsonBytesStrict(manifestBytes, "Hive IDE truth manifest v3"),
  };
}

function validatePair(latest, manifest) {
  const admitted = validateIdeReleaseLatest(latest);
  assert(admitted.truthManifestSha256 === IDE_RELEASE_TRUTH_MANIFEST_SHA256, "latest v3 lost its truth-manifest binding");
  return validateIdeReleaseTruthManifest(manifest, admitted, { now: Date.now() });
}

function expectReject(label, fixtures, mutation) {
  const latest = structuredClone(fixtures.latest);
  const manifest = structuredClone(fixtures.manifest);
  mutation(latest, manifest);
  try {
    validatePair(latest, manifest);
  } catch (error) {
    return { label, passed: error instanceof IdeReleaseContractError && error.code === "IDE_RELEASE_CONTRACT_VIOLATION", observedCode: error?.code ?? error?.name };
  }
  return { label, passed: false };
}

function strictReject(label, source, expectedCode) {
  try { parseJsonStrict(source, label); } catch (error) {
    return { label, passed: error instanceof StrictJsonError && error.code === expectedCode, observedCode: error?.code ?? error?.name };
  }
  return { label, passed: false };
}

function selfTest() {
  const fixtures = readPublishedSources();
  const admitted = validatePair(fixtures.latest, fixtures.manifest);
  const tests = [
    { label: "valid_frozen_v3_pair_is_effectively_held", passed: admitted.evidenceCurrent === false && admitted.effectiveStatus === "EVIDENCE_EXPIRED_HELD" },
    { label: "truth_bytes_bound_by_latest", passed: fixtures.latest.truthManifestSha256 === sha256(fixtures.manifestBytes) },
    expectReject("latest_unknown_field_refused", fixtures, (latest) => { latest.untrusted = true; }),
    expectReject("truth_unknown_field_refused", fixtures, (_latest, manifest) => { manifest.untrusted = true; }),
    expectReject("download_authorization_refused", fixtures, (latest) => { latest.effectiveDisposition.activeDownloadAuthorized = true; }),
    expectReject("current_installer_url_refused", fixtures, (latest) => { latest.effectiveDisposition.currentInstallerUrl = latest.historicalEvidence.outerExecutable.historicalUrl; }),
    expectReject("current_retrievability_promotion_refused", fixtures, (latest) => { latest.effectiveDisposition.currentPublicRetrievability = "PUBLIC"; }),
    expectReject("current_package_promotion_refused", fixtures, (latest) => { latest.effectiveDisposition.currentPackageStatus = "VERIFIED"; }),
    expectReject("runtime_promotion_refused", fixtures, (latest) => { latest.effectiveDisposition.currentRuntimeStatus = "RUNNING"; }),
    expectReject("historical_hash_tamper_refused", fixtures, (latest) => { latest.historicalEvidence.outerExecutable.sha256 = "0".repeat(64); }),
    expectReject("historical_url_tamper_refused", fixtures, (latest) => { latest.historicalEvidence.outerExecutable.historicalUrl = "https://example.com/tester.exe"; }),
    expectReject("historical_time_extension_refused", fixtures, (latest) => { latest.historicalEvidence.validUntilUtc = "2027-08-24T19:20:09Z"; }),
    expectReject("truth_effective_divergence_refused", fixtures, (_latest, manifest) => { manifest.effectiveDisposition.currentPackageStatus = "AVAILABLE"; }),
    expectReject("truth_historical_divergence_refused", fixtures, (_latest, manifest) => { manifest.historicalEvidence.outerExecutable.sizeBytes += 1; }),
    expectReject("outer_plane_current_verification_refused", fixtures, (_latest, manifest) => { manifest.claimPlanes.outerExecutableBytes.effectiveStatus = "VERIFIED"; }),
    expectReject("functional_testing_promotion_refused", fixtures, (_latest, manifest) => { manifest.claimPlanes.publicFunctionalTesting.effectiveStatus = "PASS"; }),
    strictReject("duplicate_key_refused", '{"schema":"a","schema":"b"}', "JSON_DUPLICATE_KEY"),
    strictReject("bom_refused", "\uFEFF{}", "JSON_BOM_FORBIDDEN"),
    strictReject("unpaired_surrogate_refused", '{"x":"\\ud800"}', "JSON_UNPAIRED_SURROGATE"),
    strictReject("normalization_collision_refused", '{"é":1,"e\\u0301":2}', "JSON_NORMALIZATION_COLLISION"),
    strictReject("trailing_content_refused", '{}x', "JSON_TRAILING_CONTENT"),
  ];
  const ok = tests.every((test) => test.passed);
  console.log(JSON.stringify({ schema: "hive.ide.public_hub_release_self_test.v3", ok, testCount: tests.length, tests }, null, 2));
  if (!ok) process.exitCode = 1;
}

function validatePublishedFeed() {
  const fixtures = readPublishedSources();
  const result = validatePair(fixtures.latest, fixtures.manifest);
  const current = fixtures.latest.effectiveDisposition;
  assert(current.effectiveStatus === "EVIDENCE_EXPIRED_HELD"
    && current.activeDownloadAuthorized === false
    && current.currentPackageStatus === "UNKNOWN"
    && current.currentPublicRetrievability === "UNKNOWN"
    && current.currentInstallerUrl === null
    && current.currentRuntimeStatus === "UNKNOWN", "published Hive IDE v3 exceeded its effective evidence ceiling");
  console.log(`IDE_RELEASE_V3_OK structural=STRUCTURAL_SCHEMA_OK current=${result.effectiveStatus} package=${current.currentPackageStatus} retrievability=${current.currentPublicRetrievability} installer_url=null runtime=${current.currentRuntimeStatus} download=HOLD latest=${IDE_RELEASE_LATEST_SHA256.slice(0, 12)} truth=${IDE_RELEASE_TRUTH_MANIFEST_SHA256.slice(0, 12)}`);
}

if (process.argv.includes("--self-test")) selfTest();
else validatePublishedFeed();
