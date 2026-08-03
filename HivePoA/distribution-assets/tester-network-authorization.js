/**
 * Cross-runtime authorization gate for the one exact public Tester Network tip.
 *
 * This module is deliberately consumed by both the Pages client and the
 * command-line acceptance harness. Pages, a GitHub release, or an IPFS gateway
 * may carry bytes, but none of them may widen this fixed signed contract.
 */

export const PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256 =
  "11098a69d338689c46e2ac08b66f315fd7ded7f794b74d8c0bf09bf03715c081";

export const TESTER_NETWORK_RELEASE = Object.freeze({
  version: "2.0.1-storage-preview.6",
  releaseSequence: 6,
  githubReleaseTag: "storage-preview-2.0.1-6",
  githubRepository: "Dhenz14/HivePoA-Distribution",
  githubRepositoryId: 1316835999,
  primaryArtifact: "SpiritBomb-2.0.1-storage-preview.6-x86_64.AppImage",
  platform: "linux",
  architecture: "x64",
});

export const TESTER_NETWORK_METADATA_ROLES = Object.freeze([
  "manifest",
  "receipt",
  "publicationProof",
]);

const INDEX_SCHEMA = "https://hivepoa.io/schemas/hivepoa-release-channel-index.v1.json";
const SHA256 = /^[a-f0-9]{64}$/;
const CID = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,})$/;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{2,255}$/;

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, i) => key === wanted[i]);
}

export function canonicalStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalStringify(value[key])}`
  )).join(",")}}`;
}

