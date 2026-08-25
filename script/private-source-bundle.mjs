#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonBytesStrict } from "../hub-assets/strict-json.mjs";

const SCHEMA = "hive.private-source.materialization.v1";
const BINDING_NAME = "private-source-binding.json";
const SOURCE_DIRECTORY = "source";
const MAX_FILES = 12_000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const EXACT_PATHS = new Set([
  "configs/federation_manifest.json",
  "data/neuron_swarm/portable_green_evidence_membership_20260722.json",
  "docs/FORMAL_CORTEX_LEDGER_V1.json",
  "docs/HIVE_INTEGRITY_DEPENDENCY_GRAPH.json",
  "docs/UNIFIED_CAPABILITY_REGISTRY.json",
  "docs/generated/proof_carrying_memory_galaxy.mmd",
  "hiveai/__init__.py",
  "hiveai/_optional_scripts.py",
  "hiveai/moons/universal_manifest.py",
  "hiveai/static/living-anatomy/src/galaxy-contract.json",
  "scripts/audit_served_influence_reachability.py",
  "scripts/build_living_anatomy.py",
  "scripts/build_neuron_dossiers.py",
  "scripts/materialize_full_neuron_swarm.py",
  "tests/fixtures/physiology/formal_l3_e01_v2/RATIFY_L3_E01_V2.json",
  "tests/fixtures/physiology/formal_l3_e02/window_seal/RATIFY_L3_E02_V1.json",
]);

const PREFIXES = Object.freeze([
  "configs/hivebrain/",
  "docs/c14_moon_lattice/",
  "docs/handoffs/",
  "docs/soak_receipts/neuron_swarm/",
  "docs/soak_receipts/physiology/",
  "docs/soak_receipts/proof_carrying_memory_fabric_20260727/",
  "hiveai/living_anatomy/",
  "hiveai/neuron_swarm/",
  "hiveai/one_turn/",
  "hiveai/orbs/",
  "hiveai/physiology/",
]);

