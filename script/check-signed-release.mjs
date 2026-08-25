#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonBytesStrict, parseJsonStrict } from "../hub-assets/strict-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureManifestPath = path.join(root, ".github", "test-fixtures", "hivepoa", "portable-signed-release-fixture.v1.json");
const EXACT_PATHS = Object.freeze({
  receipt: ".github/test-fixtures/hivepoa/historical-quarantine-receipt-a4ff709e5310.json",
  historicalIndex: ".github/test-fixtures/hivepoa/historical-index-1a607c451406.html",
  authorizationModule: ".github/test-fixtures/hivepoa/tester-network-authorization-3f397e3bc3a6.js",
});
const EXACT_IDENTITIES = Object.freeze({
  receipt: Object.freeze({
    bytes: 5310,
    sha256: "ac1cd5ac2a678b5bb46e2503c90ab9364b80cd562f2725039137ab74da94ec1a",
    gitBlobOid: "a4ff709e53106fd932224c6d7a6f2e48ee13e7e0",
  }),
  historicalIndex: Object.freeze({
    bytes: 19354,
    sha256: "78c1353fa32410062eb4585ff4a606b02578697faad1023910ed3d50b71c9397",
    gitBlobOid: "1a607c451406eb81c5e838fbcb2237ed3d057d3c",
  }),
  authorizationModule: Object.freeze({
    bytes: 13971,
    sha256: "75c02a84f91f9fce72672427b6865d80c09118ad3ad9c4be758aa6cfc3d4282a",
    gitBlobOid: "3f397e3bc3a6a3a4ee83b9c54f11c1b8bc55daf0",
  }),
});

export class SignedReleaseContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SignedReleaseContractError";
    this.code = code;
  }
}

function assertContract(condition, code, message) {
  if (!condition) throw new SignedReleaseContractError(code, message);
}