/** JSON that is safe inside a classic HTML script text node. */
export function htmlSafeJson(value) {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function pemToSpki(pem) {
  const b64 = String(pem || "")
    .replaceAll("-----BEGIN PUBLIC KEY-----", "")
    .replaceAll("-----END PUBLIC KEY-----", "")
    .replace(/\s+/g, "");
  if (!b64) throw new Error("empty public key");
  if (typeof Buffer !== "undefined") {
    const bytes = Buffer.from(b64, "base64");
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function b64ToBuf(b64) {
  if (typeof Buffer !== "undefined") {
    const bytes = Buffer.from(String(b64 || ""), "base64");
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const raw = atob(String(b64 || ""));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export async function sha256Hex(buffer) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => (
    byte.toString(16).padStart(2, "0")
  )).join("");
}

function fixedTesterPolicy(policy) {
  if (!exactKeys(policy, ["capability", "runbook", "bootstrap", "proofPolicy", "creditPolicy", "hiveBoundary"])) return false;
  if (policy.capability !== "storage-poa-tester-network-v1") return false;
  if (!exactKeys(policy.runbook, ["path", "sha256"])
    || policy.runbook.path !== "docs/handoffs/STORAGE_POA_TESTER_NETWORK_RUNBOOK_20260802.md"
    || !SHA256.test(policy.runbook.sha256)) return false;
  if (!exactKeys(policy.bootstrap, ["minimumWorkers", "distinctWorkerIdentities", "operatorEnrollmentRequired", "realKuboRequired", "minimumHiveApiEndpoints"])
    || policy.bootstrap.minimumWorkers !== 2
    || policy.bootstrap.distinctWorkerIdentities !== true
    || policy.bootstrap.operatorEnrollmentRequired !== true
    || policy.bootstrap.realKuboRequired !== true
    || policy.bootstrap.minimumHiveApiEndpoints !== 3) return false;
  if (!exactKeys(policy.proofPolicy, ["multiBlock", "irreversibleEntropyQuorum", "replayIdempotent", "restartPersistenceRequired", "revocationSupported"])
    || policy.proofPolicy.multiBlock !== true
    || policy.proofPolicy.irreversibleEntropyQuorum !== "2-of-3-hive-api"
    || policy.proofPolicy.replayIdempotent !== true
    || policy.proofPolicy.restartPersistenceRequired !== true
    || policy.proofPolicy.revocationSupported !== true) return false;
  if (!exactKeys(policy.creditPolicy, ["schema", "amountPerAcceptedProof", "replayAward", "unit", "awardExactlyOnce", "transferable", "redeemable", "monetaryValue"])
    || policy.creditPolicy.schema !== "hivepoa.storage-poa-test-credit-policy.v1"
    || policy.creditPolicy.amountPerAcceptedProof !== 100
    || policy.creditPolicy.replayAward !== 0
    || policy.creditPolicy.unit !== "test-credit"
    || policy.creditPolicy.awardExactlyOnce !== true
    || policy.creditPolicy.transferable !== false
    || policy.creditPolicy.redeemable !== false
    || policy.creditPolicy.monetaryValue !== false) return false;
  return exactKeys(policy.hiveBoundary, ["readOnlyBlockData", "postingKeyRequired", "broadcastsTransactions", "fabricatedTransactionIds"])
    && policy.hiveBoundary.readOnlyBlockData === true
    && policy.hiveBoundary.postingKeyRequired === false
    && policy.hiveBoundary.broadcastsTransactions === false
    && policy.hiveBoundary.fabricatedTransactionIds === false;
}

function validateMetadataBindings(release) {
  const mirrors = release.metadataMirrors;
  if (!exactKeys(mirrors, TESTER_NETWORK_METADATA_ROLES)) return "metadata mirror roles must be exactly manifest, receipt, and publicationProof";
  for (const role of TESTER_NETWORK_METADATA_ROLES) {
    const binding = mirrors[role];
    if (!exactKeys(binding, ["filename", "bytes", "sha256", "cid", "path"])
      || !SAFE_FILENAME.test(binding.filename)
      || !Number.isSafeInteger(binding.bytes) || binding.bytes < 1 || binding.bytes > 4_194_304
      || !SHA256.test(binding.sha256) || !CID.test(binding.cid)
      || binding.path !== `cid-mirrors/${binding.cid}.json`) {
      return `invalid ${role} metadata mirror binding`;
    }
    if (release.artifactDigests?.[binding.filename] !== binding.sha256) {
      return `${role} metadata digest is not bound in artifactDigests`;
    }
  }
  const metadata = TESTER_NETWORK_METADATA_ROLES.map((role) => mirrors[role]);
  if (new Set(metadata.map((entry) => entry.filename)).size !== metadata.length
    || new Set(metadata.map((entry) => entry.path)).size !== metadata.length
    || new Set(metadata.map((entry) => entry.cid)).size !== metadata.length
    || metadata.some((entry) => entry.filename === release.primaryArtifact)
    || new Set([release.primaryArtifactCid, ...metadata.map((entry) => entry.cid)]).size !== metadata.length + 1) {
    return "package and metadata filenames, paths, and CIDs must be mutually distinct";
  }
  if (release.manifestCid !== mirrors.manifest.cid
    || release.manifestSha256 !== mirrors.manifest.sha256
    || release.cidMirrorPath !== mirrors.manifest.path
    || release.receiptCid !== mirrors.receipt.cid
    || release.publicationProofCid !== mirrors.publicationProof.cid) {
    return "release metadata pointers disagree with metadataMirrors";
  }
  return null;
}

function validateFixedRelease(release) {
  const fixed = TESTER_NETWORK_RELEASE;
  if (release.version !== fixed.version
    || release.releaseSequence !== fixed.releaseSequence
    || release.githubReleaseTag !== fixed.githubReleaseTag
    || release.githubRepository !== fixed.githubRepository
    || release.githubRepositoryId !== fixed.githubRepositoryId
    || release.primaryArtifact !== fixed.primaryArtifact
    || release.platform !== fixed.platform
    || release.architecture !== fixed.architecture
    || release.channel !== "beta" || release.revoked !== false) {
    return "current tip is not the fixed Tester Network .6 release";
  }
  if (!Number.isSafeInteger(release.bytes) || release.bytes < 1
    || !CID.test(release.primaryArtifactCid)
    || !SHA256.test(release.artifactDigests?.[release.primaryArtifact])) {
    return "Tester Network package binding is invalid";
  }
  if (!fixedTesterPolicy(release.testerNetwork)) return "Tester Network policy differs from the fixed valueless-credit contract";
  return validateMetadataBindings(release);
}

function rejected(reason, signed) {
  return { ok: false, reason, signed: signed || null, release: null };
}

/**
 * Verify and select the one release authorized for public Tester Network use.
 * Unverified signed fields are never returned as an authorized release.
 */
export async function verifyAuthorizedTesterNetworkIndex(index, options = {}) {
  const pinnedFingerprint = options.pinnedFingerprint || PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256;
  const nowMs = options.nowMs ?? Date.now();
  try {
    if (!index || index.schema !== INDEX_SCHEMA || index.schemaVersion !== 1) return rejected("unsupported index schema");
    if (!index.signed || !Array.isArray(index.signatures) || index.signatures.length < 1) return rejected("missing signatures");
    const bootstrap = index.trustBootstrap;
    if (!bootstrap || bootstrap.algorithm !== "ed25519" || !bootstrap.publicKeyPem || !SHA256.test(bootstrap.publicKeySha256)) {
      return rejected("missing trust bootstrap public key", index.signed);
    }
    if (bootstrap.publicKeySha256 !== pinnedFingerprint) return rejected("trust bootstrap fingerprint is not the pinned Pages key", index.signed);
    const signed = index.signed;
    const createdAt = Date.parse(signed.createdAt);
    const expiresAt = Date.parse(signed.expiresAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || nowMs < createdAt || nowMs >= expiresAt) {
      return rejected("index is not currently valid", signed);
    }
    if (!Array.isArray(signed.releases) || signed.releases.length < 1) return rejected("no releases in index", signed);
    if (signed.latestBetaSequence !== TESTER_NETWORK_RELEASE.releaseSequence) return rejected("signed tip is not Tester Network .6", signed);
    const matches = signed.releases.filter((entry) => entry?.releaseSequence === signed.latestBetaSequence);
    if (matches.length !== 1 || matches[0].revoked === true) return rejected("approved tip sequence is missing, duplicated, or revoked", signed);
    if (Array.isArray(signed.revocations)
      && signed.revocations.some((entry) => entry?.releaseSequence === signed.latestBetaSequence)) {
      return rejected("approved tip is contradicted by a revocation record", signed);
    }
    if (signed.mirrorParity !== true) return rejected("mirror parity not proven in signed index", signed);
    const releaseError = validateFixedRelease(matches[0]);
    if (releaseError) return rejected(releaseError, signed);

    const keyBytes = pemToSpki(bootstrap.publicKeyPem);
    const keyHash = await sha256Hex(keyBytes);
    if (keyHash !== bootstrap.publicKeySha256 || keyHash !== pinnedFingerprint) return rejected("trust bootstrap key fingerprint mismatch", signed);
    const cryptoKey = await globalThis.crypto.subtle.importKey("spki", keyBytes, { name: "Ed25519" }, false, ["verify"]);
    const payload = new TextEncoder().encode(canonicalStringify(signed));
    for (const entry of index.signatures) {
      if (!entry || entry.algorithm !== "ed25519" || entry.publicKeySha256 !== bootstrap.publicKeySha256
        || String(entry.signature || "").startsWith("RESTORE_AUTHORIZED")) {
        return rejected("invalid signature metadata", signed);
      }
      if (!await globalThis.crypto.subtle.verify({ name: "Ed25519" }, cryptoKey, b64ToBuf(entry.signature), payload)) {
        return rejected("invalid ed25519 signature", signed);
      }
    }
    return { ok: true, reason: null, release: matches[0], signed };
  } catch {
    return rejected("signed index verification failed", index?.signed);
  }
}
