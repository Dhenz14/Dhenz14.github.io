#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../hub-assets/galaxy-core.mjs";
import { readHubFactsSync } from "./hub-facts-custody.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const factsPathIndex = process.argv.indexOf("--facts-path");
const observedAtIndex = process.argv.indexOf("--observed-at");
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
const observedAt = observedAtIndex === -1 ? "" : String(process.argv[observedAtIndex + 1] || "");
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(observedAt)
  || new Date(Date.parse(observedAt)).toISOString().replace(".000Z", "Z") !== observedAt) {
  throw new Error("bridge state change refused: --observed-at requires one exact UTC-second instant");
}

const reasonCode = checkoutFailed
  ? "PRIVATE_SOURCE_CHECKOUT_FAILED"
  : "CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED";
const current = readHubFactsSync(outputPath, "bridge marker hub-facts input");
const nextObservation = {
  observedAt,
  disposition: "REFRESH_FAILED_LAST_GOOD_SOURCE_HELD",
  reasonCode,
  automaticBridgeConfiguredAtObservation: false,
  executionObservationStatus: "NOT_ATTESTED",
  currentOperationalStatus: "UNKNOWN",
};

if (JSON.stringify(current.refresh.latestRefreshObservation) === JSON.stringify(nextObservation)) {
  console.log("GALAXY_BRIDGE_ALREADY_INACTIVE");
  process.exit(0);
}

const { snapshotHash: _ignored, ...currentBody } = current;
const nextBody = {
  ...currentBody,
  refresh: {
    ...current.refresh,
    latestRefreshObservation: nextObservation,
  },
};
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