function fail(message) {
  throw new Error(`private source bundle refused: ${message}`);
}

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : String(process.argv[index + 1] || "").trim();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobOid(bytes) {
  return crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeRelativePath(value) {
  const candidate = String(value || "");
  if (!candidate
    || candidate !== candidate.normalize("NFC")
    || candidate.includes("\\")
    || candidate.includes("\0")
    || /[\u0000-\u001f\u007f]/u.test(candidate)
    || path.posix.isAbsolute(candidate)
    || path.posix.normalize(candidate) !== candidate
    || candidate === "."
    || candidate === ".."
    || candidate.startsWith("../")
    || candidate.split("/").some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) {
    fail(`unsafe path: ${candidate || "missing"}`);
  }
  return candidate;
}

function allowedSourcePath(value) {
  const repositoryPath = safeRelativePath(value);
  if (EXACT_PATHS.has(repositoryPath)) return true;
  if (PREFIXES.some((prefix) => repositoryPath.startsWith(prefix))) return true;
  if (/^docs\/soak_receipts\/[^/]+\.jsonl?$/u.test(repositoryPath)) return true;
  return /^schemas\/living_anatomy_[^/]+\.schema\.json$/u.test(repositoryPath);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function runBytes(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: null,
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function ensureFreshDirectory(directory) {
  if (fs.existsSync(directory)) fail(`output already exists: ${directory}`);
  fs.mkdirSync(directory, { recursive: false });
}

function strictUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} is not strict UTF-8`);
  }
}

function sourceEntries(repository, commit) {
  const listing = runBytes("git", ["-C", repository, "ls-tree", "-r", "-z", commit]);
  const records = [];
  for (const rawRecord of listing.subarray(0, listing.length - (listing.at(-1) === 0 ? 1 : 0)).toString("binary").split("\0")) {
    if (!rawRecord) continue;
    const record = strictUtf8(Buffer.from(rawRecord, "binary"), "Git tree record");
    const match = record.match(/^(\d{6})\s+(\S+)\s+([a-f0-9]{40})\t([\s\S]+)$/u);
    if (!match) fail("Git tree contains an unreadable record");
    const repositoryPath = safeRelativePath(match[4]);
    if (!allowedSourcePath(repositoryPath)) continue;
    if (match[2] !== "blob" || !/^(100644|100755)$/u.test(match[1])) {
      fail(`unsupported tracked entry at ${repositoryPath}: ${match[1]} ${match[2]}`);
    }
    records.push({ mode: match[1], objectId: match[3], path: repositoryPath });
  }
  records.sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (records.length < EXACT_PATHS.size || records.length > MAX_FILES) {
    fail(`materialized path count is outside ${EXACT_PATHS.size}..${MAX_FILES}: ${records.length}`);
  }
  const paths = new Set(records.map((entry) => entry.path));
  for (const required of EXACT_PATHS) {
    if (!paths.has(required)) fail(`required source path is absent: ${required}`);
  }
  return records;
}

function renderBinding(binding) {
  return `${JSON.stringify(binding, null, 2)}\n`;
}

function createBundle(repositoryValue, outputValue) {
  const repository = path.resolve(repositoryValue);
  const output = path.resolve(outputValue);
  const commit = run("git", ["-C", repository, "rev-parse", "HEAD^{commit}"]);
  const tree = run("git", ["-C", repository, "rev-parse", "HEAD^{tree}"]);
  const objectFormat = run("git", ["-C", repository, "rev-parse", "--show-object-format"]);
  if (!SHA1.test(commit) || !SHA1.test(tree) || objectFormat !== "sha1") {
    fail("source checkout is not an exact SHA-1 commit/tree");
  }
  const status = run("git", ["-C", repository, "status", "--porcelain", "--untracked-files=all"]);
  if (status) fail("source checkout is not clean");
  const entries = sourceEntries(repository, commit);
  ensureFreshDirectory(output);
  const sourceRoot = path.join(output, SOURCE_DIRECTORY);
  fs.mkdirSync(sourceRoot);
  let totalBytes = 0;
  const files = [];
  for (const entry of entries) {
    const bytes = runBytes("git", ["-C", repository, "cat-file", "blob", entry.objectId]);
    if (bytes.length > MAX_FILE_BYTES) fail(`source file exceeds ${MAX_FILE_BYTES} bytes: ${entry.path}`);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) fail(`source material exceeds ${MAX_TOTAL_BYTES} bytes`);
    if (gitBlobOid(bytes) !== entry.objectId) fail(`Git blob identity mismatch: ${entry.path}`);
    const destination = path.join(sourceRoot, ...entry.path.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { mode: entry.mode === "100755" ? 0o755 : 0o644, flag: "wx" });
    files.push({
      path: entry.path,
      mode: entry.mode,
      bytes: bytes.length,
      sha256: sha256(bytes),
      gitBlobOid: entry.objectId,
    });
  }
  const body = {
    schema: SCHEMA,
    status: "SOURCE_MATERIALIZED",
    sourceRepository: "Dhenz14/Hive-AI",
    sourceBranch: "main",
    sourceCommit: commit,
    sourceTree: tree,
    pathPolicy: "EXACT_REVIEWED_COMPILER_INPUT_SET_V1",
    fileCount: files.length,
    totalBytes,
    files,
  };
  const binding = { ...body, manifestSha256: sha256(Buffer.from(canonicalJson(body))) };
  fs.writeFileSync(path.join(output, BINDING_NAME), renderBinding(binding), { mode: 0o644, flag: "wx" });
  return binding;
}

function createInactiveBundle(outputValue, reasonValue) {
  const output = path.resolve(outputValue);
  const reason = reasonValue === "CHECKOUT_FAILED" ? "CHECKOUT_FAILED" : "CREDENTIAL_NOT_CONFIGURED";
  ensureFreshDirectory(output);
  const body = {
    schema: SCHEMA,
    status: "SOURCE_INACTIVE",
    reason,
    pathPolicy: "NO_PRIVATE_SOURCE_MATERIALIZED",
    fileCount: 0,
    totalBytes: 0,
    files: [],
  };
  const binding = { ...body, manifestSha256: sha256(Buffer.from(canonicalJson(body))) };
  fs.writeFileSync(path.join(output, BINDING_NAME), renderBinding(binding), { mode: 0o644, flag: "wx" });
  return binding;
}

function listTree(root, { allowPreparedGit = false } = {}) {
  const files = [];
  const directories = new Set([""]);
  const walk = (directory, relative) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      safeRelativePath(childRelative);
      const child = path.join(directory, entry.name);
      const stat = fs.lstatSync(child);
      if (stat.isSymbolicLink() || (entry.isFile() && stat.nlink !== 1)) fail(`ambiguous link entry: ${childRelative}`);
      if (entry.isDirectory()) {
        if (allowPreparedGit && childRelative === `${SOURCE_DIRECTORY}/.git`) continue;
        if (entry.name === ".git") fail(`forbidden .git directory: ${childRelative}`);
        directories.add(childRelative);
        walk(child, childRelative);
      } else if (entry.isFile()) {
        files.push(childRelative);
      } else {
        fail(`unsupported filesystem entry: ${childRelative}`);
      }
    }
  };
  walk(root, "");
  return { files, directories };
}

function expectedDirectories(filePaths) {
  const expected = new Set([""]);
  for (const filePath of filePaths) {
    const parts = filePath.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      expected.add(current);
    }
  }
  return expected;
}

function readAndVerifyBundle(bundleValue, { allowPreparedGit = false } = {}) {
  const bundle = path.resolve(bundleValue);
  const bindingPath = path.join(bundle, BINDING_NAME);
  const binding = parseJsonBytesStrict(fs.readFileSync(bindingPath), "private source binding");
  if (binding?.schema !== SCHEMA
    || !["SOURCE_MATERIALIZED", "SOURCE_INACTIVE"].includes(binding.status)
    || !Array.isArray(binding.files)
    || !Number.isSafeInteger(binding.fileCount)
    || !Number.isSafeInteger(binding.totalBytes)
    || !SHA256.test(binding.manifestSha256 || "")) {
    fail("binding schema is invalid");
  }
  const body = { ...binding };
  delete body.manifestSha256;
  if (sha256(Buffer.from(canonicalJson(body))) !== binding.manifestSha256) fail("binding self-hash mismatch");
  if (binding.fileCount !== binding.files.length || binding.fileCount > MAX_FILES || binding.totalBytes > MAX_TOTAL_BYTES) {
    fail("binding counts escape the bounded envelope");
  }
  const expectedFiles = [BINDING_NAME];
  if (binding.status === "SOURCE_INACTIVE") {
    if (binding.fileCount !== 0 || binding.totalBytes !== 0 || binding.files.length !== 0
      || !["CREDENTIAL_NOT_CONFIGURED", "CHECKOUT_FAILED"].includes(binding.reason)) {
      fail("inactive binding carries source material or an unknown reason");
    }
  } else {
    if (!SHA1.test(binding.sourceCommit || "") || !SHA1.test(binding.sourceTree || "")
      || binding.sourceRepository !== "Dhenz14/Hive-AI" || binding.sourceBranch !== "main") {
      fail("materialized binding lacks exact source identity");
    }
    const seen = new Set();
    let total = 0;
    for (const entry of binding.files) {
      const repositoryPath = safeRelativePath(entry?.path);
      if (!allowedSourcePath(repositoryPath) || seen.has(repositoryPath)
        || !/^(100644|100755)$/u.test(entry?.mode || "")
        || !Number.isSafeInteger(entry?.bytes) || entry.bytes < 0 || entry.bytes > MAX_FILE_BYTES
        || !SHA256.test(entry?.sha256 || "") || !SHA1.test(entry?.gitBlobOid || "")) {
        fail(`invalid bound file entry: ${repositoryPath}`);
      }
      seen.add(repositoryPath);
      const bytes = fs.readFileSync(path.join(bundle, SOURCE_DIRECTORY, ...repositoryPath.split("/")));
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256 || gitBlobOid(bytes) !== entry.gitBlobOid) {
        fail(`materialized bytes do not match binding: ${repositoryPath}`);
      }
      total += bytes.length;
      expectedFiles.push(`${SOURCE_DIRECTORY}/${repositoryPath}`);
    }
    for (const required of EXACT_PATHS) if (!seen.has(required)) fail(`required source path is unbound: ${required}`);
    if (total !== binding.totalBytes) fail("materialized total byte count mismatch");
  }
  expectedFiles.sort();
  const observed = listTree(bundle, { allowPreparedGit });
  if (observed.files.sort().join("\n") !== expectedFiles.join("\n")) fail("bundle contains an unlisted file");
  const expectedDirs = expectedDirectories(expectedFiles);
  if ([...observed.directories].sort().join("\n") !== [...expectedDirs].sort().join("\n")) {
    fail("bundle contains an unexpected or empty directory");
  }
  return binding;
}

function prepareCompilerCheckout(bundleValue) {
  const bundle = path.resolve(bundleValue);
  const binding = readAndVerifyBundle(bundle);
  if (binding.status !== "SOURCE_MATERIALIZED") fail("inactive materialization cannot become a compiler checkout");
  const source = path.join(bundle, SOURCE_DIRECTORY);
  run("git", ["-C", source, "init", "--quiet"]);
  run("git", ["-C", source, "config", "user.name", "hive-source-materializer"]);
  run("git", ["-C", source, "config", "user.email", "materializer@example.invalid"]);
  run("git", ["-C", source, "add", "--all"]);
  run("git", ["-C", source, "commit", "--quiet", "-m", "Materialized compiler input"], {
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
    },
  });
  return binding;
}

function expectFailure(callback, label) {
  let failed = false;
  try { callback(); } catch { failed = true; }
  if (!failed) fail(`self-test mutation passed: ${label}`);
}

function selfTest() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hive-private-source-bundle-"));
  try {
    expectFailure(() => allowedSourcePath("hiveai/living_anatomy/.git/config"), "source .git path");
    const repository = path.join(temporary, "repository");
    fs.mkdirSync(repository);
    run("git", ["-C", repository, "init", "--quiet"]);
    run("git", ["-C", repository, "config", "user.name", "fixture"]);
    run("git", ["-C", repository, "config", "user.email", "fixture@example.invalid"]);
    for (const repositoryPath of EXACT_PATHS) {
      const destination = path.join(repository, ...repositoryPath.split("/"));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, `${repositoryPath}\n`, "utf8");
    }
    const credentialProbePath = path.join(repository, "hiveai", "living_anatomy", "credential_probe.mjs");
    fs.mkdirSync(path.dirname(credentialProbePath), { recursive: true });
    fs.writeFileSync(credentialProbePath, [
      'import { execFileSync } from "node:child_process";',
      'let localSshCommand = "";',
      'try { localSshCommand = execFileSync("git", ["config", "--local", "--get", "core.sshCommand"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}',
      'console.log(JSON.stringify({ deployKey: process.env.HIVE_AI_READ_DEPLOY_KEY || "", gitSshCommand: process.env.GIT_SSH_COMMAND || "", localSshCommand }));',
      "",
    ].join("\n"), "utf8");
    fs.writeFileSync(path.join(repository, "ignored-private.txt"), "must not cross\n", "utf8");
    run("git", ["-C", repository, "add", "--all"]);
    run("git", ["-C", repository, "commit", "--quiet", "-m", "fixture"]);
    const bundle = path.join(temporary, "bundle");
    const binding = createBundle(repository, bundle);
    if (binding.fileCount !== EXACT_PATHS.size + 1 || binding.totalBytes < 1) fail("self-test bundle counts are wrong");
    readAndVerifyBundle(bundle);
    const first = binding.files[0].path;
    fs.appendFileSync(path.join(bundle, SOURCE_DIRECTORY, ...first.split("/")), "x");
    expectFailure(() => readAndVerifyBundle(bundle), "one-byte mutation");
    fs.writeFileSync(
      path.join(bundle, SOURCE_DIRECTORY, ...first.split("/")),
      `${first}\n`,
      "utf8",
    );
    const empty = path.join(bundle, SOURCE_DIRECTORY, "unexpected-empty");
    fs.mkdirSync(empty);
    expectFailure(() => readAndVerifyBundle(bundle), "unexpected empty directory");
    fs.rmdirSync(empty);
    const forbidden = path.join(bundle, SOURCE_DIRECTORY, ".git");
    fs.mkdirSync(forbidden);
    expectFailure(() => readAndVerifyBundle(bundle), "forbidden .git directory");
    fs.rmdirSync(forbidden);
    prepareCompilerCheckout(bundle);
    const isolatedEnvironment = { ...process.env };
    delete isolatedEnvironment.HIVE_AI_READ_DEPLOY_KEY;
    delete isolatedEnvironment.GIT_SSH_COMMAND;
    const credentialProbe = JSON.parse(run(process.execPath, [
      path.join(bundle, SOURCE_DIRECTORY, "hiveai", "living_anatomy", "credential_probe.mjs"),
    ], { cwd: path.join(bundle, SOURCE_DIRECTORY), env: isolatedEnvironment }));
    if (credentialProbe.deployKey || credentialProbe.gitSshCommand || credentialProbe.localSshCommand) {
      fail("credential-free source import discovered checkout credential state");
    }
    const inactive = path.join(temporary, "inactive");
    createInactiveBundle(inactive, "CREDENTIAL_NOT_CONFIGURED");
    const inactiveBinding = readAndVerifyBundle(inactive);
    if (inactiveBinding.status !== "SOURCE_INACTIVE") fail("inactive fixture did not verify");
    console.log(`PRIVATE_SOURCE_BUNDLE_OK files=${binding.fileCount} exact_bytes_hashes=true git_identity_bound=true empty_dirs_refused=true dotgit_refused=true credential_probe=isolated inactive=true residue=none`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const command = process.argv[2];
    if (command === "create") {
      const binding = createBundle(option("--source"), option("--output"));
      console.log(`PRIVATE_SOURCE_MATERIALIZED commit=${binding.sourceCommit} tree=${binding.sourceTree} files=${binding.fileCount} bytes=${binding.totalBytes}`);
    } else if (command === "inactive") {
      const binding = createInactiveBundle(option("--output"), option("--reason"));
      console.log(`PRIVATE_SOURCE_INACTIVE reason=${binding.reason}`);
    } else if (command === "verify") {
      const binding = readAndVerifyBundle(option("--bundle"));
      console.log(`PRIVATE_SOURCE_BUNDLE_VERIFIED status=${binding.status} files=${binding.fileCount} bytes=${binding.totalBytes}`);
    } else if (command === "prepare") {
      const binding = prepareCompilerCheckout(option("--bundle"));
      console.log(`PRIVATE_SOURCE_COMPILER_CHECKOUT_READY source_commit=${binding.sourceCommit}`);
    } else if (command === "field") {
      const binding = readAndVerifyBundle(option("--bundle"));
      const field = option("--name");
      if (!Object.hasOwn(binding, field) || typeof binding[field] === "object") fail(`unsupported field: ${field}`);
      console.log(String(binding[field]));
    } else if (command === "--self-test") {
      selfTest();
    } else {
      fail("expected create, inactive, verify, prepare, field, or --self-test");
    }
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}

export {
  allowedSourcePath,
  createBundle,
  createInactiveBundle,
  prepareCompilerCheckout,
  readAndVerifyBundle,
};
