#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const current = JSON.parse(fs.readFileSync(outputPath, "utf8"));
const nextRefresh = {
  privateSourceMode: "manual-source-bound-snapshot",
  automaticBridgeEnabled: false,
  reasonCode,
  lastGoodBehavior: "retain_previous_snapshot",
};

if (JSON.stringify(current.refresh) === JSON.stringify(nextRefresh)) {
  console.log("GALAXY_BRIDGE_ALREADY_INACTIVE");
  process.exit(0);
}

const next = { ...current, refresh: nextRefresh };
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
