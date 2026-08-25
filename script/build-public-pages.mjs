#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonBytesStrict } from "../hub-assets/strict-json.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(sourceRoot, ".github", "pages-public-allowlist.v1.json");
const quarantineTemplatePath = path.join(sourceRoot, ".github", "pages-templates", "hivepoa-quarantine.html");
const REQUIRED_FORBIDDEN_PREFIXES = Object.freeze([
  ".github/",
  "docs/",
  "fixtures/",
  "HivePoA/cid-mirrors/",
  "HivePoA/distribution-assets/",
  "script/",
  "tests/",
]);
const REQUIRED_PRIVATE_SOURCE_PATHS = Object.freeze([
  ".github/test-fixtures/hivepoa/historical-quarantine-receipt-a4ff709e5310.json",
  "HivePoA/.distribution-publish-receipt.json",
  "HivePoA/.nojekyll",
  "HivePoA/build-receipt.json",
  "HivePoA/hivepoa-distribution-boundary.json",
  "HivePoA/public-surface-quarantine-receipt.json",
  "HivePoA/README.md",
  "HivePoA/tester-network/STORAGE_POA_TESTER_NETWORK_RUNBOOK_20260802.md",
  "hub-assets/product-truth-ledger.v1.json",
  "README.md",
]);
const REQUIRED_FORBIDDEN_EXACT = Object.freeze([
  ".github/test-fixtures/hivepoa/historical-index-1a607c451406.html",
  ".github/test-fixtures/hivepoa/portable-signed-release-fixture.v1.json",
  ".github/test-fixtures/hivepoa/tester-network-authorization-3f397e3bc3a6.js",
  "HivePoA/.distribution-publish-receipt.json",
  "HivePoA/.nojekyll",
  "HivePoA/cid-mirrors/bafkreiatijblkzbvtdndxlme7rbx4r2zdfttoe44xahx7ab57fqplqshge.json",
  "HivePoA/cid-mirrors/bafkreibdvxhdmkxbnf6iqnvmloc3q3t2ngq34psakn5ys26yddn3z7xr5q.json",
  "HivePoA/cid-mirrors/bafkreicft4cqngoscw5c3st4bw6tvjc7a32gwhj2pysedmwedc7df7mu7y.json",
  "HivePoA/cid-mirrors/bafkreicglv7rvpweykprefu72z742ynj6by3p6vmwtnnqzti553njjvg24.json",
  "HivePoA/cid-mirrors/bafkreicnn2esivmzvtaqucmjcyysqixqaff2z32glicfs6ifsuckwvdc2a.json",
  "HivePoA/cid-mirrors/bafkreidt6fnduic6wijlhhmv3cf7jj7e2o2z4cxyndksrl4jb6npbubqa4.json",
  "HivePoA/cid-mirrors/bafkreiepwx7dxa4ljdfr2ygtclzfex7qhmwjpxdbgl54v6pcmdtjenpdaq.json",
  "HivePoA/cid-mirrors/bafkreifzenpkcb4pcu7ih5j3eb4jf6ooki6vnunxqg3bjd5a4tmrwwguly.json",
  "HivePoA/cid-mirrors/bafkreig7f36xgvlesj5htaobbdn6chigkp7jynselzxyqipo7ooa4fksqy.json",
  "HivePoA/cid-mirrors/bafkreiglr46qzxtrwyib37e5yskwmldk5pmiduaz5rdp2flg2gfjsnxhvu.json",
  "HivePoA/cid-mirrors/bafkreigztluszx7efo7h26g3k6fppisc6v5lgjeudld27typvtpjyc2mka.json",
  "HivePoA/cid-mirrors/bafkreih656qofx55wbzf4bjprmfk4pl57puazqjw6ixpn7g6wcxlp64fki.json",
  "HivePoA/cid-mirrors/bafkreihdfh5a2tig56aobhfmfjp5njxiguijg7ni2umy2bwxxigftaqeo4.json",
  "HivePoA/cid-mirrors/bafkreihhvomr6ncawwsg6fd4ma5rkrtkpsqgqzdyu4w6yd7egdzh7rqqte.json",
  "HivePoA/cid-mirrors/bafkreihnwn65vtnyrohj5vbi6efzv3vvlfholk7pz2nqirutic63qcevea.json",
  "HivePoA/cid-mirrors/bafkreihsrbx7h4sycmuf5mkmogpbvhqtbbhp7lajwxulrvjslsslzmjjky.json",
  "HivePoA/distribution-assets/distribution.css",
  "HivePoA/distribution-assets/distribution.js",
  "HivePoA/distribution-assets/tester-network-authorization.d.ts",
  "HivePoA/distribution-assets/tester-network-authorization.js",
  "hub-assets/product-truth-ledger.v1.json",
]);
const REQUIRED_QUARANTINE_ROUTES = Object.freeze([
  "HivePoA/distribution/index.html",
  "HivePoA/download/index.html",
  "HivePoA/get-started/index.html",
  "HivePoA/index.html",
  "HivePoA/releases/index.html",
  "HivePoA/tester-network/index.html",
  "HivePoA/verify/index.html",
]);

