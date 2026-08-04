import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker = path.join(root, "script", "mark-galaxy-bridge-inactive.mjs");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "hub-assets", "hub-facts.json"), "utf8"));
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

try {
  fs.writeFileSync(factsPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  const before = JSON.parse(fs.readFileSync(factsPath, "utf8"));

  const unauthorized = run();
  assert.notEqual(unauthorized.status, 0, "marker must refuse missing fail-closed authority flag");
  assert.deepEqual(JSON.parse(fs.readFileSync(factsPath, "utf8")), before, "refused invocation changed facts");
  const ambiguous = run("--credential-missing", "--checkout-failed");
  assert.notEqual(ambiguous.status, 0, "marker must refuse ambiguous fail-closed authority flags");
  assert.deepEqual(JSON.parse(fs.readFileSync(factsPath, "utf8")), before, "ambiguous invocation changed facts");

  const disabled = run("--credential-missing");
  assert.equal(disabled.status, 0, disabled.stderr);
  const after = JSON.parse(fs.readFileSync(factsPath, "utf8"));
  assert.deepEqual({ ...after, refresh: before.refresh }, before, "marker changed source-bound fields");
  assert.deepEqual(after.refresh, {
    privateSourceMode: "manual-source-bound-snapshot",
    automaticBridgeEnabled: false,
    reasonCode: "CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED",
    lastGoodBehavior: "retain_previous_snapshot",
  });

  const stableBytes = fs.readFileSync(factsPath, "utf8");
  const idempotent = run("--credential-missing");
  assert.equal(idempotent.status, 0, idempotent.stderr);
  assert.equal(fs.readFileSync(factsPath, "utf8"), stableBytes, "idempotent marker rewrote bytes");

  fs.writeFileSync(factsPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  const checkoutFailed = run("--checkout-failed");
  assert.equal(checkoutFailed.status, 0, checkoutFailed.stderr);
  const failedCheckoutFacts = JSON.parse(fs.readFileSync(factsPath, "utf8"));
  assert.equal(failedCheckoutFacts.refresh.automaticBridgeEnabled, false);
  assert.equal(failedCheckoutFacts.refresh.reasonCode, "PRIVATE_SOURCE_CHECKOUT_FAILED");
  assert.deepEqual({ ...failedCheckoutFacts, refresh: fixture.refresh }, fixture, "checkout failure marker changed source-bound fields");

  console.log("GALAXY_BRIDGE_OK unauthorized=refused ambiguous=refused inactive_reasons=2 source_fields=preserved idempotent=true");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
