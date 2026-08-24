import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validSnapshot } from "../hub-assets/galaxy-core.mjs";
import { readHubFactsSync } from "./hub-facts-custody.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker = path.join(root, "script", "mark-galaxy-bridge-inactive.mjs");
const fixture = readHubFactsSync(path.join(root, "hub-assets", "hub-facts.json"), "galaxy bridge fixture");
fixture.refresh = {
  privateSourceMode: "scheduled-living-main-publisher",
  automaticBridgeEnabled: true,
  reasonCode: "SCHEDULED_LIVING_MAIN_PUBLISHER",
  lastGoodBehavior: "retain_previous_snapshot",
};

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
  assertRefresh(after.refresh, {
    privateSourceMode: "manual-source-bound-snapshot",
    automaticBridgeEnabled: false,
    reasonCode: "CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED",
    lastGoodBehavior: "retain_previous_snapshot",
  });
  assert.equal(await validSnapshot(after), true, "inactive bridge marker left an invalid snapshot hash");

  const stableBytes = fs.readFileSync(factsPath, "utf8");
  const idempotent = run("--credential-missing");
  assert.equal(idempotent.status, 0, idempotent.stderr);
  assert.equal(fs.readFileSync(factsPath, "utf8"), stableBytes, "idempotent marker rewrote bytes");

  fs.writeFileSync(factsPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  const checkoutFailed = run("--checkout-failed");
  assert.equal(checkoutFailed.status, 0, checkoutFailed.stderr);
  const failedCheckoutFacts = readHubFactsSync(factsPath, "failed-checkout galaxy bridge state");
  assert.equal(failedCheckoutFacts.refresh.automaticBridgeEnabled, false);
  assert.equal(failedCheckoutFacts.refresh.reasonCode, "PRIVATE_SOURCE_CHECKOUT_FAILED");
  assert.deepEqual(sourceBound(failedCheckoutFacts), sourceBound(fixture), "checkout failure marker changed source-bound fields");
  assert.equal(await validSnapshot(failedCheckoutFacts), true, "checkout failure marker left an invalid snapshot hash");

  console.log("GALAXY_BRIDGE_OK unauthorized=refused ambiguous=refused inactive_reasons=2 source_fields=preserved idempotent=true");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
