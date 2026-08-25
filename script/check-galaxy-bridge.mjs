import assert from "node:assert/strict";
import crypto, { webcrypto } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canonicalJson, productTruthSnapshotRelation, snapshotIdentityChanged, validSnapshot } from "../hub-assets/galaxy-core.mjs";
import { parseJsonBytesStrict } from "../hub-assets/strict-json.mjs";
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
  latestRefreshObservation: {
    observedAt: "2026-08-25T01:00:00Z",
    disposition: "AUTOMATIC_BRIDGE_CONFIGURED_CURRENT_OPERATION_UNKNOWN",
    reasonCode: "AUTOMATIC_BRIDGE_CONFIGURED_SOURCE_ONLY",
    automaticBridgeConfiguredAtObservation: true,
    executionObservationStatus: "NOT_ATTESTED",
    currentOperationalStatus: "UNKNOWN",
  },
  lastGoodTopologyBehavior: "retain_previous_source_facts_and_topology_refresh_boundary_may_change",
});
const CREDENTIAL_MISSING_OBSERVATION = Object.freeze({
  observedAt: "2026-08-25T01:10:00Z",
  disposition: "REFRESH_FAILED_LAST_GOOD_SOURCE_HELD",
  reasonCode: "CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED",
  automaticBridgeConfiguredAtObservation: false,
  executionObservationStatus: "NOT_ATTESTED",
  currentOperationalStatus: "UNKNOWN",
});
const checkedInFixture = readHubFactsSync(path.join(root, "hub-assets", "hub-facts.json"), "galaxy bridge fixture");
const fixture = seal({ ...checkedInFixture, refresh: CONFIGURED_REFRESH });
const reviewedBaseline = Object.freeze(parseJsonBytesStrict(
  fs.readFileSync(path.join(root, "hub-assets", "product-truth-semantic-baseline.v1.json")),
  "galaxy bridge semantic baseline",
));

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "galaxy-bridge-check-"));
const factsPath = path.join(temporaryRoot, "hub-facts.json");
const run = (...args) => spawnSync(process.execPath, [marker, ...args, "--facts-path", factsPath], {
  encoding: "utf8",
});
const immutableCapture = ({ snapshotHash: _snapshotHash, refresh, ...value }) => ({
  ...value,
  refresh: {
    sourceAcquisitionModeAtCapture: refresh.sourceAcquisitionModeAtCapture,
    automaticBridgeConfiguredAtCapture: refresh.automaticBridgeConfiguredAtCapture,
    configurationReasonCodeAtCapture: refresh.configurationReasonCodeAtCapture,
    lastGoodTopologyBehavior: refresh.lastGoodTopologyBehavior,
  },
});
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
  const manualNewSource = seal({
    ...activeNewSource,
    refresh: { ...activeNewSource.refresh, latestRefreshObservation: CREDENTIAL_MISSING_OBSERVATION },
  });
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

  const missingObservationTime = run("--credential-missing");
  assert.notEqual(missingObservationTime.status, 0, "marker must refuse implicit wall-clock observation time");
  assert.deepEqual(readHubFactsSync(factsPath, "missing-time galaxy bridge state"), before, "missing observation time changed facts");

  const disabled = run("--credential-missing", "--observed-at", CREDENTIAL_MISSING_OBSERVATION.observedAt);
  assert.equal(disabled.status, 0, disabled.stderr);
  const after = readHubFactsSync(factsPath, "inactive galaxy bridge state");
  assert.deepEqual(immutableCapture(after), immutableCapture(before), "marker changed capture-time or source-bound fields");
  assertRefresh(after.refresh.latestRefreshObservation, CREDENTIAL_MISSING_OBSERVATION);
  assert.equal(await validSnapshot(after), true, "inactive bridge marker left an invalid snapshot hash");
  assert.equal(await productTruthSnapshotRelation(after, reviewedBaseline), "BRIDGE_INACTIVE_LAST_GOOD_SOURCE");
  assert.equal(snapshotIdentityChanged(before, after), true, "configured-to-inactive refresh identity did not trigger a visible snapshot transition");
  const reconfigured = seal({
    ...after,
    refresh: { ...after.refresh, latestRefreshObservation: CONFIGURED_REFRESH.latestRefreshObservation },
  });
  assert.equal(await productTruthSnapshotRelation(reconfigured, reviewedBaseline), "EXACT_REVIEWED_BASELINE_MATCH");
  assert.equal(snapshotIdentityChanged(after, reconfigured), true, "inactive-to-configured refresh identity did not trigger a visible snapshot transition");
  assert.equal(snapshotIdentityChanged(reconfigured, reconfigured), false, "identical snapshot identity emitted a duplicate transition");
  assert.equal(await productTruthSnapshotRelation({}, reviewedBaseline), "SNAPSHOT_INVALID_BLOCKED");

  const stableBytes = fs.readFileSync(factsPath, "utf8");
  const idempotent = run("--credential-missing", "--observed-at", CREDENTIAL_MISSING_OBSERVATION.observedAt);
  assert.equal(idempotent.status, 0, idempotent.stderr);
  assert.equal(fs.readFileSync(factsPath, "utf8"), stableBytes, "idempotent marker rewrote bytes");

  fs.writeFileSync(factsPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  const checkoutFailed = run("--checkout-failed", "--observed-at", "2026-08-25T01:11:00Z");
  assert.equal(checkoutFailed.status, 0, checkoutFailed.stderr);
  const failedCheckoutFacts = readHubFactsSync(factsPath, "failed-checkout galaxy bridge state");
  assert.equal(failedCheckoutFacts.refresh.automaticBridgeConfiguredAtCapture, true, "capture-time bridge configuration was rewritten");
  assert.equal(failedCheckoutFacts.refresh.configurationReasonCodeAtCapture, "SCHEDULED_LIVING_MAIN_PUBLISHER", "capture reason was rewritten");
  assert.equal(failedCheckoutFacts.refresh.latestRefreshObservation.reasonCode, "PRIVATE_SOURCE_CHECKOUT_FAILED");
  assert.equal(canonicalJson(immutableCapture(failedCheckoutFacts)), canonicalJson(immutableCapture(fixture)), "checkout failure marker changed capture-time or source-bound fields");
  assert.equal(await validSnapshot(failedCheckoutFacts), true, "checkout failure marker left an invalid snapshot hash");

  console.log("GALAXY_BRIDGE_OK relations=exact,new_unreviewed,manual_new_unreviewed,inactive_last_good,invalid_blocked transitions=exact-inactive-exact unauthorized=refused ambiguous=refused implicit_time=refused inactive_reasons=2 capture_fields=preserved idempotent=true");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
