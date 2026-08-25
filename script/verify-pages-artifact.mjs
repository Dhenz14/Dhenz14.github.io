#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import { parseJsonBytesStrict } from "../hub-assets/strict-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_TAR_BYTES = 64 * 1024 * 1024;
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;

class PagesArtifactVerificationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PagesArtifactVerificationError";
    this.code = code;
  }
}

const reject = (code, message) => { throw new PagesArtifactVerificationError(code, message); };
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : "";
}

function requiredOption(name) {
  const value = option(name);
  if (!value) reject("PAGES_ARTIFACT_ARGUMENT_MISSING", `${name} is required`);
  return value;
}

function canonicalPath(value, label) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(value) || value.normalize("NFC") !== value
    || path.posix.isAbsolute(value) || path.posix.normalize(value) !== value
    || value === "." || value.startsWith("../") || value.includes("/../") || value.endsWith("/")) {
    reject("PAGES_ARTIFACT_PATH_UNSAFE", `${label} is not one canonical NFC POSIX-relative path`);
  }
  return value;
}

function collisionKey(value) {
  return value.normalize("NFC").toLowerCase();
}

function assertUniquePath(paths, candidate, label) {
  const key = collisionKey(candidate);
  if (paths.has(key)) reject("PAGES_ARTIFACT_PATH_COLLISION", `${label} duplicates or case/NFC-collides with ${paths.get(key)}`);
  paths.set(key, candidate);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readBounded(filePath, maximum, label) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) reject("PAGES_ARTIFACT_INPUT_TYPE_INVALID", `${label} is not one single-link regular file`);
  if (stat.size <= 0 || stat.size > maximum) reject("PAGES_ARTIFACT_INPUT_SIZE_INVALID", `${label} escaped its byte envelope`);
  return fs.readFileSync(filePath);
}

