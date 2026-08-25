#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../hub-assets/galaxy-core.mjs";
import { readHubFactsSync } from "./hub-facts-custody.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const factsPathIndex = process.argv.indexOf("--facts-path");
const outputPath = path.resolve(
  factsPathIndex === -1
    ? path.join(siteRoot, "hub-assets", "hub-facts.json")
    : String(process.argv[factsPathIndex + 1] || ""),
);

const credentialMissing = process.argv.includes("--credential-missing");
const checkoutFailed = process.argv.includes("--checkout-failed");
if (credentialMissing === checkoutFailed) {
  throw new Error("bridge state change refused: choose exactly one supported fail-closed reason");
}
if (factsPathIndex !== -1 && !process.argv[factsPathIndex + 1]) {
  throw new Error("bridge state change refused: --facts-path requires a value");
}

const reasonCode = checkoutFailed
  ? "PRIVATE_SOURCE_CHECKOUT_FAILED"
  : "CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED";
const current = readHubFactsSync(outputPath, "bridge marker hub-facts input");
const nextRefresh = {
  sourceAcquisitionModeAtCapture: "manual-source-bound-snapshot",
  automaticBridgeConfiguredAtCapture: false,
  configurationReasonCodeAtCapture: reasonCode,
  executionObservationStatus: "NOT_ATTESTED",
  currentOperationalStatus: "UNKNOWN",
  lastGoodTopologyBehavior: "retain_previous_source_facts_and_topology_refresh_boundary_may_change",
};

if (JSON.stringify(current.refresh) === JSON.stringify(nextRefresh)) {
  console.log("GALAXY_BRIDGE_ALREADY_INACTIVE");
  process.exit(0);
}

const { snapshotHash: _ignored, ...currentBody } = current;
const nextBody = { ...currentBody, refresh: nextRefresh };
const next = {
  ...nextBody,
  snapshotHash: crypto.createHash("sha256").update(canonicalJson(nextBody)).digest("hex"),
};
const temporary = path.join(
  path.dirname(outputPath),
  `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
);
let descriptor;
try {
  descriptor = fs.openSync(temporary, "wx", 0o644);
  fs.writeFileSync(descriptor, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  fs.fsyncSync(descriptor);
  fs.closeSync(descriptor);
  descriptor = undefined;
  fs.renameSync(temporary, outputPath);
} finally {
  if (descriptor !== undefined) fs.closeSync(descriptor);
  try { fs.unlinkSync(temporary); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log(`GALAXY_BRIDGE_INACTIVE reason=${reasonCode}`);
