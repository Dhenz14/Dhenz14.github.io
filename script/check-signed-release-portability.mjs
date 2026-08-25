#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonBytesStrict } from "../hub-assets/strict-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const useGitArchive = process.argv.includes("--git-archive");
const unknown = process.argv.slice(2).find((arg) => arg !== "--git-archive");
if (unknown) throw new Error(`unknown argument: ${unknown}`);

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hivepoa-portable-"));
const extractedRoot = path.join(temporaryRoot, "archive");

async function copyCurrentContract() {
  const fixturePath = path.join(root, ".github", "test-fixtures", "hivepoa", "portable-signed-release-fixture.v1.json");
  const fixture = parseJsonBytesStrict(await fs.readFile(fixturePath), "portable signed-release fixture");
  const receipt = parseJsonBytesStrict(
    await fs.readFile(path.join(root, fixture.historicalReceipt.path)),
    "historical HivePoA quarantine receipt",
  );
  const paths = [
    "script/check-signed-release.mjs",
    "hub-assets/strict-json.mjs",
    ".github/test-fixtures/hivepoa/portable-signed-release-fixture.v1.json",
    fixture.bindings.historicalIndex.path,
    fixture.bindings.authorizationModule.path,
    fixture.historicalReceipt.path,
    ...(receipt.quarantinedEntries ?? []).map((entry) => entry.path),
  ];
  let overlayCount = 0;
  for (const relative of paths) {
    const source = path.join(root, relative);
    const destination = path.join(extractedRoot, relative);
    let identical = false;
    try {
      identical = (await fs.readFile(source)).equals(await fs.readFile(destination));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (!identical) overlayCount += 1;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  return { overlayCount, paths };
}

try {
  await fs.mkdir(extractedRoot, { recursive: true });
  let candidateOverlayCount = 0;
  if (useGitArchive) {
    const archivePath = path.join(temporaryRoot, "site.tar");
    const tarBytes = execFileSync("git", ["archive", "--format=tar", "HEAD"], {
      cwd: root,
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
    await fs.writeFile(archivePath, tarBytes);
    execFileSync("tar", ["-xf", archivePath, "-C", extractedRoot], { cwd: root, stdio: "pipe" });
    // A local candidate is deliberately left uncommitted for independent
    // review, so overlay only the exact current portability contract before
    // exercising it without .git. Landed CI must need no such overlay.
    candidateOverlayCount = (await copyCurrentContract()).overlayCount;
    if (process.env.CI === "true" && candidateOverlayCount !== 0) {
      throw new Error(`committed Git archive omitted or drifted ${candidateOverlayCount} portability-contract paths`);
    }
  } else {
    await copyCurrentContract();
  }
  try {
    await fs.access(path.join(extractedRoot, ".git"));
    throw new Error("portability fixture unexpectedly contains .git");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const output = execFileSync(process.execPath, ["script/check-signed-release.mjs"], {
    cwd: extractedRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (!/provenance=PORTABLE_NO_GIT/.test(output)) {
    throw new Error("archive/no-git verification did not use portable evidence");
  }
  console.log(`SIGNED_RELEASE_PORTABILITY_OK mode=${useGitArchive ? "GIT_ARCHIVE" : "CURRENT_CONTRACT_COPY"} git_dir=ABSENT candidate_overlay=${candidateOverlayCount}`);
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