function findEocd(zip) {
  const minimum = Math.max(0, zip.length - 65_557);
  for (let offset = zip.length - 22; offset >= minimum; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  reject("PAGES_ARTIFACT_ZIP_EOCD_MISSING", "artifact ZIP end record is missing");
}

function extractSingleTarFromZip(zip) {
  const eocd = findEocd(zip);
  const disk = zip.readUInt16LE(eocd + 4);
  const centralDisk = zip.readUInt16LE(eocd + 6);
  const diskEntries = zip.readUInt16LE(eocd + 8);
  const totalEntries = zip.readUInt16LE(eocd + 10);
  const centralSize = zip.readUInt32LE(eocd + 12);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  const commentLength = zip.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== 1 || totalEntries !== 1 || commentLength !== 0
    || centralOffset + centralSize !== eocd || eocd + 22 !== zip.length) {
    reject("PAGES_ARTIFACT_ZIP_MEMBERSHIP_INVALID", "artifact ZIP must contain exactly one non-ZIP64 member and no comment or trailing bytes");
  }
  if (centralOffset + 46 > zip.length || zip.readUInt32LE(centralOffset) !== 0x02014b50) {
    reject("PAGES_ARTIFACT_ZIP_CENTRAL_INVALID", "artifact ZIP central directory is malformed");
  }
  const flags = zip.readUInt16LE(centralOffset + 8);
  const method = zip.readUInt16LE(centralOffset + 10);
  const expectedCrc = zip.readUInt32LE(centralOffset + 16);
  const compressedSize = zip.readUInt32LE(centralOffset + 20);
  const uncompressedSize = zip.readUInt32LE(centralOffset + 24);
  const nameLength = zip.readUInt16LE(centralOffset + 28);
  const extraLength = zip.readUInt16LE(centralOffset + 30);
  const memberCommentLength = zip.readUInt16LE(centralOffset + 32);
  const diskStart = zip.readUInt16LE(centralOffset + 34);
  const externalAttributes = zip.readUInt32LE(centralOffset + 38);
  const localOffset = zip.readUInt32LE(centralOffset + 42);
  const centralEnd = centralOffset + 46 + nameLength + extraLength + memberCommentLength;
  if (centralEnd !== eocd || diskStart !== 0 || (flags & 0x1) !== 0 || ![0, 8].includes(method)
    || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || uncompressedSize > MAX_TAR_BYTES) {
    reject("PAGES_ARTIFACT_ZIP_CENTRAL_INVALID", "artifact ZIP uses an unsupported or unsafe representation");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let name;
  try { name = decoder.decode(zip.subarray(centralOffset + 46, centralOffset + 46 + nameLength)); }
  catch { reject("PAGES_ARTIFACT_ZIP_NAME_INVALID", "artifact ZIP member name is not strict UTF-8"); }
  if (name !== "artifact.tar" || extraLength > 4096 || memberCommentLength !== 0) {
    reject("PAGES_ARTIFACT_ZIP_MEMBERSHIP_INVALID", "artifact ZIP member must be exactly artifact.tar without a member comment");
  }
  const unixMode = externalAttributes >>> 16;
  if (unixMode && (unixMode & 0o170000) !== 0o100000) reject("PAGES_ARTIFACT_ZIP_MEMBER_TYPE_INVALID", "artifact.tar ZIP member is not regular");
  if (localOffset + 30 > centralOffset || zip.readUInt32LE(localOffset) !== 0x04034b50) {
    reject("PAGES_ARTIFACT_ZIP_LOCAL_INVALID", "artifact ZIP local header is malformed");
  }
  const localFlags = zip.readUInt16LE(localOffset + 6);
  const localMethod = zip.readUInt16LE(localOffset + 8);
  const localNameLength = zip.readUInt16LE(localOffset + 26);
  const localExtraLength = zip.readUInt16LE(localOffset + 28);
  const localNameStart = localOffset + 30;
  const localNameEnd = localNameStart + localNameLength;
  const dataStart = localNameEnd + localExtraLength;
  const dataEnd = dataStart + compressedSize;
  if (localFlags !== flags || localMethod !== method || dataEnd > centralOffset || localExtraLength > 4096) {
    reject("PAGES_ARTIFACT_ZIP_LOCAL_INVALID", "artifact ZIP local/central metadata diverged");
  }
  let localName;
  try { localName = decoder.decode(zip.subarray(localNameStart, localNameEnd)); }
  catch { reject("PAGES_ARTIFACT_ZIP_NAME_INVALID", "artifact ZIP local name is not strict UTF-8"); }
  if (localName !== name) reject("PAGES_ARTIFACT_ZIP_NAME_INVALID", "artifact ZIP local and central names diverged");
  let tar;
  try {
    tar = method === 0
      ? Buffer.from(zip.subarray(dataStart, dataEnd))
      : inflateRawSync(zip.subarray(dataStart, dataEnd), { maxOutputLength: MAX_TAR_BYTES });
  } catch (error) {
    reject("PAGES_ARTIFACT_ZIP_DECOMPRESSION_FAILED", `artifact.tar decompression failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (tar.length !== uncompressedSize || crc32(tar) !== expectedCrc) {
    reject("PAGES_ARTIFACT_ZIP_CONTENT_MISMATCH", "artifact.tar size or CRC-32 does not match the central directory");
  }
  return tar;
}

function parseOctal(field, label) {
  const nul = field.indexOf(0);
  const text = field.subarray(0, nul === -1 ? field.length : nul).toString("ascii").trim();
  if (!/^[0-7]+$/.test(text)) reject("PAGES_ARTIFACT_TAR_HEADER_INVALID", `${label} is not canonical octal`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) reject("PAGES_ARTIFACT_TAR_HEADER_INVALID", `${label} escaped safe integer bounds`);
  return value;
}

function tarText(field, label) {
  const nul = field.indexOf(0);
  const body = field.subarray(0, nul === -1 ? field.length : nul);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
  catch { reject("PAGES_ARTIFACT_TAR_HEADER_INVALID", `${label} is not strict UTF-8`); }
}

function tarChecksum(header) {
  let sum = 0;
  for (let index = 0; index < header.length; index += 1) sum += index >= 148 && index < 156 ? 32 : header[index];
  return sum;
}

function expectedSurface(allowlist) {
  if (!isObject(allowlist) || !Array.isArray(allowlist.publicFiles) || !Array.isArray(allowlist.generatedFiles)
    || !Array.isArray(allowlist.generatedQuarantineRoutes)) reject("PAGES_ARTIFACT_ALLOWLIST_INVALID", "public allowlist shape is invalid");
  const files = [...allowlist.publicFiles, ...allowlist.generatedFiles.map((entry) => entry.path), ...allowlist.generatedQuarantineRoutes]
    .map((member) => canonicalPath(member, "expected public member"))
    .sort((left, right) => left.localeCompare(right, "en"));
  const seen = new Map();
  for (const member of files) assertUniquePath(seen, member, "expected public member");
  const directories = new Set();
  for (const member of files) {
    const parts = member.split("/");
    for (let index = 1; index < parts.length; index += 1) directories.add(parts.slice(0, index).join("/"));
  }
  return { files, directories: [...directories].sort((left, right) => left.localeCompare(right, "en")) };
}

function parseAndExtractTar(tar, outputRoot, expected) {
  if (tar.length === 0 || tar.length > MAX_TAR_BYTES || tar.length % 512 !== 0) reject("PAGES_ARTIFACT_TAR_SIZE_INVALID", "artifact.tar escaped its bounded block envelope");
  if (fs.existsSync(outputRoot)) reject("PAGES_ARTIFACT_EXTRACT_ROOT_NOT_NEW", "artifact extraction root must not already exist");
  fs.mkdirSync(outputRoot);
  const files = [];
  const directories = [];
  const pathKeys = new Map();
  let offset = 0;
  let zeroBlocks = 0;
  while (offset < tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks === 2) break;
      continue;
    }
    if (zeroBlocks !== 0) reject("PAGES_ARTIFACT_TAR_TRAILING_INVALID", "artifact.tar contains a nonzero header after its end marker began");
    const storedChecksum = parseOctal(header.subarray(148, 156), "tar checksum");
    if (storedChecksum !== tarChecksum(header)) reject("PAGES_ARTIFACT_TAR_CHECKSUM_INVALID", "artifact.tar header checksum mismatch");
    const magic = header.subarray(257, 263).toString("ascii");
    if (magic !== "ustar\0" && magic !== "ustar ") reject("PAGES_ARTIFACT_TAR_FORMAT_INVALID", "artifact.tar is not a bounded ustar archive");
    const prefix = tarText(header.subarray(345, 500), "tar prefix");
    const leaf = tarText(header.subarray(0, 100), "tar name");
    let member = prefix ? `${prefix}/${leaf}` : leaf;
    while (member.startsWith("./")) member = member.slice(2);
    const type = String.fromCharCode(header[156] || 48);
    const size = parseOctal(header.subarray(124, 136), "tar size");
    const linkName = tarText(header.subarray(157, 257), "tar link name");
    const isDirectory = type === "5";
    const isRegular = type === "0";
    if (!isDirectory && !isRegular) {
      const category = ["1", "2"].includes(type) ? "LINK" : ["x", "g", "L", "K"].includes(type) ? "PAX_OR_EXTENSION" : "SPECIAL";
      reject(`PAGES_ARTIFACT_TAR_${category}_FORBIDDEN`, `artifact.tar contains forbidden type ${JSON.stringify(type)} for ${member || "<root>"}`);
    }
    if (linkName || (isDirectory && size !== 0)) reject("PAGES_ARTIFACT_TAR_HEADER_INVALID", `artifact.tar link/size fields are invalid for ${member || "<root>"}`);
    if (member === "" || member === ".") {
      if (!isDirectory) reject("PAGES_ARTIFACT_TAR_ROOT_INVALID", "artifact.tar root entry is not a directory");
    } else {
      member = member.endsWith("/") ? member.slice(0, -1) : member;
      canonicalPath(member, "artifact.tar member");
      assertUniquePath(pathKeys, member, "artifact.tar member");
      if (isDirectory) {
        directories.push(member);
        fs.mkdirSync(path.join(outputRoot, ...member.split("/")));
      } else {
        const bodyStart = offset + 512;
        const bodyEnd = bodyStart + size;
        if (bodyEnd > tar.length) reject("PAGES_ARTIFACT_TAR_TRUNCATED", `artifact.tar member is truncated: ${member}`);
        const bytes = Buffer.from(tar.subarray(bodyStart, bodyEnd));
        const destination = path.join(outputRoot, ...member.split("/"));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, bytes, { flag: "wx", mode: 0o644 });
        files.push({ path: member, bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (zeroBlocks < 2 || tar.subarray(offset).some((byte) => byte !== 0)) reject("PAGES_ARTIFACT_TAR_TRAILING_INVALID", "artifact.tar lacks exactly bounded zero padding after two end blocks");
  const filePaths = files.map((entry) => entry.path).sort((left, right) => left.localeCompare(right, "en"));
  const sortedDirectories = directories.sort((left, right) => left.localeCompare(right, "en"));
  if (filePaths.length !== expected.files.length || filePaths.some((entry, index) => entry !== expected.files[index])) {
    reject("PAGES_ARTIFACT_TAR_FILE_MEMBERSHIP_MISMATCH", `artifact.tar file membership drifted: ${JSON.stringify(filePaths)}`);
  }
  if (sortedDirectories.length !== expected.directories.length || sortedDirectories.some((entry, index) => entry !== expected.directories[index])) {
    reject("PAGES_ARTIFACT_TAR_DIRECTORY_MEMBERSHIP_MISMATCH", `artifact.tar directory membership drifted: ${JSON.stringify(sortedDirectories)}`);
  }
  const noJekyll = files.find((entry) => entry.path === ".nojekyll");
  if (!noJekyll || noJekyll.bytes !== 0) reject("PAGES_ARTIFACT_NOJEKYLL_INVALID", ".nojekyll must be present and zero bytes");
  files.sort((left, right) => left.path.localeCompare(right.path, "en"));
  const manifest = { directories: sortedDirectories, files };
  return { memberCount: files.length, membershipManifestSha256: sha256(Buffer.from(canonicalJson(manifest), "utf8")) };
}

function validateMetadata(metadata, expected) {
  if (!isObject(metadata) || !isObject(metadata.workflow_run)) reject("PAGES_ARTIFACT_METADATA_INVALID", "REST artifact metadata is malformed");
  const digest = String(metadata.digest || "");
  if (String(metadata.id) !== expected.id || metadata.name !== expected.name || metadata.expired !== false
    || digest !== `sha256:${expected.zipSha256}` || Number(metadata.workflow_run.id) !== Number(expected.runId)
    || metadata.workflow_run.head_sha !== expected.targetSha
    || Number(metadata.workflow_run.repository_id) !== Number(expected.repositoryId)) {
    reject("PAGES_ARTIFACT_METADATA_MISMATCH", "REST artifact identity does not match the frozen run/target/name/ID/digest tuple");
  }
  return digest.slice("sha256:".length);
}

function appendOutputs(filePath, values) {
  if (!filePath) return;
  const body = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  fs.appendFileSync(filePath, body, "utf8");
}

function tarOctal(value, width) {
  const text = value.toString(8);
  if (text.length > width - 1) reject("PAGES_ARTIFACT_SELF_TEST_INVALID", "self-test tar integer overflowed");
  return `${text.padStart(width - 1, "0")}\0`;
}

function writeTarText(header, offset, length, value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) reject("PAGES_ARTIFACT_SELF_TEST_INVALID", `self-test tar field is too long: ${value}`);
  bytes.copy(header, offset);
}

function selfTestTarMember(member, bytes, type = "0", linkName = "") {
  const header = Buffer.alloc(512);
  writeTarText(header, 0, 100, type === "5" ? `${member}/` : member);
  writeTarText(header, 100, 8, tarOctal(type === "5" ? 0o755 : 0o644, 8));
  writeTarText(header, 108, 8, tarOctal(0, 8));
  writeTarText(header, 116, 8, tarOctal(0, 8));
  writeTarText(header, 124, 12, tarOctal(bytes.length, 12));
  writeTarText(header, 136, 12, tarOctal(0, 12));
  header.fill(32, 148, 156);
  header[156] = type.charCodeAt(0);
  writeTarText(header, 157, 100, linkName);
  writeTarText(header, 257, 6, "ustar\0");
  writeTarText(header, 263, 2, "00");
  writeTarText(header, 148, 8, `${tarChecksum(header).toString(8).padStart(6, "0")}\0 `);
  const padding = Buffer.alloc((512 - (bytes.length % 512)) % 512);
  return Buffer.concat([header, bytes, padding]);
}

function buildSelfTestTar(allowlist, mutations = {}) {
  const expected = expectedSurface(allowlist);
  const generated = new Map([
    ...allowlist.generatedFiles.map((entry) => [entry.path, Buffer.from(entry.content, "utf8")]),
    ...allowlist.generatedQuarantineRoutes.map((entry) => [entry, fs.readFileSync(path.join(root, ".github", "pages-templates", "hivepoa-quarantine.html"))]),
  ]);
  const parts = [];
  const directories = mutations.directories || expected.directories;
  for (const directory of directories) parts.push(selfTestTarMember(directory, Buffer.alloc(0), "5"));
  const files = mutations.files || expected.files.map((member) => ({ member, bytes: generated.get(member) || fs.readFileSync(path.join(root, ...member.split("/"))), type: "0", linkName: "" }));
  for (const file of files) parts.push(selfTestTarMember(file.member, file.bytes || Buffer.alloc(0), file.type || "0", file.linkName || ""));
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

function buildSelfTestZip(tar) {
  const name = Buffer.from("artifact.tar", "utf8");
  const crc = crc32(tar);
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(tar.length, 18);
  local.writeUInt32LE(tar.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(tar.length, 20);
  central.writeUInt32LE(tar.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0o100644 * 0x10000, 38);
  name.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + tar.length, 16);
  return Buffer.concat([local, tar, central, eocd]);
}

function mutateTarHeader(tar, headerOffset, mutate) {
  const copy = Buffer.from(tar);
  const header = copy.subarray(headerOffset, headerOffset + 512);
  mutate(header);
  header.fill(32, 148, 156);
  writeTarText(header, 148, 8, `${tarChecksum(header).toString(8).padStart(6, "0")}\0 `);
  return copy;
}

function expectCode(label, code, callback) {
  try { callback(); }
  catch (error) {
    if (error instanceof PagesArtifactVerificationError && error.code === code) return;
    throw new Error(`${label} returned ${error?.code || error?.name}; expected ${code}`);
  }
  throw new Error(`${label} did not fail with ${code}`);
}

function selfTest() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hive-pages-artifact-verifier-"));
  try {
    const allowlist = parseJsonBytesStrict(fs.readFileSync(path.join(root, ".github", "pages-public-allowlist.v1.json")), "artifact verifier self-test allowlist");
    const expected = expectedSurface(allowlist);
    if (expected.files.length !== 30) reject("PAGES_ARTIFACT_EXPECTED_COUNT_INVALID", "self-test requires exactly 30 reviewed files");
    const tar = buildSelfTestTar(allowlist);
    const zip = buildSelfTestZip(tar);
    const zipHash = sha256(zip);
    const metadata = {
      id: 9001,
      name: "github-pages-7001-2",
      expired: false,
      digest: `sha256:${zipHash}`,
      workflow_run: { id: 7001, head_sha: "e".repeat(40), repository_id: 12345 },
    };
    validateMetadata(metadata, { id: "9001", name: metadata.name, runId: "7001", repositoryId: "12345", targetSha: "e".repeat(40), zipSha256: zipHash });
    const extractedTar = extractSingleTarFromZip(zip);
    if (!extractedTar.equals(tar)) reject("PAGES_ARTIFACT_SELF_TEST_INVALID", "ZIP extraction changed artifact.tar bytes");
    parseAndExtractTar(tar, path.join(temporaryRoot, "valid"), expected);
    expectCode("REST digest warning promoted to failure", "PAGES_ARTIFACT_METADATA_MISMATCH", () => validateMetadata({ ...metadata, digest: `sha256:${"f".repeat(64)}` }, { id: "9001", name: metadata.name, runId: "7001", repositoryId: "12345", targetSha: "e".repeat(40), zipSha256: zipHash }));
    expectCode("artifact name mismatch", "PAGES_ARTIFACT_METADATA_MISMATCH", () => validateMetadata({ ...metadata, name: "github-pages-7001-3" }, { id: "9001", name: metadata.name, runId: "7001", repositoryId: "12345", targetSha: "e".repeat(40), zipSha256: zipHash }));
    const firstFileOffset = expected.directories.length * 512;
    for (const [type, code] of [["1", "PAGES_ARTIFACT_TAR_LINK_FORBIDDEN"], ["2", "PAGES_ARTIFACT_TAR_LINK_FORBIDDEN"], ["3", "PAGES_ARTIFACT_TAR_SPECIAL_FORBIDDEN"], ["x", "PAGES_ARTIFACT_TAR_PAX_OR_EXTENSION_FORBIDDEN"]]) {
      const hostile = mutateTarHeader(tar, firstFileOffset, (header) => { header[156] = type.charCodeAt(0); });
      expectCode(`tar type ${type} refused`, code, () => parseAndExtractTar(hostile, path.join(temporaryRoot, `type-${type.charCodeAt(0)}`), expected));
    }
    const traversal = mutateTarHeader(tar, firstFileOffset, (header) => { header.fill(0, 0, 100); writeTarText(header, 0, 100, "../escape"); });
    expectCode("tar traversal refused", "PAGES_ARTIFACT_PATH_UNSAFE", () => parseAndExtractTar(traversal, path.join(temporaryRoot, "traversal"), expected));
    const extraDirectory = buildSelfTestTar(allowlist, { directories: [...expected.directories, "unexpected-empty"] });
    expectCode("extra empty directory refused", "PAGES_ARTIFACT_TAR_DIRECTORY_MEMBERSHIP_MISMATCH", () => parseAndExtractTar(extraDirectory, path.join(temporaryRoot, "extra-dir"), expected));
    const duplicateFiles = expected.files.map((member) => ({ member, bytes: member === ".nojekyll" ? Buffer.alloc(0) : Buffer.from("x") }));
    duplicateFiles.push({ member: expected.files[0].toUpperCase(), bytes: Buffer.from("x") });
    const duplicateTar = buildSelfTestTar(allowlist, { files: duplicateFiles });
    expectCode("case collision refused", "PAGES_ARTIFACT_PATH_COLLISION", () => parseAndExtractTar(duplicateTar, path.join(temporaryRoot, "collision"), expected));
    console.log(`PAGES_ARTIFACT_VERIFIER_SELF_TEST_OK members=${expected.files.length} metadata=hard-fail tar=traversal+link+special+pax+extra-dir+collision hidden-nojekyll=zero`);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function main() {
  const zipPath = path.resolve(requiredOption("--zip"));
  const metadataPath = path.resolve(requiredOption("--metadata"));
  const outputRoot = path.resolve(requiredOption("--extract-output"));
  const expectedName = requiredOption("--expected-name");
  const expectedId = requiredOption("--expected-id");
  const expectedRunId = requiredOption("--expected-run-id");
  const expectedRepositoryId = requiredOption("--expected-repository-id");
  const expectedTargetSha = requiredOption("--expected-target-sha");
  if (!/^github-pages-[1-9][0-9]*-[1-9][0-9]*$/.test(expectedName)
    || !/^[1-9][0-9]*$/.test(expectedId) || !/^[1-9][0-9]*$/.test(expectedRunId)
    || !/^[1-9][0-9]*$/.test(expectedRepositoryId) || !HEX40.test(expectedTargetSha)) {
    reject("PAGES_ARTIFACT_EXPECTATION_INVALID", "frozen artifact expectation is malformed");
  }
  const zip = readBounded(zipPath, MAX_ARCHIVE_BYTES, "downloaded Pages artifact ZIP");
  const zipSha256 = sha256(zip);
  const metadata = parseJsonBytesStrict(readBounded(metadataPath, 1024 * 1024, "REST artifact metadata"), "Pages artifact REST metadata");
  const restDigest = validateMetadata(metadata, {
    id: expectedId,
    name: expectedName,
    runId: expectedRunId,
    repositoryId: expectedRepositoryId,
    targetSha: expectedTargetSha,
    zipSha256,
  });
  const tar = extractSingleTarFromZip(zip);
  const tarSha256 = sha256(tar);
  const allowlist = parseJsonBytesStrict(fs.readFileSync(path.join(root, ".github", "pages-public-allowlist.v1.json")), "Pages allowlist for artifact verification");
  const expected = expectedSurface(allowlist);
  if (expected.files.length !== 30) reject("PAGES_ARTIFACT_EXPECTED_COUNT_INVALID", `reviewed public member count is ${expected.files.length}, expected 30`);
  const surface = parseAndExtractTar(tar, outputRoot, expected);
  const result = {
    artifactId: expectedId,
    artifactName: expectedName,
    restDigest,
    zipSha256,
    tarSha256,
    membershipManifestSha256: surface.membershipManifestSha256,
    memberCount: surface.memberCount,
  };
  appendOutputs(option("--github-output"), {
    artifact_id: result.artifactId,
    artifact_name: result.artifactName,
    artifact_rest_digest: result.restDigest,
    artifact_zip_sha256: result.zipSha256,
    artifact_tar_sha256: result.tarSha256,
    membership_manifest_sha256: result.membershipManifestSha256,
    member_count: result.memberCount,
  });
  console.log(`PAGES_ARTIFACT_VERIFIED id=${result.artifactId} name=${result.artifactName} rest_digest=${result.restDigest} tar_sha256=${result.tarSha256} manifest_sha256=${result.membershipManifestSha256} members=${result.memberCount}`);
}

try { process.argv.includes("--self-test") ? selfTest() : main(); }
catch (error) {
  console.error(`${error?.code || error?.name || "PAGES_ARTIFACT_UNEXPECTED_ERROR"}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
