#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifierPath = path.join(root, "HivePoA", "distribution-assets", "tester-network-authorization.js");
const htmlPath = path.join(root, "HivePoA", "index.html");
const verifierSource = await fs.readFile(verifierPath, "utf8");
const verifierUrl = `data:text/javascript;base64,${Buffer.from(verifierSource).toString("base64")}`;
const { verifyAuthorizedTesterNetworkIndex } = await import(verifierUrl);
const html = await fs.readFile(htmlPath, "utf8");
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

console.log(`SIGNED_RELEASE_OK version=${accepted.release.version} sequence=${accepted.release.releaseSequence} negative_cases=4`);