class PublicArtifactError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublicArtifactError";
    this.code = code;
  }
}

function reject(code, message) {
  throw new PublicArtifactError(code, message);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject("PUBLIC_ALLOWLIST_SCHEMA_INVALID", `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    reject("PUBLIC_ALLOWLIST_SCHEMA_INVALID", `${label} keys drifted`);
  }
}

function canonicalPublicPath(value, label) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.includes("\\") || value.includes("\0")) {
    reject("PUBLIC_ALLOWLIST_PATH_UNSAFE", `${label} is not a canonical POSIX-relative path`);
  }
  if (path.posix.isAbsolute(value) || path.posix.normalize(value) !== value || value === "." || value.startsWith("../") || value.includes("/../") || value.endsWith("/")) {
    reject("PUBLIC_ALLOWLIST_PATH_UNSAFE", `${label} escaped the artifact root`);
  }
  return value;
}

function canonicalForbiddenPrefix(value, label) {
  if (typeof value !== "string" || !value.endsWith("/") || value === "/") {
    reject("PUBLIC_ALLOWLIST_PATH_UNSAFE", `${label} must be a canonical directory prefix`);
  }
  canonicalPublicPath(value.slice(0, -1), label);
  return value;
}

function exactSortedUnique(values, label, canonicalizer = canonicalPublicPath) {
  if (!Array.isArray(values)) reject("PUBLIC_ALLOWLIST_SCHEMA_INVALID", `${label} must be an array`);
  const canonical = values.map((value, index) => canonicalizer(value, `${label}[${index}]`));
  const sorted = [...canonical].sort((left, right) => left.localeCompare(right, "en"));
  if (canonical.some((value, index) => value !== sorted[index])) reject("PUBLIC_ALLOWLIST_NOT_SORTED", `${label} must remain sorted`);
  const folded = canonical.map((value) => value.toLocaleLowerCase("en-US"));
  if (new Set(folded).size !== folded.length) reject("PUBLIC_ALLOWLIST_DUPLICATE_PATH", `${label} contains a duplicate or case-colliding path`);
  return canonical;
}

function exactSequence(actual, expected, code, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) reject(code, `${label} drifted`);
}

function validateManifest(value) {
  exactKeys(value, [
    "schema", "artifactPolicy", "publicFiles", "generatedFiles", "deliberatePublicJson", "forbiddenPrefixes",
    "generatedQuarantineRoutes", "privateSourceOnlyPaths", "forbiddenExactPaths",
  ], "public allowlist");
  if (value.schema !== "hive.pages.reviewed-public-allowlist.v1" || value.artifactPolicy !== "BRAND_NEW_EMPTY_STAGE_EXACT_MEMBERSHIP") {
    reject("PUBLIC_ALLOWLIST_SCHEMA_INVALID", "public allowlist identity drifted");
  }
  const publicFiles = exactSortedUnique(value.publicFiles, "publicFiles");
  const deliberatePublicJson = exactSortedUnique(value.deliberatePublicJson, "deliberatePublicJson");
  const generatedQuarantineRoutes = exactSortedUnique(value.generatedQuarantineRoutes, "generatedQuarantineRoutes");
  const forbiddenPrefixes = exactSortedUnique(value.forbiddenPrefixes, "forbiddenPrefixes", canonicalForbiddenPrefix);
  const privateSourceOnlyPaths = exactSortedUnique(value.privateSourceOnlyPaths, "privateSourceOnlyPaths");
  const forbiddenExactPaths = exactSortedUnique(value.forbiddenExactPaths, "forbiddenExactPaths");
  exactSequence(forbiddenPrefixes, REQUIRED_FORBIDDEN_PREFIXES, "PUBLIC_ALLOWLIST_REQUIRED_PREFIX_MISSING", "required forbidden prefixes");
  exactSequence(privateSourceOnlyPaths, REQUIRED_PRIVATE_SOURCE_PATHS, "PUBLIC_ALLOWLIST_PRIVATE_PATH_MISSING", "private source-only paths");
  exactSequence(forbiddenExactPaths, REQUIRED_FORBIDDEN_EXACT, "PUBLIC_ALLOWLIST_FORBIDDEN_PATH_MISSING", "26 exact forbidden publication paths");
  exactSequence(generatedQuarantineRoutes, REQUIRED_QUARANTINE_ROUTES, "PUBLIC_ALLOWLIST_QUARANTINE_ROUTE_DRIFT", "generated HivePoA quarantine routes");
  if (forbiddenExactPaths.length !== 26) reject("PUBLIC_ALLOWLIST_FORBIDDEN_PATH_MISSING", "the original 25 retired/fixture/private control paths plus the private Product Truth ledger must remain forbidden");
  if (!Array.isArray(value.generatedFiles) || value.generatedFiles.length !== 1) reject("PUBLIC_ALLOWLIST_SCHEMA_INVALID", "generatedFiles must contain only .nojekyll");
  exactKeys(value.generatedFiles[0], ["path", "content"], "generatedFiles[0]");
  if (canonicalPublicPath(value.generatedFiles[0].path, "generatedFiles[0].path") !== ".nojekyll" || value.generatedFiles[0].content !== "") {
    reject("PUBLIC_ALLOWLIST_SCHEMA_INVALID", "the only generated public member must be an empty .nojekyll");
  }
  const publicSet = new Set(publicFiles);
  if (generatedQuarantineRoutes.some((candidate) => publicSet.has(candidate))) {
    reject("PUBLIC_ALLOWLIST_QUARANTINE_ROUTE_DRIFT", "HivePoA quarantine destinations must be generated from the reviewed canonical template");
  }
  for (const candidate of publicFiles) {
    if (forbiddenPrefixes.some((prefix) => candidate.startsWith(prefix)) || privateSourceOnlyPaths.includes(candidate) || forbiddenExactPaths.includes(candidate)) {
      reject("PUBLIC_ALLOWLIST_PRIVATE_PATH_ADMITTED", `private path entered public allowlist: ${candidate}`);
    }
    if (/(?:^|\/)(?:README\.md|.*receipt.*|.*runbook.*)$/i.test(candidate) || candidate.includes("test-fixtures")) {
      reject("PUBLIC_ALLOWLIST_PRIVATE_PATH_ADMITTED", `receipt/runbook/fixture path entered public allowlist: ${candidate}`);
    }
  }
  const publicJson = publicFiles.filter((candidate) => candidate.endsWith(".json"));
  exactSequence(publicJson, deliberatePublicJson, "PUBLIC_ALLOWLIST_JSON_NOT_DELIBERATE", "deliberate public JSON set");
  for (const deliberate of deliberatePublicJson) {
    if (!publicSet.has(deliberate)) reject("PUBLIC_ALLOWLIST_JSON_NOT_DELIBERATE", `deliberate JSON is not public: ${deliberate}`);
  }
  return Object.freeze({ ...value, publicFiles, deliberatePublicJson, generatedQuarantineRoutes, forbiddenPrefixes, privateSourceOnlyPaths, forbiddenExactPaths });
}

async function loadManifest() {
  const bytes = await fs.readFile(manifestPath);
  if (bytes.byteLength > 64 * 1024) reject("PUBLIC_ALLOWLIST_TOO_LARGE", "public allowlist exceeds 64 KiB");
  return validateManifest(parseJsonBytesStrict(bytes, "Pages public allowlist"));
}

function resolveInside(base, relative, label) {
  canonicalPublicPath(relative, label);
  const resolved = path.resolve(base, ...relative.split("/"));
  if (resolved === base || !resolved.startsWith(`${base}${path.sep}`)) reject("PUBLIC_ALLOWLIST_PATH_UNSAFE", `${label} escaped its root`);
  return resolved;
}

async function assertRegularSingleLink(filePath, label) {
  const metadata = await fs.lstat(filePath);
  if (metadata.isSymbolicLink()) reject("PUBLIC_ARTIFACT_SYMLINK_FORBIDDEN", `${label} is a symlink`);
  if (!metadata.isFile()) reject("PUBLIC_ARTIFACT_MEMBER_TYPE_INVALID", `${label} is not a regular file`);
  if (Number.isInteger(metadata.nlink) && metadata.nlink !== 1) reject("PUBLIC_ARTIFACT_HARDLINK_FORBIDDEN", `${label} has link count ${metadata.nlink}`);
  return metadata;
}

async function walkArtifact(directory, relative = "", directories = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const member = relative ? `${relative}/${entry.name}` : entry.name;
    canonicalPublicPath(member, "artifact member");
    const memberPath = path.join(directory, entry.name);
    const metadata = await fs.lstat(memberPath);
    if (metadata.isSymbolicLink()) reject("PUBLIC_ARTIFACT_SYMLINK_FORBIDDEN", `artifact member is a symlink: ${member}`);
    if (metadata.isDirectory()) {
      directories.push(member);
      files.push(...await walkArtifact(memberPath, member, directories));
    }
    else if (metadata.isFile()) {
      if (Number.isInteger(metadata.nlink) && metadata.nlink !== 1) reject("PUBLIC_ARTIFACT_HARDLINK_FORBIDDEN", `artifact member has link count ${metadata.nlink}: ${member}`);
      files.push(member);
    } else reject("PUBLIC_ARTIFACT_MEMBER_TYPE_INVALID", `unsupported artifact member: ${member}`);
  }
  return files;
}

function exactAncestorDirectories(members) {
  const directories = new Set();
  for (const member of members) {
    const segments = member.split("/");
    for (let index = 1; index < segments.length; index += 1) directories.add(segments.slice(0, index).join("/"));
  }
  return [...directories].sort((left, right) => left.localeCompare(right, "en"));
}

function resolveOutput(rawOutput) {
  if (typeof rawOutput !== "string" || !rawOutput) reject("PUBLIC_ARTIFACT_OUTPUT_REQUIRED", "--output is required");
  const output = path.resolve(rawOutput);
  if (output === sourceRoot || output.startsWith(`${sourceRoot}${path.sep}`)) reject("PUBLIC_ARTIFACT_OUTPUT_INSIDE_SOURCE", "staging output must be outside the repository");
  return output;
}

async function checkArtifact(output, admittedManifest = null) {
  const manifest = admittedManifest || await loadManifest();
  const outputRoot = resolveOutput(output);
  const metadata = await fs.lstat(outputRoot).catch((error) => {
    if (error?.code === "ENOENT") reject("PUBLIC_ARTIFACT_MISSING", "staged artifact does not exist");
    throw error;
  });
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) reject("PUBLIC_ARTIFACT_ROOT_INVALID", "staged artifact root must be a real directory");
  const expected = [...manifest.publicFiles, ...manifest.generatedFiles.map((entry) => entry.path), ...manifest.generatedQuarantineRoutes].sort((left, right) => left.localeCompare(right, "en"));
  const actualDirectories = [];
  const actual = (await walkArtifact(outputRoot, "", actualDirectories)).sort((left, right) => left.localeCompare(right, "en"));
  actualDirectories.sort((left, right) => left.localeCompare(right, "en"));
  const expectedDirectories = exactAncestorDirectories(expected);
  if (actualDirectories.length !== expectedDirectories.length || actualDirectories.some((entry, index) => entry !== expectedDirectories[index])) {
    reject("PUBLIC_ARTIFACT_DIRECTORY_MEMBERSHIP_MISMATCH", `staged directory membership drifted\nactual=${JSON.stringify(actualDirectories)}\nexpected=${JSON.stringify(expectedDirectories)}`);
  }
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    reject("PUBLIC_ARTIFACT_MEMBERSHIP_MISMATCH", `staged membership drifted\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
  const noJekyll = await fs.readFile(resolveInside(outputRoot, ".nojekyll", ".nojekyll"));
  if (noJekyll.byteLength !== 0) reject("PUBLIC_ARTIFACT_GENERATED_MEMBER_DRIFT", ".nojekyll must remain empty");
  return Object.freeze({ outputRoot, members: actual.length });
}

async function buildArtifact(output) {
  const manifest = await loadManifest();
  const outputRoot = resolveOutput(output);
  try {
    await fs.mkdir(outputRoot);
  } catch (error) {
    if (error?.code === "EEXIST") reject("PUBLIC_ARTIFACT_OUTPUT_NOT_NEW", "staging output already exists; a brand-new path is required");
    throw error;
  }
  for (const relative of manifest.publicFiles) {
    const source = resolveInside(sourceRoot, relative, `source ${relative}`);
    await assertRegularSingleLink(source, `source ${relative}`);
    const destination = resolveInside(outputRoot, relative, `destination ${relative}`);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    await assertRegularSingleLink(destination, `staged ${relative}`);
  }
  for (const generated of manifest.generatedFiles) {
    const destination = resolveInside(outputRoot, generated.path, `generated ${generated.path}`);
    await fs.writeFile(destination, generated.content, { encoding: "utf8", flag: "wx" });
    await assertRegularSingleLink(destination, `generated ${generated.path}`);
  }
  const templateMetadata = await assertRegularSingleLink(quarantineTemplatePath, "canonical HivePoA quarantine template");
  if (templateMetadata.size < 1024 || templateMetadata.size > 64 * 1024) reject("PUBLIC_ARTIFACT_QUARANTINE_TEMPLATE_INVALID", "HivePoA quarantine template escaped its byte envelope");
  const quarantineBytes = await fs.readFile(quarantineTemplatePath);
  const quarantineText = new TextDecoder("utf-8", { fatal: true }).decode(quarantineBytes);
  if (/<script\b/i.test(quarantineText)
    || !/default-src 'none'/.test(quarantineText)
    || !/HOLD · NO PUBLIC ACTIONS/.test(quarantineText)
    || !/Runtime and product-live UNKNOWN/.test(quarantineText)
    || (quarantineText.match(/<a\b/g) || []).length !== 1) {
    reject("PUBLIC_ARTIFACT_QUARANTINE_TEMPLATE_INVALID", "HivePoA quarantine template is not one scriptless, actionless, UNKNOWN-safe panel");
  }
  for (const relative of manifest.generatedQuarantineRoutes) {
    const destination = resolveInside(outputRoot, relative, `generated quarantine ${relative}`);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, quarantineBytes, { flag: "wx" });
    await assertRegularSingleLink(destination, `generated quarantine ${relative}`);
  }
  return checkArtifact(outputRoot, manifest);
}

