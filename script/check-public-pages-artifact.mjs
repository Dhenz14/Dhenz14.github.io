#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hive-pages-integration-"));
const stage = path.join(temporaryRoot, "stage");

function run(relativeScript, args) {
  const result = spawnSync(process.execPath, [path.join(root, relativeScript), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0) {
    throw new Error(`${relativeScript} failed status=${result.status} signal=${result.signal || "none"}`);
  }
}

try {
  run("script/build-public-pages.mjs", ["build", "--output", stage]);
  run("script/build-public-pages.mjs", ["check", "--output", stage]);
  run("script/check-http-surface.mjs", ["--root", stage]);
  console.log("PUBLIC_PAGES_INTEGRATION_OK staged_http=closed residue=none");
} finally {
  const resolvedTemporaryRoot = await fs.realpath(temporaryRoot);
  const resolvedSystemTemp = await fs.realpath(os.tmpdir());
  const relative = path.relative(resolvedSystemTemp, resolvedTemporaryRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !path.basename(resolvedTemporaryRoot).startsWith("hive-pages-integration-")) {
    throw new Error("refusing to remove a temporary path outside the bounded integration-test root");
  }
  await fs.rm(resolvedTemporaryRoot, { recursive: true, force: true });
}
