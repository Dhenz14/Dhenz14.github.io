import assert from "node:assert/strict";
import crypto, { webcrypto } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canonicalJson, productTruthSnapshotRelation, snapshotIdentityChanged, validSnapshot } from "../hub-assets/galaxy-core.mjs";
import { readHubFactsSync } from "./hub-facts-custody.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker = path.join(root, "script", "mark-galaxy-bridge-inactive.mjs");
const seal = (value) => {
  const copy = structuredClone(value);
  delete copy.snapshotHash;
  return {
    ...copy,
    snapshotHash: crypto.createHash("sha256").update(canonicalJson(copy)).digest("hex"),
  };
};
const CONFIGURED_REFRESH = Object.freeze({
  sourceAcquisitionModeAtCapture: "scheduled-living-main-publisher",
  automaticBridgeConfiguredAtCapture: true,
  configurationReasonCodeAtCapture: "SCHEDULED_LIVING_MAIN_PUBLISHER",
  executionObservationStatus: "NOT_ATTESTED",
  currentOperationalStatus: "UNKNOWN",
  lastGoodTopologyBehavior: "retain_previous_source_facts_and_topology_refresh_boundary_may_change",
});
const INACTIVE_REFRESH = Object.freeze({
  sourceAcquisitionModeAtCapture: "manual-source-bound-snapshot",
  automaticBridgeConfiguredAtCapture: false,
  configurationReasonCodeAtCapture: "CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED",
  executionObservationStatus: "NOT_ATTESTED",
  currentOperationalStatus: "UNKNOWN",
  lastGoodTopologyBehavior: "retain_previous_source_facts_and_topology_refresh_boundary_may_change",
});
const checkedInFixture = readHubFactsSync(path.join(root, "hub-assets", "hub-facts.json"), "galaxy bridge fixture");
const fixture = seal({ ...checkedInFixture, refresh: CONFIGURED_REFRESH });
const reviewedBaseline = Object.freeze({
  snapshotVersion: fixture.snapshotVersion,
  sourceCommit: fixture.hiveAi.sourceCommit,
  graphHash: fixture.hiveAi.graphHash,
  sourceFingerprint: fixture.hiveAi.sourceFingerprint,
  projectionHash: fixture.galaxy.projectionHash,
  geometryHash: fixture.galaxy.geometry.geometryHash,
  reviewedSiteCommit: "db2f240efd3be938e9e888a3aa5f5af0b9c522e3",
  reviewedFactsGitBlobOid: "e5962434b1864a60082bb9a732fd7a87acf29a11",
  immutableRawReference: "https://raw.githubusercontent.com/Dhenz14/Dhenz14.github.io/db2f240efd3be938e9e888a3aa5f5af0b9c522e3/hub-assets/hub-facts.json",
});

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "galaxy-bridge-check-"));
const factsPath = path.join(temporaryRoot, "hub-facts.json");
const run = (...args) => spawnSync(process.execPath, [marker, ...args, "--facts-path", factsPath], {
  encoding: "utf8",
});
const sourceBound = ({ refresh: _refresh, snapshotHash: _snapshotHash, ...value }) => value;
const assertRefresh = (actual, expected) => {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), "bridge refresh keys drifted");
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(actual[key], value, `bridge refresh ${key} drifted`);
  }
};