async function expectError(label, expectedCode, callback) {
  try {
    await callback();
  } catch (error) {
    if (error instanceof PublicArtifactError && error.code === expectedCode) return;
    throw new Error(`${label} returned ${error?.code || error?.name || typeof error}; expected ${expectedCode}`);
  }
  throw new Error(`${label} did not fail with ${expectedCode}`);
}

async function selfTest() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hive-pages-builder-"));
  const stage = path.join(temporaryRoot, "stage");
  let symlinkCase = "tested";
  try {
    const built = await buildArtifact(stage);
    await checkArtifact(stage);
    await expectError("non-empty/reused output refused", "PUBLIC_ARTIFACT_OUTPUT_NOT_NEW", async () => buildArtifact(stage));
    await fs.writeFile(path.join(stage, "unexpected.txt"), "not public", "utf8");
    await expectError("unlisted member refused", "PUBLIC_ARTIFACT_MEMBERSHIP_MISMATCH", async () => checkArtifact(stage));
    await fs.unlink(path.join(stage, "unexpected.txt"));
    await fs.mkdir(path.join(stage, "unexpected-empty"));
    await expectError("unlisted empty directory refused", "PUBLIC_ARTIFACT_DIRECTORY_MEMBERSHIP_MISMATCH", async () => checkArtifact(stage));
    await fs.rmdir(path.join(stage, "unexpected-empty"));
    await fs.mkdir(path.join(stage, ".github"));
    await expectError("forbidden-prefix empty directory refused", "PUBLIC_ARTIFACT_DIRECTORY_MEMBERSHIP_MISMATCH", async () => checkArtifact(stage));
    await fs.rmdir(path.join(stage, ".github"));
    await fs.link(path.join(stage, "index.html"), path.join(stage, "hard-link.html"));
    await expectError("hard link refused", "PUBLIC_ARTIFACT_HARDLINK_FORBIDDEN", async () => checkArtifact(stage));
    await fs.unlink(path.join(stage, "hard-link.html"));
    try {
      await fs.symlink(path.join(stage, "index.html"), path.join(stage, "symbolic.html"));
      await expectError("symlink refused", "PUBLIC_ARTIFACT_SYMLINK_FORBIDDEN", async () => checkArtifact(stage));
      await fs.unlink(path.join(stage, "symbolic.html"));
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") symlinkCase = "platform-skipped";
      else throw error;
    }
    const manifest = await loadManifest();
    await expectError("unsafe path refused", "PUBLIC_ALLOWLIST_PATH_UNSAFE", async () => validateManifest({ ...manifest, publicFiles: [...manifest.publicFiles.slice(0, -1), "../escape"] }));
    await expectError("forbidden exact path set frozen", "PUBLIC_ALLOWLIST_FORBIDDEN_PATH_MISSING", async () => validateManifest({ ...manifest, forbiddenExactPaths: manifest.forbiddenExactPaths.slice(1) }));
    console.log(`PUBLIC_PAGES_BUILDER_SELF_TEST_OK members=${built.members} forbidden_exact=${manifest.forbiddenExactPaths.length} symlink=${symlinkCase}`);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

try {
  if (process.argv.includes("--self-test")) await selfTest();
  else {
    const command = process.argv[2];
    const output = argumentValue("--output");
    if (command === "build") {
      const result = await buildArtifact(output);
      console.log(`PUBLIC_PAGES_ARTIFACT_BUILT root=${result.outputRoot} members=${result.members}`);
    } else if (command === "check") {
      const result = await checkArtifact(output);
      console.log(`PUBLIC_PAGES_ARTIFACT_OK root=${result.outputRoot} members=${result.members}`);
    } else reject("PUBLIC_ARTIFACT_COMMAND_INVALID", "use build --output PATH, check --output PATH, or --self-test");
  }
} catch (error) {
  const code = error?.code || error?.name || "PUBLIC_ARTIFACT_UNEXPECTED_ERROR";
  console.error(`${code}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
