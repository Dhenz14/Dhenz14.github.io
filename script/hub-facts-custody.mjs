#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonBytesStrict, StrictJsonError } from "../hub-assets/strict-json.mjs";

export const HUB_FACTS_MAX_BYTES = 512 * 1024;

export class HubFactsCustodyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HubFactsCustodyError";
    this.code = code;
  }
}

export function parseHubFactsBytesStrict(bytes, label = "hub-facts.json") {
  if (!(bytes instanceof Uint8Array)) {
    throw new HubFactsCustodyError("HUB_FACTS_INPUT_NOT_BYTES", `${label} must be supplied as raw bytes`);
  }
  if (bytes.byteLength === 0) {
    throw new HubFactsCustodyError("HUB_FACTS_BODY_EMPTY", `${label} must not be empty`);
  }
  if (bytes.byteLength > HUB_FACTS_MAX_BYTES) {
    throw new HubFactsCustodyError(
      "HUB_FACTS_BODY_TOO_LARGE",
      `${label} exceeds the ${HUB_FACTS_MAX_BYTES}-byte custody ceiling`,
    );
  }
  return parseJsonBytesStrict(bytes, label);
}

export function readHubFactsSync(filePath, label = "hub-facts.json") {
  const metadata = fs.lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new HubFactsCustodyError("HUB_FACTS_NOT_REGULAR_FILE", `${label} must be a regular non-symlink file`);
  }
  if (metadata.size === 0) {
    throw new HubFactsCustodyError("HUB_FACTS_BODY_EMPTY", `${label} must not be empty`);
  }
  if (metadata.size > HUB_FACTS_MAX_BYTES) {
    throw new HubFactsCustodyError(
      "HUB_FACTS_BODY_TOO_LARGE",
      `${label} exceeds the ${HUB_FACTS_MAX_BYTES}-byte custody ceiling`,
    );
  }
  return parseHubFactsBytesStrict(fs.readFileSync(filePath), label);
}

function readField(document, dottedPath) {
  if (!/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(dottedPath)) {
    throw new HubFactsCustodyError("HUB_FACTS_FIELD_PATH_INVALID", "field path must use simple dotted object keys");
  }
  let value = document;
  for (const segment of dottedPath.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, segment)) {
      throw new HubFactsCustodyError("HUB_FACTS_FIELD_MISSING", `hub-facts field ${dottedPath} is missing`);
    }
    value = value[segment];
  }
  if (!["string", "number", "boolean"].includes(typeof value)) {
    throw new HubFactsCustodyError("HUB_FACTS_FIELD_NOT_SCALAR", `hub-facts field ${dottedPath} is not scalar`);
  }
  return String(value);
}

function expectCode(label, bytes, expectedCode) {
  let caught;
  try {
    parseHubFactsBytesStrict(bytes, `hostile ${label}`);
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof StrictJsonError || caught instanceof HubFactsCustodyError) || caught.code !== expectedCode) {
    throw new Error(`${label} returned ${caught?.code || caught?.name || "no error"}; expected ${expectedCode}`);
  }
}

export function selfTestHubFactsCustody() {
  const encode = (value) => new TextEncoder().encode(value);
  expectCode("empty", new Uint8Array(), "HUB_FACTS_BODY_EMPTY");
  expectCode("oversize", new Uint8Array(HUB_FACTS_MAX_BYTES + 1), "HUB_FACTS_BODY_TOO_LARGE");
  expectCode("BOM", Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), "JSON_BOM_FORBIDDEN");
  expectCode("invalid UTF-8", Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x80, 0x7d]), "JSON_INVALID_UTF8");
  expectCode("duplicate key", encode('{"x":1,"x":2}'), "JSON_DUPLICATE_KEY");
  expectCode("NFC collision", encode('{"é":1,"é":2}'), "JSON_NORMALIZATION_COLLISION");
  expectCode("non-RFC whitespace", encode('{"x":1}\u00a0'), "JSON_TRAILING_CONTENT");
  expectCode("unpaired surrogate", encode('{"x":"\\ud800"}'), "JSON_UNPAIRED_SURROGATE");
  expectCode("trailing content", encode('{"x":1}false'), "JSON_TRAILING_CONTENT");
  const valid = parseHubFactsBytesStrict(encode('{"hiveAi":{"sourceCommit":"abc"}}'), "valid hostile control");
  if (readField(valid, "hiveAi.sourceCommit") !== "abc") throw new Error("valid field projection failed");
  return 9;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--self-test")) {
    const hostileCases = selfTestHubFactsCustody();
    console.log(`HUB_FACTS_CUSTODY_OK hostile_cases=${hostileCases} max_bytes=${HUB_FACTS_MAX_BYTES}`);
  } else {
    const fieldIndex = process.argv.indexOf("--field");
    const fileIndex = process.argv.indexOf("--file");
    if (fieldIndex === -1 || fileIndex === -1 || !process.argv[fieldIndex + 1] || !process.argv[fileIndex + 1]) {
      throw new HubFactsCustodyError(
        "HUB_FACTS_CLI_USAGE",
        "usage: node script/hub-facts-custody.mjs --file <hub-facts.json> --field <dotted.path>",
      );
    }
    const filePath = path.resolve(process.argv[fileIndex + 1]);
    console.log(readField(readHubFactsSync(filePath, "hub-facts CLI input"), process.argv[fieldIndex + 1]));
  }
}