try {
  assert.equal(await productTruthSnapshotRelation(fixture, reviewedBaseline), "EXACT_REVIEWED_BASELINE_MATCH");
  const newSource = structuredClone(fixture);
  newSource.hiveAi.sourceCommit = "1".repeat(40);
  const activeNewSource = seal(newSource);
  assert.equal(await validSnapshot(activeNewSource), true, "new-source integration fixture is not structurally valid");
  assert.equal(await productTruthSnapshotRelation(activeNewSource, reviewedBaseline), "NEW_SOURCE_SNAPSHOT_UNREVIEWED_HOLD");
  const manualNewSource = seal({ ...activeNewSource, refresh: INACTIVE_REFRESH });
  assert.equal(await validSnapshot(manualNewSource), true, "manual new-source fixture is not structurally valid");
  assert.equal(await productTruthSnapshotRelation(manualNewSource, reviewedBaseline), "NEW_SOURCE_SNAPSHOT_UNREVIEWED_HOLD", "manual new source was falsely classified as last-good");
  fs.writeFileSync(factsPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  const before = readHubFactsSync(factsPath, "galaxy bridge before state");

  const unauthorized = run();
  assert.notEqual(unauthorized.status, 0, "marker must refuse missing fail-closed authority flag");
  assert.deepEqual(readHubFactsSync(factsPath, "refused galaxy bridge state"), before, "refused invocation changed facts");
  const ambiguous = run("--credential-missing", "--checkout-failed");
  assert.notEqual(ambiguous.status, 0, "marker must refuse ambiguous fail-closed authority flags");
  assert.deepEqual(readHubFactsSync(factsPath, "ambiguous galaxy bridge state"), before, "ambiguous invocation changed facts");

  const disabled = run("--credential-missing");
  assert.equal(disabled.status, 0, disabled.stderr);
  const after = readHubFactsSync(factsPath, "inactive galaxy bridge state");
  assert.deepEqual(sourceBound(after), sourceBound(before), "marker changed source-bound fields");
  assertRefresh(after.refresh, INACTIVE_REFRESH);
  assert.equal(await validSnapshot(after), true, "inactive bridge marker left an invalid snapshot hash");
  assert.equal(await productTruthSnapshotRelation(after, reviewedBaseline), "BRIDGE_INACTIVE_LAST_GOOD_SOURCE");
  assert.equal(snapshotIdentityChanged(before, after), true, "configured-to-inactive refresh identity did not trigger a visible snapshot transition");
  const reconfigured = seal({ ...after, refresh: CONFIGURED_REFRESH });
  assert.equal(await productTruthSnapshotRelation(reconfigured, reviewedBaseline), "EXACT_REVIEWED_BASELINE_MATCH");
  assert.equal(snapshotIdentityChanged(after, reconfigured), true, "inactive-to-configured refresh identity did not trigger a visible snapshot transition");
  assert.equal(snapshotIdentityChanged(reconfigured, reconfigured), false, "identical snapshot identity emitted a duplicate transition");
  assert.equal(await productTruthSnapshotRelation({}, reviewedBaseline), "SNAPSHOT_INVALID_BLOCKED");

  const stableBytes = fs.readFileSync(factsPath, "utf8");
  const idempotent = run("--credential-missing");
  assert.equal(idempotent.status, 0, idempotent.stderr);
  assert.equal(fs.readFileSync(factsPath, "utf8"), stableBytes, "idempotent marker rewrote bytes");

  fs.writeFileSync(factsPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  const checkoutFailed = run("--checkout-failed");
  assert.equal(checkoutFailed.status, 0, checkoutFailed.stderr);
  const failedCheckoutFacts = readHubFactsSync(factsPath, "failed-checkout galaxy bridge state");
  assert.equal(failedCheckoutFacts.refresh.automaticBridgeConfiguredAtCapture, false);
  assert.equal(failedCheckoutFacts.refresh.configurationReasonCodeAtCapture, "PRIVATE_SOURCE_CHECKOUT_FAILED");
  assert.equal(canonicalJson(sourceBound(failedCheckoutFacts)), canonicalJson(sourceBound(fixture)), "checkout failure marker changed source-bound fields");
  assert.equal(await validSnapshot(failedCheckoutFacts), true, "checkout failure marker left an invalid snapshot hash");

  console.log("GALAXY_BRIDGE_OK relations=exact,new_unreviewed,manual_new_unreviewed,inactive_last_good,invalid_blocked transitions=exact-inactive-exact unauthorized=refused ambiguous=refused inactive_reasons=2 source_fields=preserved idempotent=true");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
