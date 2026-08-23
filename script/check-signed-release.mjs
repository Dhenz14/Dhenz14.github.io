#!/usr/bin/env node

// The HivePoA public surface is quarantined: every route is one byte-identical hold page
// and the tester-network authorization module is preserved but no longer served or bound
// by a build receipt. The signed-index fixture therefore no longer lives on a served page.
//
// Retiring this check would silently drop the verifier's fail-closed coverage, so instead
// it now (1) proves the module is preserved exactly as the quarantine receipt records it,
// (2) proves no served page references it, and (3) recovers the historical fixture by the
// content-addressed blob the receipt pins, then runs the original negative cases unchanged.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const receipt = JSON.parse(await fs.readFile(path.join(root, "HivePoA", "public-surface-quarantine-receipt.json"), "utf8"));
if (receipt.schema !== "hivepoa.public_surface_quarantine.v1" || receipt.status !== "ACTIVE_CANDIDATE_NOT_DEPLOYED") {
  throw new Error("quarantine receipt schema or status drifted");
}

// (1) the verifier module must still be recoverable at its exact preserved identity
const preserved = receipt.preservedGeneratedAssets?.authorizationModule;
if (!preserved) throw new Error("quarantine receipt does not record the authorization module");
const verifierPath = path.join(root, preserved.path);
const verifierBytes = await fs.readFile(verifierPath);
if (verifierBytes.length !== preserved.bytes || sha256(verifierBytes) !== preserved.sha256) {
  throw new Error("preserved authorization module drifted from its recorded identity");
}
if (preserved.servedByQuarantineEntries !== false) throw new Error("authorization module must not be served while quarantined");
if (preserved.boundByBuildReceipt !== false) throw new Error("quarantine receipt must keep recording the unbound build receipt");

// (2) no quarantined route may reference the preserved module
const moduleName = path.posix.basename(preserved.path);
for (const entry of receipt.quarantinedEntries ?? []) {
  const routeSource = await fs.readFile(path.join(root, entry.path), "utf8");
  if (routeSource.includes(moduleName) || /<\s*script\b/i.test(routeSource)) {
    throw new Error(`quarantined route re-exposed executable surface: ${entry.path}`);
  }
}

// (3) recover the historical signed-index fixture by content address, not from a served page
const originalIndex = (receipt.quarantinedEntries ?? []).find((entry) => entry.path === "HivePoA/index.html");
if (!originalIndex) throw new Error("quarantine receipt does not record the original HivePoA index");
let originalBytes;
try {
  originalBytes = execFileSync("git", ["cat-file", "blob", originalIndex.originalGitBlobOid], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
} catch (error) {
  throw new Error(`historical signed-index fixture is unreachable (${originalIndex.originalGitBlobOid}): ${error.message}`);
}
if (originalBytes.length !== originalIndex.originalBytes || sha256(originalBytes) !== originalIndex.originalSha256) {
  throw new Error("recovered historical index does not match the quarantine receipt identity");
}

const verifierUrl = `data:text/javascript;base64,${verifierBytes.toString("base64")}`;
const { verifyAuthorizedTesterNetworkIndex } = await import(verifierUrl);
const html = originalBytes.toString("utf8");
const fixtureText = html.match(/<script\b[^>]*id=["']release-index-fixture["'][^>]*>([\s\S]*?)<\/script>/)?.[1];
if (!fixtureText) throw new Error("signed release fixture is missing");
const index = JSON.parse(fixtureText);

const accepted = await verifyAuthorizedTesterNetworkIndex(index);
if (!accepted.ok) throw new Error(`signed release fixture rejected: ${accepted.reason}`);
if (accepted.release?.version !== "2.0.1-storage-preview.7" || accepted.release?.releaseSequence !== 7) {
  throw new Error("signed release fixture selected an unexpected package");
}

const expired = await verifyAuthorizedTesterNetworkIndex(index, { nowMs: Date.parse(index.signed.expiresAt) });
if (expired.ok || expired.reason !== "index is not currently valid") throw new Error("expired signed index did not fail closed");

const wrongPin = await verifyAuthorizedTesterNetworkIndex(index, { pinnedFingerprint: "0".repeat(64) });
if (wrongPin.ok || !wrongPin.reason.includes("pinned Pages key")) throw new Error("wrong verifier pin did not fail closed");

const tampered = structuredClone(index);
tampered.signed.releases[0].testerNetwork.creditPolicy.amountPerAcceptedProof += 1;
const tamperedResult = await verifyAuthorizedTesterNetworkIndex(tampered);
if (tamperedResult.ok) throw new Error("tampered tester policy did not fail closed");

const revoked = structuredClone(index);
revoked.signed.releases[0].revoked = true;
const revokedResult = await verifyAuthorizedTesterNetworkIndex(revoked);
if (revokedResult.ok) throw new Error("revoked tester tip did not fail closed");

console.log(`SIGNED_RELEASE_OK version=${accepted.release.version} sequence=${accepted.release.releaseSequence} negative_cases=4 surface=QUARANTINED fixture=historical:${originalIndex.originalGitBlobOid.slice(0, 12)}`);