function exactKeys(value, expected, code, label) {
  assertContract(value !== null && typeof value === "object" && !Array.isArray(value), code, `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assertContract(JSON.stringify(actual) === JSON.stringify(wanted), code, `${label} keys drifted`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobOid(bytes) {
  return crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function validateBindingSpec(name, binding, expectedPath, expectedIdentity) {
  assertContract(binding, "FIXTURE_BINDING_MISSING", `${name} binding is missing`);
  exactKeys(binding, ["path", "bytes", "sha256", "gitBlobOid"], "FIXTURE_BINDING_KEYS_INVALID", `${name} binding`);
  assertContract(binding.path === expectedPath, "FIXTURE_PATH_MISMATCH", `${name} fixture path drifted`);
  assertContract(binding.bytes === expectedIdentity.bytes, "FIXTURE_SIZE_BINDING_MISMATCH", `${name} byte binding drifted`);
  assertContract(binding.sha256 === expectedIdentity.sha256, "FIXTURE_SHA256_BINDING_MISMATCH", `${name} SHA-256 binding drifted`);
  assertContract(binding.gitBlobOid === expectedIdentity.gitBlobOid, "FIXTURE_GIT_BLOB_BINDING_MISMATCH", `${name} Git blob binding drifted`);
  return binding;
}

export function validatePortableFixtureDocument(document) {
  exactKeys(document, ["schema", "version", "historicalReceipt", "bindings", "currentDeployment"], "FIXTURE_DOCUMENT_KEYS_INVALID", "portable fixture document");
  assertContract(document.schema === "hivepoa.signed_release.portable_fixture.v1" && document.version === 1,
    "FIXTURE_SCHEMA_INVALID", "portable fixture schema or version drifted");
  assertContract(document.bindings?.historicalIndex && document.bindings?.authorizationModule,
    "FIXTURE_BINDING_MISSING", "one or more portable fixture bindings are missing");
  exactKeys(document.bindings, ["historicalIndex", "authorizationModule"], "FIXTURE_BINDINGS_KEYS_INVALID", "fixture bindings");
  validateBindingSpec("historical receipt", document.historicalReceipt, EXACT_PATHS.receipt, EXACT_IDENTITIES.receipt);
  validateBindingSpec("historical index", document.bindings.historicalIndex, EXACT_PATHS.historicalIndex, EXACT_IDENTITIES.historicalIndex);
  validateBindingSpec("authorization module", document.bindings.authorizationModule, EXACT_PATHS.authorizationModule, EXACT_IDENTITIES.authorizationModule);
  exactKeys(document.currentDeployment, ["status", "observedAt", "receiptRef", "reasonCode"], "DEPLOYMENT_RECORD_KEYS_INVALID", "current deployment record");
  assertContract(document.currentDeployment.status === "UNKNOWN_NOT_OBSERVED"
    && document.currentDeployment.observedAt === null
    && document.currentDeployment.receiptRef === null
    && document.currentDeployment.reasonCode === "NO_CURRENT_DEPLOYMENT_READBACK_IN_CANDIDATE",
  "DEPLOYMENT_UNKNOWN_BOUNDARY_INVALID", "candidate invented a current HivePoA deployment observation");
  return document;
}

export function validateBoundBytes(name, bytes, binding) {
  assertContract(bytes.length === binding.bytes, "FIXTURE_SIZE_MISMATCH", `${name} byte count drifted`);
  assertContract(sha256(bytes) === binding.sha256, "FIXTURE_SHA256_MISMATCH", `${name} SHA-256 drifted`);
  assertContract(gitBlobOid(bytes) === binding.gitBlobOid, "FIXTURE_GIT_BLOB_MISMATCH", `${name} Git blob OID drifted`);
  return bytes;
}

async function readPortableEvidence() {
  const document = validatePortableFixtureDocument(parseJsonBytesStrict(
    await fs.readFile(fixtureManifestPath),
    "portable signed-release fixture",
  ));
  const receiptBytes = validateBoundBytes(
    "historical quarantine receipt",
    await fs.readFile(path.join(root, document.historicalReceipt.path)),
    document.historicalReceipt,
  );
  const receipt = parseJsonBytesStrict(receiptBytes, "historical HivePoA quarantine receipt");
  assertContract(receipt.schema === "hivepoa.public_surface_quarantine.v1"
    && receipt.status === "ACTIVE_CANDIDATE_NOT_DEPLOYED",
  "QUARANTINE_RECEIPT_STATUS_INVALID", "historical quarantine receipt schema or status drifted");

  const preserved = receipt.preservedGeneratedAssets?.authorizationModule;
  assertContract(preserved?.path === "HivePoA/distribution-assets/tester-network-authorization.js"
    && preserved.bytes === document.bindings.authorizationModule.bytes
    && preserved.sha256 === document.bindings.authorizationModule.sha256
    && preserved.gitBlobOid === document.bindings.authorizationModule.gitBlobOid
    && preserved.servedByQuarantineEntries === false
    && preserved.boundByBuildReceipt === false,
  "QUARANTINE_AUTHORIZATION_BINDING_INVALID", "historical authorization binding drifted");
  const originalIndex = (receipt.quarantinedEntries ?? []).find((entry) => entry.path === "HivePoA/index.html");
  assertContract(originalIndex?.originalBytes === document.bindings.historicalIndex.bytes
    && originalIndex.originalSha256 === document.bindings.historicalIndex.sha256
    && originalIndex.originalGitBlobOid === document.bindings.historicalIndex.gitBlobOid,
  "QUARANTINE_INDEX_BINDING_INVALID", "historical index binding drifted");

  const moduleName = path.posix.basename(preserved.path);
  for (const entry of receipt.quarantinedEntries ?? []) {
    const routeSource = await fs.readFile(path.join(root, entry.path), "utf8");
    assertContract(!routeSource.includes(moduleName) && !/<\s*script\b/i.test(routeSource),
      "QUARANTINED_ROUTE_EXECUTABLE", `quarantined route re-exposed executable surface: ${entry.path}`);
  }

  const originalBytes = validateBoundBytes(
    "portable historical index",
    await fs.readFile(path.join(root, document.bindings.historicalIndex.path)),
    document.bindings.historicalIndex,
  );
  const verifierBytes = validateBoundBytes(
    "portable authorization module",
    await fs.readFile(path.join(root, document.bindings.authorizationModule.path)),
    document.bindings.authorizationModule,
  );
  return { document, receiptBytes, originalBytes, verifierBytes };
}

function verifyFullHistory(evidence) {
  const bindings = [
    ["historical quarantine receipt", evidence.document.historicalReceipt, evidence.receiptBytes],
    ["historical index", evidence.document.bindings.historicalIndex, evidence.originalBytes],
    ["authorization module", evidence.document.bindings.authorizationModule, evidence.verifierBytes],
  ];
  for (const [name, binding, fixtureBytes] of bindings) {
    let historicalBytes;
    try {
      historicalBytes = execFileSync("git", ["cat-file", "blob", binding.gitBlobOid], {
        cwd: root,
        encoding: null,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (error) {
      throw new SignedReleaseContractError("GIT_PROVENANCE_UNAVAILABLE", `${name} Git provenance is unavailable: ${error.message}`);
    }
    validateBoundBytes(`${name} Git object`, historicalBytes, binding);
    assertContract(historicalBytes.equals(fixtureBytes), "GIT_PROVENANCE_BYTES_MISMATCH", `${name} fixture differs from its historical Git object`);
  }
}

async function verifySignedRelease(evidence) {
  const verifierUrl = `data:text/javascript;base64,${evidence.verifierBytes.toString("base64")}`;
  const { verifyAuthorizedTesterNetworkIndex } = await import(verifierUrl);
  const html = evidence.originalBytes.toString("utf8");
  const fixtureText = html.match(/<script\b[^>]*id=["']release-index-fixture["'][^>]*>([\s\S]*?)<\/script>/)?.[1];
  assertContract(fixtureText, "SIGNED_INDEX_FIXTURE_MISSING", "signed release fixture is missing");
  const index = parseJsonStrict(fixtureText, "historical signed release index");

  const accepted = await verifyAuthorizedTesterNetworkIndex(index);
  assertContract(accepted.ok && accepted.reason === null, "SIGNED_INDEX_REJECTED", `signed release fixture rejected: ${accepted.reason}`);
  assertContract(accepted.release?.version === "2.0.1-storage-preview.7"
    && accepted.release?.releaseSequence === 7,
  "SIGNED_INDEX_RELEASE_UNEXPECTED", "signed release fixture selected an unexpected package");

  const expired = await verifyAuthorizedTesterNetworkIndex(index, { nowMs: Date.parse(index.signed.expiresAt) });
  assertContract(!expired.ok && expired.reason === "index is not currently valid", "SIGNED_INDEX_EXPIRY_NOT_FAIL_CLOSED", "expired signed index did not fail closed exactly");
  const wrongPin = await verifyAuthorizedTesterNetworkIndex(index, { pinnedFingerprint: "0".repeat(64) });
  assertContract(!wrongPin.ok && wrongPin.reason === "trust bootstrap fingerprint is not the pinned Pages key",
    "SIGNED_INDEX_PIN_NOT_FAIL_CLOSED", "wrong verifier pin did not fail closed exactly");
  const tampered = structuredClone(index);
  tampered.signed.releases[0].testerNetwork.creditPolicy.amountPerAcceptedProof += 1;
  const tamperedResult = await verifyAuthorizedTesterNetworkIndex(tampered);
  assertContract(!tamperedResult.ok && tamperedResult.reason === "Tester Network policy differs from the fixed valueless-credit contract",
    "SIGNED_INDEX_TAMPER_NOT_FAIL_CLOSED", "tampered tester policy did not fail closed exactly");
  const revoked = structuredClone(index);
  revoked.signed.releases[0].revoked = true;
  const revokedResult = await verifyAuthorizedTesterNetworkIndex(revoked);
  assertContract(!revokedResult.ok && revokedResult.reason === "approved tip sequence is missing, duplicated, or revoked",
    "SIGNED_INDEX_REVOCATION_NOT_FAIL_CLOSED", "revoked tester tip did not fail closed exactly");
  return accepted;
}

function expectContractCode(label, expectedCode, action) {
  try {
    action();
    return { label, passed: false, observedCode: "NO_ERROR" };
  } catch (error) {
    return {
      label,
      passed: error instanceof SignedReleaseContractError && error.code === expectedCode,
      observedCode: error?.code ?? error?.name ?? typeof error,
    };
  }
}

async function selfTest() {
  const evidence = await readPortableEvidence();
  const base = evidence.document;
  const tests = [
    { label: "portable_fixture_valid", passed: true, observedCode: "PASS" },
    expectContractCode("missing_binding_refused", "FIXTURE_BINDING_MISSING", () => {
      const value = structuredClone(base);
      delete value.bindings.historicalIndex;
      validatePortableFixtureDocument(value);
    }),
    expectContractCode("path_mutation_refused", "FIXTURE_PATH_MISMATCH", () => {
      const value = structuredClone(base);
      value.bindings.historicalIndex.path = "HivePoA/index.html";
      validatePortableFixtureDocument(value);
    }),
    expectContractCode("size_binding_mutation_refused", "FIXTURE_SIZE_BINDING_MISMATCH", () => {
      const value = structuredClone(base);
      value.bindings.historicalIndex.bytes += 1;
      validatePortableFixtureDocument(value);
    }),
    expectContractCode("hash_binding_mutation_refused", "FIXTURE_SHA256_BINDING_MISMATCH", () => {
      const value = structuredClone(base);
      value.bindings.historicalIndex.sha256 = "0".repeat(64);
      validatePortableFixtureDocument(value);
    }),
    expectContractCode("blob_binding_mutation_refused", "FIXTURE_GIT_BLOB_BINDING_MISMATCH", () => {
      const value = structuredClone(base);
      value.bindings.historicalIndex.gitBlobOid = "0".repeat(40);
      validatePortableFixtureDocument(value);
    }),
    expectContractCode("one_byte_fixture_mutation_refused", "FIXTURE_SHA256_MISMATCH", () => {
      const bytes = Buffer.from(evidence.originalBytes);
      bytes[0] ^= 1;
      validateBoundBytes("mutated historical index", bytes, base.bindings.historicalIndex);
    }),
    expectContractCode("physical_size_mutation_refused", "FIXTURE_SIZE_MISMATCH", () => {
      validateBoundBytes("truncated historical index", evidence.originalBytes.subarray(0, -1), base.bindings.historicalIndex);
    }),
  ];
  const ok = tests.every((test) => test.passed);
  console.log(JSON.stringify({ schema: "hivepoa.signed_release.portable_self_test.v1", ok, testCount: tests.length, tests }, null, 2));
  if (!ok) process.exitCode = 1;
}

const allowedArgs = new Set(["--self-test", "--verify-git-provenance"]);
const unknownArg = process.argv.slice(2).find((arg) => !allowedArgs.has(arg));
assertContract(!unknownArg, "UNKNOWN_ARGUMENT", `unknown argument: ${unknownArg}`);

if (process.argv.includes("--self-test")) {
  await selfTest();
} else {
  const evidence = await readPortableEvidence();
  if (process.argv.includes("--verify-git-provenance")) verifyFullHistory(evidence);
  const accepted = await verifySignedRelease(evidence);
  console.log(`SIGNED_RELEASE_OK version=${accepted.release.version} sequence=${accepted.release.releaseSequence} negative_cases=4 surface=QUARANTINED fixture=portable:${evidence.document.bindings.historicalIndex.gitBlobOid.slice(0, 12)} provenance=${process.argv.includes("--verify-git-provenance") ? "FULL_HISTORY" : "PORTABLE_NO_GIT"} deployment=UNKNOWN_NOT_OBSERVED`);
}
