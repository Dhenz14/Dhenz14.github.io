import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productTruthPath = path.join(root, "hub-assets", "product-truth.json");
const factsPath = path.join(root, "hub-assets", "hub-facts.json");
const latestPath = path.join(root, "downloads", "hive-ide", "latest.json");
const releaseManifestPath = path.join(root, "downloads", "hive-ide", "hive-ide-release-manifest.json");
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const UTC_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
// Externally observed evidence (remote byte readback, publication readback) carries the
// receipt's own sub-second precision. Accept it verbatim rather than rounding evidence.
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  assert(isPlainObject(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted), `${label} keys drifted: ${actual.join(",")}`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function parseJsonStrict(source, label = "JSON document") {
  assert(typeof source === "string", `${label} must be UTF-8 text`);
  assert(!source.includes("\uFFFD"), `${label} contains invalid UTF-8 replacement bytes`);
  let cursor = 0;

  const fail = (message) => {
    throw new Error(`${label} ${message} at byte ${Buffer.byteLength(source.slice(0, cursor), "utf8")}`);
  };
  const skipWhitespace = () => {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  };
  const parseString = () => {
    if (source[cursor] !== '"') fail("expected string");
    const start = cursor;
    cursor += 1;
    let escaped = false;
    while (cursor < source.length) {
      const character = source[cursor];
      cursor += 1;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') {
        try {
          return JSON.parse(source.slice(start, cursor));
        } catch {
          fail("contains an invalid string escape");
        }
      }
      if (character.charCodeAt(0) < 0x20) fail("contains an unescaped control character");
    }
    fail("contains an unterminated string");
  };
  const parseValue = () => {
    skipWhitespace();
    if (cursor >= source.length) fail("ended before a value");
    if (source[cursor] === '"') return parseString();
    if (source[cursor] === "{") return parseObject();
    if (source[cursor] === "[") return parseArray();
    for (const [token, value] of [["true", true], ["false", false], ["null", null]]) {
      if (source.startsWith(token, cursor)) {
        cursor += token.length;
        return value;
      }
    }
    const number = source.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      cursor += number[0].length;
      const value = Number(number[0]);
      if (!Number.isFinite(value)) fail("contains a non-finite number");
      return value;
    }
    fail("contains an invalid value");
  };
  const parseObject = () => {
    const result = Object.create(null);
    const keys = new Set();
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "}") {
      cursor += 1;
      return result;
    }
    while (cursor < source.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) fail(`contains duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      skipWhitespace();
      if (source[cursor] !== ":") fail("expected colon after object key");
      cursor += 1;
      result[key] = parseValue();
      skipWhitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return result;
      }
      if (source[cursor] !== ",") fail("expected comma between object entries");
      cursor += 1;
    }
    fail("contains an unterminated object");
  };
  const parseArray = () => {
    const result = [];
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "]") {
      cursor += 1;
      return result;
    }
    while (cursor < source.length) {
      result.push(parseValue());
      skipWhitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return result;
      }
      if (source[cursor] !== ",") fail("expected comma between array entries");
      cursor += 1;
    }
    fail("contains an unterminated array");
  };

  const result = parseValue();
  skipWhitespace();
  if (cursor !== source.length) fail("contains trailing content");
  return result;
}

const SUBJECT_STATUSES = Object.freeze({
  target_architecture: "SOURCE_BOUND_DOCTRINE",
  source_atlas: "SOURCE_PRESENT_AT_PIN",
  tip_influence: "SOURCE_GOVERNED_HOLD",
  fleet_halos: "DECLARED_HARD_OFF",
  released_tester_5: "PUBLIC_REMOTE_BYTES_VERIFIED_OLDER_SOURCE_SUBJECT",
  candidate_tester_6_publication: "HELD_NOT_PUBLIC",
  windows_wsl_candidate_design: "DECLARED_AT_PIN_BY_NON_DURABLE_EXTERNAL_OBSERVATION",
  linux_hive_ide_publication: "UNKNOWN_NO_ADMISSIBLE_PUBLICATION_OBSERVATION",
  macos_hive_ide_publication: "HELD_MISSING_ADMISSIBLE_PUBLICATION_OBSERVATION",
  installed_runtime: "UNKNOWN",
  observed_behavior: "UNKNOWN",
});
const SUBJECT_BASE_KEYS = Object.freeze([
  "subject_id", "subject_kind", "subject_status", "claim_plane", "evidence", "evidenceRef", "verifiedAt",
  "validUntil", "freshness", "invalidators", "claim", "doesNotProve", "recertification",
]);
// Subjects that must carry NO verification metadata at all: we hold or report them
// unknown precisely because no admissible observation exists. A subject that is HELD
// *after* an observation (tester.6's 404 readback) is deliberately not in this set.
const SUBJECTS_WITHOUT_ADMISSIBLE_EVIDENCE = Object.freeze([
  "linux_hive_ide_publication",
  "macos_hive_ide_publication",
  "installed_runtime",
  "observed_behavior",
]);

const EXPECTED_DEFINITION_IDS = Object.freeze([
  "neuron",
  "halo",
  "division-family",
  "hivebrain",
  "twitch",
  "living-anatomy",
]);

// Platform support and public package availability are separate rows on purpose:
// "Linux source path exists" and "a Linux package is published" are different claims.
const EXPECTED_PLATFORM_IDS = Object.freeze([
  "windows-x64-remote", "windows-wsl-design", "linux-source", "linux-publication", "macos-publication",
]);
const EXPECTED_CANDIDATE_BINDING_DIGEST = "8b567a0f9b56470ef808c54bad51bd7857fa4ce54aa8b4b165e02c996e489791";
// The exact candidate-state strings that landing is allowed to replace. A landed
// manifest must rebuild to this baseline digest, proving the landing changed the
// custody fields and nothing else.
const CANDIDATE_TARGET_EVIDENCE = "Exact source-doctrine files and the strict canonical candidate audit at the evidence baseline; candidate not landed";
const CANDIDATE_TARGET_EVIDENCE_REF = "Dhenz14/Hive-AI source baseline 472131baa2bc212a043966773bd92477c3a8a16c: AGENTS.md sha256 ceb29594ec3948243924c2c6529e19a341d0bed6f14702347a793a3d1b0a0ef6; README.md sha256 7f31169a6aa6ce05bc130b9c595688f6dba27f0cd5c397d712f3223a90d1f827; configs/external_agent_first_policy.json sha256 b142036b547c0a0b5800e428af7cb0bfa0957ecd467bf20e7c1a52847bbd258c";
const CANDIDATE_SERVED_CLAIM = "The canonical source candidate has not been committed or proven on a served release. No landing, main, installed-runtime, behavior, authority, or product-live claim is allowed.";

export function releasedTesterAvailability(manifest, now = Date.now()) {
  const validUntil = Date.parse(manifest?.truth_subjects?.released_tester_5?.validUntil ?? "");
  if (!Number.isFinite(validUntil) || now >= validUntil) return "PUBLICATION_FRESHNESS_EXPIRED_HELD";
  return "PUBLICATION_READBACK_WITHIN_VALIDITY_WINDOW";
}

export function validateProductTruth(manifest, { facts, latest, releaseManifest, expectedLanding } = {}) {
  exactKeys(manifest, [
    "schema", "version", "status", "canonicalManifest", "what_architecture_am_i", "source", "architecture", "boundaries",
    "truth_subjects", "atlasTesterMatch", "relations", "definitions", "registryClaimCut", "platforms", "integrityBoundary", "bindingDigest",
  ], "product truth projection");
  assert(manifest.schema === "hive.ecosystem.product-truth.public-projection.v1", "product truth schema drifted");
  assert(manifest.version === "1.0.0", "product truth version drifted");
  assert(manifest.status === "SOURCE_BOUND_TRUTH_WITH_SUBJECT_SCOPED_RUNTIME_UNKNOWNS", "product truth projection status drifted");
  exactKeys(manifest.canonicalManifest, [
    "status", "repository", "path", "evidenceSourceCommit", "evidenceSourceTree",
    "candidateSha256", "candidateBytes", "candidateGitBlobOid",
    "landedCommit", "landedTree", "landedSha256", "landedBytes", "landedGitBlobOid", "audit",
  ], "canonical manifest custody");
  const canonicalManifest = manifest.canonicalManifest;
  assert(canonicalManifest.repository === "Dhenz14/Hive-AI"
    && canonicalManifest.path === "configs/public/constellation_architecture_v1.json"
    && canonicalManifest.evidenceSourceCommit === "472131baa2bc212a043966773bd92477c3a8a16c"
    && canonicalManifest.evidenceSourceTree === "1910ab8b2bc7bcfe544b2d615f38ce2f9de5ce00"
    && canonicalManifest.candidateSha256 === "a4a336b47c3a28da3c08c79b07ff2ef92702dc35c09f8a330df74368faf7f056"
    && canonicalManifest.candidateBytes === 49342
    && canonicalManifest.candidateGitBlobOid === "c1036d2fc877e058965688fe8da5097576a37826", "canonical manifest candidate custody drifted");
  const canonicalAudit = canonicalManifest.audit;
  exactKeys(canonicalAudit, ["status", "bindingStatus", "authorityConferred"], "canonical manifest audit");
  assert(canonicalAudit.status === "PASS", "canonical manifest audit must be PASS to publish");
  assert(canonicalAudit.bindingStatus === canonicalManifest.status,
    "canonical manifest audit binding status must equal the custody status");
  assert(canonicalAudit.authorityConferred === false,
    "a public projection must never claim conferred authority");
  if (canonicalManifest.status === "CANDIDATE_NOT_LANDED") {
    assert(canonicalManifest.landedCommit === null
      && canonicalManifest.landedTree === null
      && canonicalManifest.landedSha256 === null
      && canonicalManifest.landedBytes === null
      && canonicalManifest.landedGitBlobOid === null
      && !expectedLanding, "candidate architecture contract must keep all landing fields null");
  } else {
    assert(canonicalManifest.status === "LANDED_HASH_VERIFIED"
      && HEX40.test(canonicalManifest.landedCommit ?? "")
      && HEX64.test(canonicalManifest.landedSha256 ?? "")
      && Number.isSafeInteger(canonicalManifest.landedBytes)
      && canonicalManifest.landedBytes > 0
      && expectedLanding
      && canonicalManifest.landedCommit === expectedLanding.commit
      && canonicalManifest.landedSha256 === expectedLanding.sha256
      && canonicalManifest.landedBytes === expectedLanding.bytes
      && HEX40.test(canonicalManifest.landedTree ?? "")
      && HEX40.test(canonicalManifest.landedGitBlobOid ?? "")
      && canonicalManifest.landedTree === expectedLanding.tree
      && canonicalManifest.landedGitBlobOid === expectedLanding.blobOid, "landed architecture contract lacks independent exact landing expectations");
  }

  const architectureIdentity = manifest.what_architecture_am_i;
  exactKeys(architectureIdentity, [
    "question", "answer", "architecture_id", "architecture_version", "identity_material", "identity_sha256", "subject_id", "claim_plane",
  ], "canonical architecture answer");
  assert(architectureIdentity.question === "WHAT_ARCHITECTURE_AM_I?"
    && architectureIdentity.answer === "SOVEREIGN_HIVEBRAIN_CONSTELLATION"
    && architectureIdentity.architecture_id === "hiveai.sovereign_hivebrain_constellation.v1"
    && architectureIdentity.architecture_version === "1.0.0"
    && architectureIdentity.identity_material === "hiveai.sovereign_hivebrain_constellation.v1|1.0.0|472131baa2bc212a043966773bd92477c3a8a16c|1910ab8b2bc7bcfe544b2d615f38ce2f9de5ce00"
    && architectureIdentity.identity_sha256 === "971437dd8d1474262627881e6c2d4baef9b0d705424d7eb4abd09a5d2baf5b61"
    && architectureIdentity.identity_sha256 === sha256(architectureIdentity.identity_material)
    && architectureIdentity.subject_id === "target_architecture"
    && architectureIdentity.claim_plane === "TARGET", "canonical architecture answer or identity material drifted");

  exactKeys(manifest.source, ["projectionRole", "sourceCommit", "graphHash", "snapshotHash", "capturedAt"], "product truth source");
  assert(/bounded public projection of a source candidate/i.test(manifest.source.projectionRole)
    && /not the canonical manifest at evidence pin/i.test(manifest.source.projectionRole)
    && /served\/main receipt/i.test(manifest.source.projectionRole)
    && /runtime telemetry/i.test(manifest.source.projectionRole)
    && /behaviou?r evidence/i.test(manifest.source.projectionRole)
    && /authority/i.test(manifest.source.projectionRole), "public projection role is not fail-closed");
  assert(HEX40.test(manifest.source.sourceCommit), "product truth source commit is not exact");
  assert(HEX64.test(manifest.source.graphHash), "product truth graph hash is not exact");
  assert(HEX64.test(manifest.source.snapshotHash), "product truth snapshot hash is not exact");
  assert(UTC_SECONDS.test(manifest.source.capturedAt), "product truth capture time is not canonical UTC seconds");
  if (facts) {
    assert(manifest.source.sourceCommit === facts.hiveAi?.sourceCommit, "product truth source commit is stale or mismatched");
    assert(manifest.source.graphHash === facts.hiveAi?.graphHash, "product truth graph hash is stale or mismatched");
    assert(manifest.source.snapshotHash === facts.snapshotHash, "product truth snapshot hash is stale or mismatched");
    assert(manifest.source.capturedAt === facts.capturedAt, "product truth capture time is stale or mismatched");
    assert(facts.boundaries?.runtimeTelemetry === false && facts.galaxy?.statusProjection === "none", "source snapshot must remain non-runtime and status-neutral");
  }

  exactKeys(manifest.architecture, ["label", "status", "servingBoundary"], "architecture display projection");
  assert(manifest.architecture.label === "HiveBrain Constellation", "HiveBrain Constellation label drifted");
  assert(manifest.architecture.status === "SOURCE_BOUND_DOCTRINE", "target architecture display status drifted");
  assert(/hive-runtime/i.test(manifest.architecture.servingBoundary)
    && /deterministic scaffold/i.test(manifest.architecture.servingBoundary)
    && /No BYOM/i.test(manifest.architecture.servingBoundary)
    && /no implicit external-checkpoint fallback/i.test(manifest.architecture.servingBoundary)
    && /no local-model product serve path/i.test(manifest.architecture.servingBoundary)
    && /explicitly user-directed external agent may be the inbound caller/i.test(manifest.architecture.servingBoundary)
    && /not a hidden Hive-selected backend fallback/i.test(manifest.architecture.servingBoundary)
    && /None of this attests an installed runtime or observed behaviou?r/i.test(manifest.architecture.servingBoundary), "serving boundary lost required qualifications");

  exactKeys(manifest.boundaries, ["architectureVsLive", "currentVsLegacy", "noLlmClaim"], "product truth boundaries");
  exactKeys(manifest.boundaries.architectureVsLive, ["status", "claim"], "architecture-versus-live boundary");
  exactKeys(manifest.boundaries.currentVsLegacy, ["status", "claim"], "current-versus-legacy boundary");
  exactKeys(manifest.boundaries.noLlmClaim, ["status", "claim", "exactBoundary"], "no-LLM boundary");
  assert(manifest.boundaries.architectureVsLive.status === "SEPARATE_PLANES"
    && /read-only GET surfaces/i.test(manifest.boundaries.architectureVsLive.claim)
    && /authority-bearing Mission Control mutations are credential-gated when configured/i.test(manifest.boundaries.architectureVsLive.claim)
    && /require independent evidence/i.test(manifest.boundaries.architectureVsLive.claim), "architecture and local live truth were conflated");
  assert(manifest.boundaries.currentVsLegacy.status === "SUBJECT_SCOPED_DISPOSITIONS"
    && manifest.boundaries.currentVsLegacy.claim === "BYOM is RETIRED and implicit external-checkpoint fallback is FORBIDDEN in the source-bound target doctrine. Electron removal is EXTERNAL_REPO_PROOF_REQUIRED and Docker client requirements are NOT_ADJUDICATED_BY_THIS_MANIFEST. Tester.5 is a distinct older Hive-AI source subject; tester.6 publication is held.", "current and legacy subject dispositions drifted");
  assert(manifest.boundaries.noLlmClaim.status === "HOLD"
    && /does not publish a bare ['\u2018\u2019\"]no LLM/i.test(manifest.boundaries.noLlmClaim.claim)
    && /authorized external agent/i.test(manifest.boundaries.noLlmClaim.exactBoundary)
    && /explicit inbound caller/i.test(manifest.boundaries.noLlmClaim.exactBoundary)
    && /not an implicit outbound fallback/i.test(manifest.boundaries.noLlmClaim.exactBoundary)
    && /not current runtime or network-egress proof/i.test(manifest.boundaries.noLlmClaim.exactBoundary), "bare no-LLM claim is not held and precisely bounded");

  exactKeys(manifest.truth_subjects, Object.keys(SUBJECT_STATUSES), "truth subjects");
  for (const [subjectId, expectedStatus] of Object.entries(SUBJECT_STATUSES)) {
    const subject = manifest.truth_subjects[subjectId];
    assert(isPlainObject(subject), `${subjectId} truth subject must be an object`);
    assert(subject.subject_status === expectedStatus, `${subjectId} truth subject status drifted`);
    assert(typeof subject.evidence === "string" && subject.evidence.trim(), `${subjectId} truth subject evidence missing`);
    assert(typeof subject.claim === "string" && subject.claim.trim(), `${subjectId} truth subject claim missing`);
    assert(typeof subject.freshness === "string" && subject.freshness.trim(), `${subjectId} truth subject freshness missing`);
    assert(Array.isArray(subject.invalidators) && subject.invalidators.length > 0
      && subject.invalidators.every((value) => typeof value === "string" && value.trim()), `${subjectId} truth subject invalidators missing`);
    assert(subject.evidenceRef === null || (typeof subject.evidenceRef === "string" && subject.evidenceRef.trim()), `${subjectId} evidence reference malformed`);
    assert(subject.verifiedAt === null || UTC_INSTANT.test(subject.verifiedAt), `${subjectId} verification time malformed`);
    assert(subject.subject_id === subjectId, `${subjectId} subject id does not match its own key`);
    assert(typeof subject.subject_kind === "string" && subject.subject_kind.trim(), `${subjectId} subject kind missing`);
    assert(typeof subject.claim_plane === "string" && subject.claim_plane.trim(), `${subjectId} claim plane missing`);
    assert(Array.isArray(subject.doesNotProve) && subject.doesNotProve.length > 0
      && subject.doesNotProve.every((value) => typeof value === "string" && value.trim()), `${subjectId} must state what it does not prove`);
    // A recertification promise is only meaningful for a subject that was durably
    // certified: one holding a bounded validity window, or an immutable source-pinned
    // claim. Non-durable observations and no-observation subjects must NOT promise one.
    const recertificationRequired = subject.validUntil !== null || /^IMMUTABLE_/.test(subject.freshness);
    if (recertificationRequired) {
      assert(isPlainObject(subject.recertification), `${subjectId} is durably certified and must carry a recertification contract`);
      exactKeys(subject.recertification, ["ownerId", "procedureId", "trigger", "expiryAction"], `${subjectId} recertification`);
      assert(Object.values(subject.recertification).every((value) => typeof value === "string" && value.trim()), `${subjectId} recertification contract incomplete`);
    } else {
      assert(subject.recertification === null, `${subjectId} is not durably certified and must not promise recertification`);
    }
    if (SUBJECTS_WITHOUT_ADMISSIBLE_EVIDENCE.includes(subjectId)) {
      assert(subject.evidenceRef === null && subject.verifiedAt === null && subject.validUntil === null
        && /^(?:UNKNOWN|HELD_NO_ADMISSIBLE_OBSERVATION)$/.test(subject.freshness), `${subjectId} has no admissible observation and must not carry invented verification`);
    } else {
      assert(typeof subject.evidenceRef === "string" && subject.evidenceRef.trim()
        && UTC_INSTANT.test(subject.verifiedAt)
        && !/^(?:UNKNOWN|EXPIRED)$/i.test(subject.freshness), `${subjectId} evidence metadata is incomplete or stale`);
      assert(subject.validUntil === null
        || (UTC_INSTANT.test(subject.validUntil) && Date.parse(subject.validUntil) > Date.parse(subject.verifiedAt)), `${subjectId} validity window malformed`);
    }
  }
  const subjectEvidence = Object.values(manifest.truth_subjects).map((subject) => subject.evidence);
  assert(new Set(subjectEvidence).size === subjectEvidence.length, "one evidence statement must not cover unrelated truth subjects");

  const target = manifest.truth_subjects.target_architecture;
  exactKeys(target, [
    ...SUBJECT_BASE_KEYS, "productLaneByom", "legacyApiNamesPresent", "implicitExternalFallback",
    "outboundCentralizedModelDependency", "externalCheckpointFallback", "localModelProductServePath",
    "externalAgentIsClientNotBackend", "directPersonClientsSupported", "customNeuralArtifactsExist",
    "bareNoLlmClaimAllowed", "defaultPath", "inboundGenerationDoctrineAtPin", "publicGenerationExplanation",
  ], "target architecture subject");
  assert(target.productLaneByom === false
    && target.legacyApiNamesPresent === true
    && target.implicitExternalFallback === false
    && target.outboundCentralizedModelDependency === false
    && target.externalCheckpointFallback === false
    && target.localModelProductServePath === false
    && target.externalAgentIsClientNotBackend === true
    && target.directPersonClientsSupported === true
    && target.customNeuralArtifactsExist === true
    && target.bareNoLlmClaimAllowed === false
    && target.defaultPath === "hive-runtime (constellation-local in-process deterministic scaffold)"
    && /centralized AI-as-user traffic until the custom generation head earns H10 serve influence/i.test(target.inboundGenerationDoctrineAtPin)
    && /Source doctrine at the evidence baseline/i.test(target.inboundGenerationDoctrineAtPin)
    && /explicit inbound caller/i.test(target.publicGenerationExplanation)
    && /not an implicit outbound backend fallback/i.test(target.publicGenerationExplanation)
    && /not current runtime proof/i.test(target.publicGenerationExplanation)
    && /Sovereign HiveBrain Constellation on the hive-runtime default path/i.test(target.claim), "target architecture serving predicates drifted");
  // The target-architecture subject must rest on independent source-doctrine files at the
  // evidence baseline, never on the candidate manifest's own digest. A manifest that cites
  // itself would make every honest landing look like drift and prove nothing about doctrine.
  // The independent doctrine basis persists across landing; only the custody clause moves.
  assert(/source-doctrine files/i.test(target.evidence), "target architecture evidence lost its independent doctrine basis");
  if (canonicalManifest.status === "CANDIDATE_NOT_LANDED") {
    assert(/candidate not landed/i.test(target.evidence), "candidate architecture evidence must remain explicitly not landed");
  }
  assert(target.evidenceRef.startsWith(`Dhenz14/Hive-AI source baseline ${canonicalManifest.evidenceSourceCommit}:`),
    "target architecture evidence is not bound to the exact evidence baseline commit");
  const doctrinePrefix = `Dhenz14/Hive-AI source baseline ${canonicalManifest.evidenceSourceCommit}:`;
  // Landing appends a readback clause; doctrine references are only the candidate prefix.
  const landingMarker = "; later landing readback ";
  const doctrineSection = target.evidenceRef.includes(landingMarker)
    ? target.evidenceRef.slice(0, target.evidenceRef.indexOf(landingMarker))
    : target.evidenceRef;
  // The doctrine basis must be independent of the manifest it certifies. A landing
  // readback citing the landed digest is legitimate; doctrine citing it is circular.
  assert(!doctrineSection.includes(canonicalManifest.candidateSha256),
    "target architecture evidence must not cite the candidate manifest's own digest as its proof");
  const doctrineRefs = doctrineSection.slice(doctrinePrefix.length).split(";").map((entry) => entry.trim()).filter(Boolean);
  assert(doctrineRefs.length >= 3, "target architecture evidence must cite at least three independent doctrine files");
  for (const ref of doctrineRefs) {
    const parts = ref.split(/\s+sha256\s+/);
    assert(parts.length === 2 && parts[0].trim() && HEX64.test(parts[1].trim()),
      `target architecture doctrine reference is not an exact path+sha256 pair: ${ref}`);
  }
  if (canonicalManifest.status !== "CANDIDATE_NOT_LANDED") {
    assert(/landing readback hash verified/i.test(target.evidence)
      && target.evidenceRef.startsWith(CANDIDATE_TARGET_EVIDENCE_REF)
      && target.evidenceRef.includes(canonicalManifest.landedCommit ?? "\u0000"),
      "landed architecture evidence did not reconcile candidate and landing custody");
  }

  const sourceAtlas = manifest.truth_subjects.source_atlas;
  exactKeys(sourceAtlas, [
    ...SUBJECT_BASE_KEYS, "sourceCommit", "sourceTree", "graphHash", "snapshotHash", "neurons", "trainable",
    "deterministic", "divisions", "families", "rowBackedTwitchProofs",
  ], "source atlas subject");
  assert(sourceAtlas.sourceTree === canonicalManifest.evidenceSourceTree,
    "source atlas tree drifted from the canonical evidence baseline tree");
  assert(sourceAtlas.sourceCommit === canonicalManifest.evidenceSourceCommit,
    "source atlas commit drifted from the canonical evidence baseline commit");
  assert(sourceAtlas.sourceCommit === manifest.source.sourceCommit
    && sourceAtlas.graphHash === manifest.source.graphHash
    && sourceAtlas.snapshotHash === manifest.source.snapshotHash
    && sourceAtlas.neurons === 640
    && sourceAtlas.trainable === 448
    && sourceAtlas.deterministic === 192
    && sourceAtlas.trainable + sourceAtlas.deterministic === sourceAtlas.neurons
    && sourceAtlas.divisions === 16
    && sourceAtlas.families === 64
    && sourceAtlas.rowBackedTwitchProofs === 636
    && /not runtime telemetry/i.test(sourceAtlas.claim), "source atlas facts or boundary drifted");
  if (facts) {
    assert(sourceAtlas.neurons === facts.hiveAi?.neurons
      && sourceAtlas.trainable === facts.hiveAi?.trainableNeurons
      && sourceAtlas.deterministic === facts.hiveAi?.deterministicNeurons
      && sourceAtlas.divisions === facts.hiveAi?.divisions
      && sourceAtlas.families === facts.hiveAi?.families
      && sourceAtlas.rowBackedTwitchProofs === facts.hiveAi?.twitches, "source atlas subject no longer matches public facts");
  }

  const tip = manifest.truth_subjects.tip_influence;
  exactKeys(tip, [
    ...SUBJECT_BASE_KEYS, "runtimeEnabled", "servedInfluenceEnabled", "productLiveClaimAllowed",
    "executeAuthorized", "permanentProductTurnWire", "safeToClaim100PercentProductLive", "reason",
  ], "tip influence subject");
  assert(tip.runtimeEnabled === 37
    && tip.servedInfluenceEnabled === 37
    && tip.productLiveClaimAllowed === 37
    && tip.executeAuthorized === false
    && tip.permanentProductTurnWire === false
    && tip.safeToClaim100PercentProductLive === false
    && tip.reason === "TIP_FUSE_CODE_BINDING_BYTES_MISMATCH_FAIL_CLOSED", "tip influence HOLD predicates drifted");

  const halos = manifest.truth_subjects.fleet_halos;
  exactKeys(halos, [...SUBJECT_BASE_KEYS, "declared", "admitted", "indexed", "runtime", "served", "productLive"], "fleet halo subject");
  assert(halos.declared === 640
    && halos.admitted === 0
    && halos.indexed === 0
    && halos.runtime === false
    && halos.served === false
    && halos.productLive === false
    && /logical HALO_DECLARED hard-off contracts/i.test(halos.claim)
    && /zero sections are admitted/i.test(halos.claim)
    && /zero indexes are materialized/i.test(halos.claim)
    && /no runtime, served, or product-live halo claim is granted/i.test(halos.claim), "declared halo fleet was promoted beyond evidence");

  const released = manifest.truth_subjects.released_tester_5;
  exactKeys(released, [
    ...SUBJECT_BASE_KEYS, "tag", "url", "releaseId", "assetId", "assetState", "responseChain", "tlsVerified",
    "bytes", "sha256", "artifactBytesIndependentlyVerified", "artifactSha256IndependentlyVerified",
    "authenticodeStatus", "publisherAuthenticated", "signedPublicRelease", "smartScreenWarningExpected",
    "artifactExecuted", "packageContentsStatus", "sourceCommit", "embeddedHiveAiCommit",
    "representsCurrentSourceAtlas", "verificationReceiptSha256",
  ], "released tester subject");
  // Remote outer bytes are now independently verified. That upgrade is confined to the
  // byte plane: contents, installation, execution, runtime and behavior stay unproven,
  // and the packaged Hive-AI generation stays explicitly older than the mapped atlas.
  assert(released.tag === "hive-ide-v0.3.0-tester.5"
    && released.subject_kind === "PUBLIC_RELEASE_REMOTE_ARTIFACT_BYTES"
    && released.claim_plane === "PUBLIC_REMOTE_BYTES_VERIFIED"
    && released.url === "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.5/Hive-IDE-OneClick-Windows-x64.exe"
    && !/tester\.6/.test(released.url)
    && Number.isSafeInteger(released.releaseId) && released.releaseId > 0
    && Number.isSafeInteger(released.assetId) && released.assetId > 0
    && released.assetState === "uploaded"
    && released.responseChain === "302_TO_200"
    && released.tlsVerified === true
    && released.bytes === 924864317
    && released.sha256 === "be1795640763e99315b426757c76d655f6f07f92701d040c62f6126c1401b000", "released tester artifact identity drifted");
  assert(released.artifactBytesIndependentlyVerified === true
    && released.artifactSha256IndependentlyVerified === true
    && HEX64.test(released.verificationReceiptSha256)
    && released.evidenceRef.includes(released.verificationReceiptSha256), "independent byte verification is not bound to an exact observation receipt");
  assert(released.authenticodeStatus === "NotSigned"
    && released.publisherAuthenticated === false
    && released.signedPublicRelease === false
    && released.smartScreenWarningExpected === true, "unsigned publisher disclosure drifted");
  assert(released.artifactExecuted === false
    && released.packageContentsStatus === "UNKNOWN_NOT_INSPECTED", "verified outer bytes were promoted into contents or execution proof");
  assert(released.sourceCommit === "6f7fd8a9a18c8921aa0fad1fe5b0b901bacd3383"
    && released.embeddedHiveAiCommit === "a0fe64832edb801c9944c0923e222a64ef14e498"
    && released.embeddedHiveAiCommit !== manifest.source.sourceCommit
    && released.representsCurrentSourceAtlas === false, "the downloadable tester was joined to the current atlas generation");
  assert(Date.parse(released.validUntil) > Date.parse(released.verifiedAt)
    && /raw HTTP bytes were not retained/i.test(released.evidence)
    && /independent bounded GitHub API, TLS, full-body remote download/i.test(released.evidence)
    && /Authenticode is NotSigned/i.test(released.claim)
    && /Package contents, installation, execution, runtime, and behavior remain unproven/i.test(released.claim)
    && /declared embedded Hive-AI source is older than the atlas/i.test(released.claim), "released tester byte verification lost its non-proof boundary");
  if (latest) {
    // v2 feed: publisher and byte-observation facts moved into their own planes.
    assert(released.url === latest.installerUrl
      && released.bytes === latest.installerSizeBytes
      && released.sha256 === latest.installerSha256
      && released.sourceCommit === latest.sourceCommit
      && released.embeddedHiveAiCommit === latest.embeddedHiveAiCommit
      && released.tag === latest.releaseTag, "released tester subject is stale against latest.json");
    assert(released.publisherAuthenticated === latest.publisherAuthentication?.publisherAuthenticated
      && released.smartScreenWarningExpected === latest.publisherAuthentication?.smartScreenWarningExpected
      && released.authenticodeStatus === latest.publisherAuthentication?.authenticodeStatus, "released tester publisher disclosure disagrees with latest.json");
    const observation = latest.outerExecutableObservation;
    assert(isPlainObject(observation)
      && observation.status === "PUBLIC_REMOTE_BYTES_VERIFIED"
      && observation.releaseId === released.releaseId
      && observation.assetId === released.assetId
      && observation.assetState === released.assetState
      && observation.responseChain === released.responseChain
      && observation.tlsVerified === released.tlsVerified
      && observation.fullBodyDownloaded === true
      && observation.exactByteCountMatched === released.artifactBytesIndependentlyVerified
      && observation.exactSha256Matched === released.artifactSha256IndependentlyVerified
      && observation.evidenceReceiptSha256 === released.verificationReceiptSha256
      && observation.validUntilUtc === released.validUntil, "released tester byte observation disagrees with latest.json");
    // The receipt lives in an unlanded Hive-AI candidate; the feed must say so rather
    // than implying a landed, publicly retrievable proof.
    assert(observation.evidenceReceiptAvailability === "SOURCE_CANDIDATE_NOT_LANDED"
      && HEX40.test(observation.evidenceReceiptGitBlobOid ?? "")
      && observation.rawHttpRetained === false
      && observation.independentlySigned === false, "byte-observation receipt custody was overstated");
    assert(latest.downloadDisposition?.status === "HOLD"
      && latest.downloadDisposition?.activeDownloadAuthorized === false, "verified bytes were promoted into an authorized download");
  }
  if (releaseManifest) {
    // v2 truth manifest: source identities moved under sourceDeclarations.
    assert(releaseManifest.schema === "hive.ide.public_release_truth_manifest.v2", "release truth manifest schema drifted");
    assert(released.embeddedHiveAiCommit === releaseManifest.sourceDeclarations?.hiveAi?.commit
      && released.sourceCommit === releaseManifest.sourceDeclarations?.hiveIde?.commit, "released tester embedded Hive-AI identity drifted");
    assert(releaseManifest.downloadDisposition?.status === "HOLD", "release truth manifest authorized a held download");
  }

  // ---- tester.6: held after a real readback, never presented as public ----
  const tester6 = manifest.truth_subjects.candidate_tester_6_publication;
  exactKeys(tester6, [
    ...SUBJECT_BASE_KEYS, "tag", "githubReleaseApiStatus", "url", "bytes", "sha256", "signatureStatus", "readbackReceiptSha256",
  ], "tester.6 publication subject");
  assert(tester6.tag === "hive-ide-v0.3.0-tester.6"
    && tester6.githubReleaseApiStatus === 404
    && tester6.url === null
    && tester6.bytes === null
    && tester6.sha256 === null
    && tester6.signatureStatus === "UNKNOWN"
    && HEX64.test(tester6.readbackReceiptSha256)
    && tester6.evidenceRef.includes(tester6.readbackReceiptSha256)
    && /held and not public at this readback/i.test(tester6.claim)
    && /canonical mirrors continued to name tester\.5/i.test(tester6.claim), "tester.6 was promoted out of its held, unpublished state");
  assert(tester6.readbackReceiptSha256 !== released.verificationReceiptSha256,
    "tester.5 and tester.6 must not share one observation receipt");

  // ---- Windows + WSL: candidate design only, explicitly non-durable ----
  const wsl = manifest.truth_subjects.windows_wsl_candidate_design;
  exactKeys(wsl, [
    ...SUBJECT_BASE_KEYS, "ownerRepository", "repositoryRef", "repositoryCommit", "designTopology", "evidencePersistence",
  ], "windows/WSL candidate design subject");
  assert(wsl.ownerRepository === "Hive IDE"
    && typeof wsl.repositoryRef === "string" && wsl.repositoryRef.trim()
    && HEX40.test(wsl.repositoryCommit)
    && wsl.evidencePersistence === "NON_DURABLE_REVIEWER_OBSERVATION_NO_SOURCE_CONTROLLED_RECEIPT"
    && /candidate design, not landing, installation, or runtime proof/i.test(wsl.claim), "Windows/WSL candidate design was promoted beyond a non-durable observation");

  // ---- platform publications with no admissible observation ----
  const linuxPublication = manifest.truth_subjects.linux_hive_ide_publication;
  exactKeys(linuxPublication, [...SUBJECT_BASE_KEYS, "platform", "url", "bytes", "sha256", "signatureStatus", "unknownReason"], "linux publication subject");
  assert(linuxPublication.platform === "linux"
    && linuxPublication.url === null && linuxPublication.bytes === null
    && linuxPublication.sha256 === null && linuxPublication.signatureStatus === null
    && /no bounded current native linux hive ide publication observation is admitted/i.test(linuxPublication.unknownReason)
    && /make no availability, signing, install, runtime, or behavior claim/i.test(linuxPublication.claim), "Linux publication state was invented");

  const macosPublication = manifest.truth_subjects.macos_hive_ide_publication;
  exactKeys(macosPublication, [...SUBJECT_BASE_KEYS, "platform", "url", "bytes", "sha256", "signatureStatus", "notarizationStatus", "holdReason"], "macOS publication subject");
  assert(macosPublication.platform === "macos"
    && macosPublication.url === null && macosPublication.bytes === null
    && macosPublication.sha256 === null && macosPublication.signatureStatus === null
    && macosPublication.notarizationStatus === null
    && /no bounded current macos hive ide package, signature, or notarization observation is admitted/i.test(macosPublication.holdReason)
    // absence of evidence is held, not converted into evidence of absence
    && /not proof of universal nonexistence/i.test(macosPublication.claim), "macOS hold was converted into a nonexistence claim");

  // ---- runtime and behavior: this site never probes the visitor's machine ----
  const installedRuntime = manifest.truth_subjects.installed_runtime;
  exactKeys(installedRuntime, [...SUBJECT_BASE_KEYS, "runtimeSourceCommit", "installPath", "healthStatus", "attestationRef", "unknownReason"], "installed runtime subject");
  assert(installedRuntime.runtimeSourceCommit === null && installedRuntime.installPath === null
    && installedRuntime.healthStatus === null && installedRuntime.attestationRef === null
    && /cannot identify or attest a specific installed machine runtime/i.test(installedRuntime.unknownReason)
    && /neither probes nor claims an installed Hive runtime/i.test(installedRuntime.claim), "installed runtime UNKNOWN boundary drifted");

  const observedBehavior = manifest.truth_subjects.observed_behavior;
  exactKeys(observedBehavior, [...SUBJECT_BASE_KEYS, "observationId", "runtimeIdentityRef", "behaviorStatus", "receiptRef", "unknownReason"], "observed behavior subject");
  assert(observedBehavior.observationId === null && observedBehavior.runtimeIdentityRef === null
    && observedBehavior.behaviorStatus === null && observedBehavior.receiptRef === null
    && /no live behavior probe is part of this source-only manifest/i.test(observedBehavior.unknownReason)
    && /do not prove request success, route availability, chat, mutations, or product-live behavior/i.test(observedBehavior.claim), "observed behavior UNKNOWN boundary drifted");

  assert(manifest.atlasTesterMatch === "MISMATCH", "atlas and released tester must remain an explicit MISMATCH");
  exactKeys(manifest.relations, ["atlasTester", "testerSubjects", "candidateServed"], "product truth relations");
  exactKeys(manifest.relations.atlasTester, ["status", "atlasSourceCommit", "testerEmbeddedHiveAiCommit", "claim"], "atlas-tester relation");
  assert(manifest.relations.atlasTester.status === "MISMATCH"
    && manifest.relations.atlasTester.atlasSourceCommit === sourceAtlas.sourceCommit
    && manifest.relations.atlasTester.testerEmbeddedHiveAiCommit === released.embeddedHiveAiCommit
    && manifest.relations.atlasTester.atlasSourceCommit !== manifest.relations.atlasTester.testerEmbeddedHiveAiCommit
    && /(?:must|may) not be presented as realizing (?:it|that Constellation)/i.test(manifest.relations.atlasTester.claim), "atlas-tester generation mismatch was hidden or misclassified");

  // tester.5 and tester.6 are separate subjects with separate clocks; collapsing them is
  // how a verified older artifact starts to stand in for an unpublished newer one.
  exactKeys(manifest.relations.testerSubjects, ["status", "tester5Subject", "tester6Subject", "claim"], "tester subject relation");
  assert(manifest.relations.testerSubjects.status === "SEPARATE_SUBJECTS"
    && manifest.relations.testerSubjects.tester5Subject === "released_tester_5"
    && manifest.relations.testerSubjects.tester6Subject === "candidate_tester_6_publication"
    && /independent identities, evidence planes, observations, and expiry clocks/i.test(manifest.relations.testerSubjects.claim), "tester.5 and tester.6 subjects were merged");

  exactKeys(manifest.relations.candidateServed, ["status", "claim"], "candidate/served relation");
  assert(manifest.relations.candidateServed.status === canonicalManifest.status, "candidate/served relation drifted from canonical custody");
  // Landing may only retire the landing/main disclaimer. Runtime, behavior, authority and
  // product-live must stay disclaimed on both sides of a landing.
  assert(/installed-runtime, behavior, authority, or product-live claim is allowed/i.test(manifest.relations.candidateServed.claim),
    "candidate/served relation stopped disclaiming runtime, behavior, authority or product-live");
  if (canonicalManifest.status === "CANDIDATE_NOT_LANDED") {
    assert(/No landing, main, installed-runtime, behavior, authority, or product-live claim is allowed/i.test(manifest.relations.candidateServed.claim),
      "unlanded candidate/served relation must also disclaim landing and main");
  }

  assert(Array.isArray(manifest.definitions) && manifest.definitions.length === EXPECTED_DEFINITION_IDS.length, "metaphor definition roster drifted");
  assert(JSON.stringify(manifest.definitions.map((entry) => entry.id)) === JSON.stringify(EXPECTED_DEFINITION_IDS), "metaphor definition order or identities drifted");
  for (const definition of manifest.definitions) exactKeys(definition, ["id", "label", "definition", "boundary"], `definition ${definition?.id || "unknown"}`);
  const definitions = Object.fromEntries(manifest.definitions.map((entry) => [entry.id, entry]));
  // Every metaphor must resolve to a mechanism and carry its own non-proof boundary.
  assert(/deterministic or trainable classification/i.test(definitions.neuron.definition)
    && /activation contract/i.test(definitions.neuron.definition)
    && /never means one scalar neural-network weight/i.test(definitions.neuron.boundary)
    && /catalog presence never means active, trained, running, served, or product-live/i.test(definitions.neuron.boundary), "neuron definition excludes deterministic substrates or collapses to a scalar weight");
  assert(/bounded neuron-local retrieval and evidence context contract/i.test(definitions.halo.definition)
    && /zero admitted sections and zero materialized indexes/i.test(definitions.halo.boundary)
    && /HALO_DECLARED never means populated, indexed, retrievable, connected, running, served, or product-live/i.test(definitions.halo.boundary), "halo definition exceeds the declared hard-off fleet truth");
  // The visual "halo" naming collision is resolved: rings are geometry, halos are memory.
  assert(/ring or orbit is authored visual geometry/i.test(definitions["division-family"].boundary)
    && /(?:never|not) a retrieval halo/i.test(definitions["division-family"].boundary), "visual division ring conflicts with the neuron halo contract");
  assert(/formal row-backed/i.test(definitions.twitch.definition)
    && /not automatic execution/i.test(definitions.twitch.boundary)
    && /not.*runtime availability/i.test(definitions.twitch.boundary)
    && /not.*served influence/i.test(definitions.twitch.boundary)
    && /not.*product-live authority/i.test(definitions.twitch.boundary), "Twitch definition was conflated with current liveness");
  assert(/not one monolithic general model/i.test(definitions.hivebrain.boundary)
    && /not proof that an installed runtime performed the target path/i.test(definitions.hivebrain.boundary), "HiveBrain definition was collapsed into a single model or an installed-runtime claim");
  assert(/(?:is )?not brain authority/i.test(definitions["living-anatomy"].boundary)
    && /authored geometry does not become runtime proof/i.test(definitions["living-anatomy"].boundary), "Living Anatomy was granted brain authority");

  const registry = manifest.registryClaimCut;
  exactKeys(registry, [
    "status", "sourceCommit", "derivedAt", "authority", "runtimeEnabled", "servedInfluenceEnabled", "productLiveClaimAllowed",
    "executeAuthorized", "permanentProductTurnWire", "safeToClaim100PercentProductLive", "reason", "boundary",
  ], "registry claim cut");
  assert(registry.status === "HOLD"
    && registry.sourceCommit === manifest.source.sourceCommit
    && UTC_SECONDS.test(registry.derivedAt)
    && registry.runtimeEnabled === tip.runtimeEnabled
    && registry.servedInfluenceEnabled === tip.servedInfluenceEnabled
    && registry.productLiveClaimAllowed === tip.productLiveClaimAllowed
    && registry.executeAuthorized === false
    && registry.permanentProductTurnWire === false
    && registry.safeToClaim100PercentProductLive === false
    && registry.reason === tip.reason
    && /not observation of an installed or running process/i.test(registry.boundary), "registry fixed-cut HOLD was promoted or mismatched");

  assert(Array.isArray(manifest.platforms) && JSON.stringify(manifest.platforms.map((entry) => entry.id)) === JSON.stringify(EXPECTED_PLATFORM_IDS), "platform roster drifted");
  for (const platform of manifest.platforms) {
    exactKeys(platform, [
      "id", "label", "subjectId", "subjectKind", "claimPlane", "scope", "supportStatus", "testStatus",
      "packageStatus", "signingStatus", "evidence", "evidenceRef", "verifiedAt", "validUntil", "freshness",
    ], `platform ${platform?.id || "unknown"}`);
    assert(typeof platform.evidence === "string" && platform.evidence.trim(), `platform ${platform.id} evidence missing`);
    // Every platform row must inherit its evidence from a declared truth subject. A row
    // may never mint its own verification window or outrank the subject it rests on.
    const subject = manifest.truth_subjects[platform.subjectId];
    assert(isPlainObject(subject), `platform ${platform.id} is not bound to a declared truth subject`);
    assert(platform.subjectKind === subject.subject_kind
      && platform.claimPlane === subject.claim_plane, `platform ${platform.id} misreports its subject kind or claim plane`);
    assert(platform.verifiedAt === subject.verifiedAt
      && platform.validUntil === subject.validUntil, `platform ${platform.id} verification window drifted from ${platform.subjectId}`);
    if (subject.verifiedAt === null) {
      // With no admissible observation a row may only report UNKNOWN (no information) or
      // HELD_* (no position pending proof). It may never assert a positive availability,
      // package, or signing state, and HELD must not slide into proof of nonexistence.
      const withheld = (value) => value === "UNKNOWN" || /^HELD_/.test(value);
      assert(platform.evidenceRef === null
        && (platform.freshness === "UNKNOWN" || platform.freshness === "HELD_NO_ADMISSIBLE_OBSERVATION")
        && withheld(platform.supportStatus) && withheld(platform.testStatus)
        && withheld(platform.packageStatus) && withheld(platform.signingStatus), `platform ${platform.id} invented status without an observation`);
      assert(platform.claimPlane === "UNKNOWN" || /not proof of universal nonexistence/i.test(platform.evidence),
        `platform ${platform.id} converted a hold into proof of nonexistence`);
    } else {
      assert(typeof platform.evidenceRef === "string" && platform.evidenceRef.includes(`truth_subjects.${platform.subjectId}`), `platform ${platform.id} evidence reference is not bound to its subject`);
      assert(UTC_INSTANT.test(platform.verifiedAt), `platform ${platform.id} verification time malformed`);
      assert(platform.validUntil === null
        || (UTC_INSTANT.test(platform.validUntil) && Date.parse(platform.validUntil) > Date.parse(platform.verifiedAt)), `platform ${platform.id} validity window malformed`);
    }
  }
  const platforms = Object.fromEntries(manifest.platforms.map((entry) => [entry.id, entry]));

  assert(platforms["windows-x64-remote"].subjectId === "released_tester_5"
    && platforms["windows-x64-remote"].supportStatus === "PUBLIC_RELEASE_AVAILABLE_UNSIGNED"
    && platforms["windows-x64-remote"].testStatus === "REMOTE_BYTES_VERIFIED_NOT_EXECUTED"
    && platforms["windows-x64-remote"].signingStatus === "AUTHENTICODE_NOT_SIGNED"
    && /Contents, install, execution, runtime, and behavior remain unproven/i.test(platforms["windows-x64-remote"].evidence)
    && /embedded Hive-AI source is older than the atlas/i.test(platforms["windows-x64-remote"].evidence), "Windows tester row was promoted past verified outer bytes");

  assert(platforms["windows-wsl-design"].subjectId === "windows_wsl_candidate_design"
    && platforms["windows-wsl-design"].supportStatus === "DECLARED_INSIDE_WINDOWS_TESTER_PATH"
    && platforms["windows-wsl-design"].testStatus === "NOT_A_SEPARATE_PUBLIC_PACKAGE"
    && platforms["windows-wsl-design"].packageStatus === "BUNDLED_TOPOLOGY_NOT_PLATFORM_ARTIFACT"
    && platforms["windows-wsl-design"].signingStatus === "NOT_APPLICABLE"
    && /not durable custody, a second package, landing, installation, or runtime proof/i.test(platforms["windows-wsl-design"].evidence), "Windows+WSL row was promoted into a separate package or runtime claim");

  // The two Linux rows are the whole point of the split: a source path is not a package.
  assert(platforms["linux-source"].subjectId === "source_atlas"
    && platforms["linux-source"].supportStatus === "SOURCE_PATH_PRESENT"
    && platforms["linux-source"].testStatus === "SOURCE_ONLY"
    && platforms["linux-source"].packageStatus === "NOT_A_PUBLIC_IDE_PACKAGE_CLAIM"
    && /makes no native public Hive IDE package claim/i.test(platforms["linux-source"].evidence), "Linux source scope was promoted into a published package");
  assert(platforms["linux-publication"].subjectId === "linux_hive_ide_publication"
    && /make no availability, signing, install, runtime, or behavior claim/i.test(platforms["linux-publication"].evidence), "Linux publication row invented availability");

  assert(platforms["macos-publication"].subjectId === "macos_hive_ide_publication", "macOS row is not bound to the macOS publication subject");

  exactKeys(manifest.integrityBoundary, [
    "manifestSelfHashProvesSemanticTruth", "authorityConferred", "sourceCandidateNotLanded", "claim",
  ], "manifest integrity boundary");
  assert(manifest.integrityBoundary.manifestSelfHashProvesSemanticTruth === false
    && manifest.integrityBoundary.authorityConferred === false
    && manifest.integrityBoundary.sourceCandidateNotLanded === (canonicalManifest.status === "CANDIDATE_NOT_LANDED")
    && /not a detached signature/i.test(manifest.integrityBoundary.claim)
    && /served\/main receipt/i.test(manifest.integrityBoundary.claim)
    && /runtime attestation/i.test(manifest.integrityBoundary.claim)
    && /operator grant/i.test(manifest.integrityBoundary.claim)
    && /product-live authority/i.test(manifest.integrityBoundary.claim), "manifest self-hash was promoted into a semantic oracle");

  exactKeys(manifest.bindingDigest, ["algorithm", "canonicalization", "excluded", "value"], "product truth binding digest");
  assert(manifest.bindingDigest.algorithm === "sha256", "product truth digest algorithm drifted");
  assert(manifest.bindingDigest.canonicalization === "recursive-key-sort-json-utf8", "product truth canonicalization recipe drifted");
  assert(Array.isArray(manifest.bindingDigest.excluded)
    && JSON.stringify(manifest.bindingDigest.excluded) === JSON.stringify(["bindingDigest"]), "product truth digest exclusions drifted");
  assert(HEX64.test(manifest.bindingDigest.value), "product truth digest is not an exact SHA-256");
  const { bindingDigest, ...digestBody } = manifest;
  assert(manifest.bindingDigest.value === sha256(canonicalJson(digestBody)), "product truth full-projection digest mismatch");
  if (canonicalManifest.status === "CANDIDATE_NOT_LANDED") {
    assert(manifest.bindingDigest.value === EXPECTED_CANDIDATE_BINDING_DIGEST, "candidate product truth projection drifted from the independently frozen full digest");
  } else {
    const candidateBaseline = structuredClone(manifest);
    candidateBaseline.canonicalManifest.status = "CANDIDATE_NOT_LANDED";
    candidateBaseline.canonicalManifest.landedCommit = null;
    candidateBaseline.canonicalManifest.landedTree = null;
    candidateBaseline.canonicalManifest.landedSha256 = null;
    candidateBaseline.canonicalManifest.landedBytes = null;
    candidateBaseline.canonicalManifest.landedGitBlobOid = null;
    candidateBaseline.canonicalManifest.audit.bindingStatus = "CANDIDATE_NOT_LANDED";
    candidateBaseline.integrityBoundary.sourceCandidateNotLanded = true;
    candidateBaseline.relations.candidateServed.status = "CANDIDATE_NOT_LANDED";
    candidateBaseline.relations.candidateServed.claim = CANDIDATE_SERVED_CLAIM;
    candidateBaseline.truth_subjects.target_architecture.evidence = CANDIDATE_TARGET_EVIDENCE;
    candidateBaseline.truth_subjects.target_architecture.evidenceRef = CANDIDATE_TARGET_EVIDENCE_REF;
    delete candidateBaseline.bindingDigest;
    assert(sha256(canonicalJson(candidateBaseline)) === EXPECTED_CANDIDATE_BINDING_DIGEST, "landed projection contains drift beyond the independently expected landing reconciliation");
  }

  const serialized = JSON.stringify(manifest);
  assert(!/releases\/download\/[^"']*tester\.6/i.test(serialized), "unpublished tester.6 URL leaked into product truth");
  assert(!/Authenticated local (?:body|runtime|Living Anatomy)/i.test(serialized), "whole local body or runtime was incorrectly called authenticated");
  return manifest;
}

function expectReject(label, manifest, context, mutate) {
  const fixture = structuredClone(manifest);
  mutate(fixture);
  try {
    validateProductTruth(fixture, context);
  } catch {
    return { label, passed: true };
  }
  return { label, passed: false };
}

function rebindFullProjection(fixture) {
  const { bindingDigest, ...digestBody } = fixture;
  fixture.bindingDigest.value = sha256(canonicalJson(digestBody));
}

function validateLandingExpectation(expectedLanding) {
  assert(isPlainObject(expectedLanding), "landing expectation must be an object");
  exactKeys(expectedLanding, ["commit", "tree", "sha256", "bytes", "blobOid"], "landing expectation");
  assert(HEX40.test(expectedLanding.commit), "landing expectation commit must be exact 40-hex Git identity");
  assert(HEX40.test(expectedLanding.tree), "landing expectation tree must be exact 40-hex Git identity");
  assert(HEX40.test(expectedLanding.blobOid), "landing expectation blob OID must be exact 40-hex Git identity");
  assert(HEX64.test(expectedLanding.sha256), "landing expectation SHA-256 must be exact 64-hex");
  assert(Number.isSafeInteger(expectedLanding.bytes) && expectedLanding.bytes > 0, "landing expectation byte count must be a positive safe integer");
  return expectedLanding;
}

export function projectVerifiedLanding(manifest, expectedLanding) {
  const landing = validateLandingExpectation(expectedLanding);
  const projected = structuredClone(manifest);
  assert(projected.canonicalManifest?.status === "CANDIDATE_NOT_LANDED", "only a candidate projection can be advanced in memory");
  projected.canonicalManifest.status = "LANDED_HASH_VERIFIED";
  projected.canonicalManifest.landedCommit = landing.commit;
  projected.canonicalManifest.landedTree = landing.tree;
  projected.canonicalManifest.landedSha256 = landing.sha256;
  projected.canonicalManifest.landedBytes = landing.bytes;
  projected.canonicalManifest.landedGitBlobOid = landing.blobOid;
  projected.canonicalManifest.audit.bindingStatus = "LANDED_HASH_VERIFIED";
  projected.integrityBoundary.sourceCandidateNotLanded = false;
  projected.relations.candidateServed.status = "LANDED_HASH_VERIFIED";
  projected.relations.candidateServed.claim = "The canonical source candidate is landed and hash-verified at the stated commit. No installed-runtime, behavior, authority, or product-live claim is allowed.";
  const target = projected.truth_subjects?.target_architecture;
  assert(isPlainObject(target), "target architecture subject missing from landing projection");
  // Landing adds a readback to the doctrine evidence; it never replaces the independent
  // source-doctrine references the subject already rests on.
  target.evidence = "Exact source-doctrine files and the strict canonical candidate audit at the evidence baseline; landing readback hash verified";
  target.evidenceRef = `${CANDIDATE_TARGET_EVIDENCE_REF}; later landing readback Dhenz14/Hive-AI@${landing.commit}: ${projected.canonicalManifest.path} sha256 ${landing.sha256}; ${landing.bytes} bytes`;
  rebindFullProjection(projected);
  return projected;
}

function expectRejectRebound(label, manifest, context, mutate) {
  return expectReject(label, manifest, context, (fixture) => {
    mutate(fixture);
    rebindFullProjection(fixture);
  });
}

export function runProductTruthSelfTests(manifest, context) {
  validateProductTruth(manifest, context);
  const simulatedLandingExpectation = { commit: "1".repeat(40), tree: "3".repeat(40), sha256: "2".repeat(64), bytes: manifest.canonicalManifest.candidateBytes + 12, blobOid: "4".repeat(40) };
  let simulatedLandingPassed = false;
  if (manifest.canonicalManifest.status === "CANDIDATE_NOT_LANDED") {
    const projectedLanding = projectVerifiedLanding(manifest, simulatedLandingExpectation);
    try {
      validateProductTruth(projectedLanding, { ...context, expectedLanding: simulatedLandingExpectation });
      simulatedLandingPassed = true;
    } catch {
      simulatedLandingPassed = false;
    }
  } else if (manifest.canonicalManifest.status === "LANDED_HASH_VERIFIED" && context.expectedLanding) {
    simulatedLandingPassed = true;
  }
  const tests = [
    { label: "valid_full_projection", passed: true },
    { label: "externally_expected_landing_projection", passed: simulatedLandingPassed },
    expectReject("full_digest_claim_tamper_refused", manifest, context, (value) => { value.truth_subjects.target_architecture.claim += " tampered"; }),
    expectReject("full_digest_platform_tamper_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "linux-source").evidence += " tampered"; }),
    expectRejectRebound("unknown_top_level_field_refused", manifest, context, (value) => { value.untrusted = true; }),
    expectRejectRebound("unknown_nested_field_refused", manifest, context, (value) => { value.truth_subjects.source_atlas.untrusted = true; }),
    expectRejectRebound("candidate_manifest_digest_mismatch_refused", manifest, context, (value) => { value.canonicalManifest.candidateSha256 = "0".repeat(64); }),
    expectRejectRebound("candidate_manifest_fake_landing_refused", manifest, context, (value) => { value.canonicalManifest.landedCommit = "1".repeat(40); }),
    expectRejectRebound("candidate_landing_copy_promotion_refused", manifest, context, (value) => {
      value.truth_subjects.target_architecture.evidence = "Canonical architecture contract is landed.";
      value.truth_subjects.target_architecture.evidenceRef = "self-asserted landing";
    }),
    expectRejectRebound("unbound_landed_manifest_refused", manifest, context, (value) => {
      value.canonicalManifest.status = "LANDED_HASH_VERIFIED";
      value.canonicalManifest.landedCommit = "1".repeat(40);
      value.canonicalManifest.landedSha256 = "2".repeat(64);
      value.canonicalManifest.landedBytes = value.canonicalManifest.candidateBytes;
    }),
    expectRejectRebound("stale_source_commit_refused", manifest, context, (value) => { value.source.sourceCommit = "0".repeat(40); }),
    expectRejectRebound("stale_capture_refused", manifest, context, (value) => { value.source.capturedAt = "2026-08-22T04:59:30Z"; }),
    expectRejectRebound("graph_mismatch_refused", manifest, context, (value) => { value.source.graphHash = "0".repeat(64); }),
    expectRejectRebound("global_product_live_conflation_refused", manifest, context, (value) => { value.truth_subjects.installed_runtime.subject_status = "PRODUCT_LIVE"; }),
    expectRejectRebound("rehashed_false_target_claim_refused", manifest, context, (value) => { value.truth_subjects.target_architecture.claim = "Everything is product-live."; }),
    expectRejectRebound("rehashed_unfrozen_subject_evidence_ref_refused", manifest, context, (value) => { value.truth_subjects.source_atlas.evidenceRef = "self-attested"; }),
    expectRejectRebound("missing_subject_evidence_refused", manifest, context, (value) => { value.truth_subjects.observed_behavior.evidence = ""; }),
    expectRejectRebound("missing_non_unknown_evidence_ref_refused", manifest, context, (value) => { value.truth_subjects.source_atlas.evidenceRef = null; }),
    expectRejectRebound("missing_non_unknown_verified_at_refused", manifest, context, (value) => { value.truth_subjects.source_atlas.verifiedAt = null; }),
    expectRejectRebound("missing_non_unknown_freshness_refused", manifest, context, (value) => { value.truth_subjects.source_atlas.freshness = ""; }),
    expectRejectRebound("missing_non_unknown_invalidators_refused", manifest, context, (value) => { value.truth_subjects.source_atlas.invalidators = []; }),
    expectRejectRebound("historical_current_status_refused", manifest, context, (value) => { value.truth_subjects.target_architecture.freshness = "EXPIRED"; }),
    expectRejectRebound("reused_subject_evidence_refused", manifest, context, (value) => { value.truth_subjects.observed_behavior.evidence = value.truth_subjects.installed_runtime.evidence; }),
    expectRejectRebound("bare_no_llm_pass_refused", manifest, context, (value) => { value.boundaries.noLlmClaim.status = "PASS"; }),
    expectRejectRebound("external_fallback_rewrite_refused", manifest, context, (value) => { value.truth_subjects.target_architecture.implicitExternalFallback = true; }),
    expectRejectRebound("halo_live_promotion_refused", manifest, context, (value) => { value.truth_subjects.fleet_halos.runtime = true; }),
    expectRejectRebound("halo_inventory_rewrite_refused", manifest, context, (value) => { value.truth_subjects.fleet_halos.indexed = 640; }),
    expectRejectRebound("twitch_runtime_conflation_refused", manifest, context, (value) => { value.definitions.find((entry) => entry.id === "twitch").boundary = "A Twitch is live current execution."; }),
    expectRejectRebound("deterministic_neuron_erasure_refused", manifest, context, (value) => { value.truth_subjects.source_atlas.deterministic = 0; }),
    expectRejectRebound("atlas_tester_false_match_refused", manifest, context, (value) => { value.atlasTesterMatch = "MATCH"; }),
    expectRejectRebound("atlas_tester_commit_rewrite_refused", manifest, context, (value) => { value.relations.atlasTester.testerEmbeddedHiveAiCommit = value.relations.atlasTester.atlasSourceCommit; }),
    expectRejectRebound("tester6_promotion_refused", manifest, context, (value) => {
      value.truth_subjects.candidate_tester_6_publication.githubReleaseApiStatus = 200;
      value.truth_subjects.candidate_tester_6_publication.url = "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.6/Hive-IDE-OneClick-Windows-x64.exe";
    }),
    expectRejectRebound("tester6_url_refused", manifest, context, (value) => { value.truth_subjects.released_tester_5.url = value.truth_subjects.released_tester_5.url.replace("tester.5", "tester.6"); }),
    expectRejectRebound("tester6_receipt_reuse_refused", manifest, context, (value) => { value.truth_subjects.candidate_tester_6_publication.readbackReceiptSha256 = value.truth_subjects.released_tester_5.verificationReceiptSha256; }),
    expectRejectRebound("tester5_execution_promotion_refused", manifest, context, (value) => { value.truth_subjects.released_tester_5.artifactExecuted = true; }),
    expectRejectRebound("tester5_contents_promotion_refused", manifest, context, (value) => { value.truth_subjects.released_tester_5.packageContentsStatus = "VERIFIED"; }),
    expectRejectRebound("tester5_atlas_join_refused", manifest, context, (value) => { value.truth_subjects.released_tester_5.representsCurrentSourceAtlas = true; }),
    expectRejectRebound("macos_nonexistence_claim_refused", manifest, context, (value) => { value.truth_subjects.macos_hive_ide_publication.claim = "macOS is not supported and no package exists."; }),
    expectRejectRebound("linux_publication_invention_refused", manifest, context, (value) => {
      const row = value.platforms.find((entry) => entry.id === "linux-publication");
      row.packageStatus = "PUBLISHED";
      row.supportStatus = "SUPPORTED";
    }),
    expectRejectRebound("platform_minted_window_refused", manifest, context, (value) => {
      value.platforms.find((entry) => entry.id === "linux-publication").verifiedAt = "2026-08-23T19:20:09Z";
    }),
    expectRejectRebound("wsl_durability_promotion_refused", manifest, context, (value) => { value.truth_subjects.windows_wsl_candidate_design.evidencePersistence = "SOURCE_CONTROLLED_RECEIPT"; }),
    expectRejectRebound("conferred_authority_refused", manifest, context, (value) => { value.integrityBoundary.authorityConferred = true; }),
    expectRejectRebound("canonical_audit_conferral_refused", manifest, context, (value) => { value.canonicalManifest.audit.authorityConferred = true; }),
    expectRejectRebound("canonical_audit_binding_split_refused", manifest, context, (value) => {
      value.canonicalManifest.audit.bindingStatus = value.canonicalManifest.status === "CANDIDATE_NOT_LANDED"
        ? "LANDED_HASH_VERIFIED"
        : "CANDIDATE_NOT_LANDED";
    }),
    expectRejectRebound("self_referential_doctrine_evidence_refused", manifest, context, (value) => {
      value.truth_subjects.target_architecture.evidenceRef = `Dhenz14/Hive-AI source baseline ${value.canonicalManifest.evidenceSourceCommit}: configs/public/constellation_architecture_v1.json sha256 ${value.canonicalManifest.candidateSha256}`;
    }),
    expectRejectRebound("malformed_release_expiry_refused", manifest, context, (value) => { value.truth_subjects.released_tester_5.validUntil = "never"; }),
    expectRejectRebound("non_advancing_release_expiry_refused", manifest, context, (value) => { value.truth_subjects.released_tester_5.validUntil = value.truth_subjects.released_tester_5.verifiedAt; }),
    expectRejectRebound("signed_replay_refused", manifest, context, (value) => { value.truth_subjects.released_tester_5.publisherAuthenticated = true; }),
    expectRejectRebound("release_byte_count_mismatch_refused", manifest, context, (value) => { value.truth_subjects.released_tester_5.bytes += 1; }),
    expectRejectRebound("release_digest_mismatch_refused", manifest, context, (value) => { value.truth_subjects.released_tester_5.sha256 = "0".repeat(64); }),
    expectRejectRebound("metadata_promoted_to_remote_byte_verification_refused", manifest, context, (value) => {
      value.truth_subjects.released_tester_5.evidence = "Remote executable independently downloaded and hashed; PASS.";
      value.truth_subjects.released_tester_5.claim = "Public tester.5 executable bytes are verified and functionally certified.";
      value.truth_subjects.released_tester_5.artifact_bytes_independently_verified = true;
      value.truth_subjects.released_tester_5.artifact_sha256_independently_verified = true;
    }),
    expectRejectRebound("windows_metadata_promoted_to_verified_artifact_refused", manifest, context, (value) => {
      const windows = value.platforms.find((entry) => entry.id === "windows-x64-remote");
      windows.supportStatus = "PUBLIC_FUNCTIONAL_TESTING_ARTIFACT";
      windows.testStatus = "FUNCTIONALLY_CERTIFIED";
      windows.packageStatus = "PUBLIC_HTTPS_ARTIFACT_BYTES_VERIFIED";
    }),
    expectRejectRebound("linux_package_overclaim_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "linux-source").packageStatus = "PUBLIC_HTTPS_ARTIFACT"; }),
    expectRejectRebound("platform_missing_evidence_ref_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "windows-x64-remote").evidenceRef = ""; }),
    expectRejectRebound("platform_malformed_verified_at_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "windows-wsl-design").verifiedAt = "yesterday"; }),
    expectRejectRebound("platform_non_advancing_expiry_refused", manifest, context, (value) => {
      const platform = value.platforms.find((entry) => entry.id === "windows-x64-remote");
      platform.validUntil = platform.verifiedAt;
    }),
    expectRejectRebound("platform_release_window_mismatch_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "macos-publication").validUntil = "2026-08-25T18:46:30Z"; }),
    expectRejectRebound("wsl_runtime_proof_promotion_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "windows-wsl-design").supportStatus = "INSTALLED_RUNTIME_VERIFIED"; }),
    expectRejectRebound("platform_unknown_nested_field_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "windows-x64-remote").authority = "self-attested"; }),
    expectReject("digest_tamper_refused", manifest, context, (value) => { value.bindingDigest.value = "0".repeat(64); }),
    { label: "release_after_expiry_is_held", passed: releasedTesterAvailability(manifest, Date.parse(manifest.truth_subjects.released_tester_5.validUntil) + 1) === "PUBLICATION_FRESHNESS_EXPIRED_HELD" },
  ];
  try {
    parseJsonStrict('{"schema":"first","schema":"second"}', "duplicate-key fixture");
    tests.push({ label: "duplicate_json_key_refused", passed: false });
  } catch {
    tests.push({ label: "duplicate_json_key_refused", passed: true });
  }
  try {
    parseJsonStrict('{"truth_subjects":{"released_tester":{"claim":"first","claim":"second"}}}', "nested duplicate-key fixture");
    tests.push({ label: "nested_duplicate_json_key_refused", passed: false });
  } catch {
    tests.push({ label: "nested_duplicate_json_key_refused", passed: true });
  }
  try {
    parseJsonStrict('{"schema":', "malformed fixture");
    tests.push({ label: "malformed_json_refused", passed: false });
  } catch {
    tests.push({ label: "malformed_json_refused", passed: true });
  }
  try {
    parseJsonStrict('{"schema":"\uFFFD"}', "invalid UTF-8 fixture");
    tests.push({ label: "utf8_replacement_bytes_refused", passed: false });
  } catch {
    tests.push({ label: "utf8_replacement_bytes_refused", passed: true });
  }
  return tests;
}

function readStrictJson(filePath, maximumBytes, label) {
  const bytes = fs.readFileSync(filePath);
  assert(bytes.length > 0 && bytes.length <= maximumBytes, `${label} exceeds its static byte bounds`);
  return parseJsonStrict(bytes.toString("utf8"), label);
}

export function validatePublishedProductTruth({ selfTest = false, expectedLanding } = {}) {
  const manifest = readStrictJson(productTruthPath, 128 * 1024, "published product truth");
  const facts = readStrictJson(factsPath, 8 * 1024 * 1024, "public source snapshot");
  const latest = readStrictJson(latestPath, 64 * 1024, "Hive IDE latest feed");
  const releaseManifest = readStrictJson(releaseManifestPath, 512 * 1024, "Hive IDE release manifest");
  if (expectedLanding) validateLandingExpectation(expectedLanding);
  const context = { facts, latest, releaseManifest, expectedLanding };
  validateProductTruth(manifest, context);
  const tests = selfTest ? runProductTruthSelfTests(manifest, context) : [];
  if (selfTest) assert(tests.every((test) => test.passed), `product truth hostile self-test failed: ${tests.filter((test) => !test.passed).map((test) => test.label).join(",")}`);
  return { manifest, facts, latest, releaseManifest, tests };
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const valueAfter = (flag) => {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  // The landing this checkout is built to expect. Pinned so a bare run still verifies a
  // landed manifest against exact independent identities instead of skipping the check.
  const PINNED_LANDING = Object.freeze({
    commit: "0ab04f6c19ffd41bb162bea674e77853fb27cc0e",
    tree: "1de15a085a7c41788214d5c0d9c0dfaf4f02eb1c",
    sha256: "a4a336b47c3a28da3c08c79b07ff2ef92702dc35c09f8a330df74368faf7f056",
    bytes: 49342,
    blobOid: "c1036d2fc877e058965688fe8da5097576a37826",
  });
  const landingFlags = ["--expect-landing-commit", "--expect-landing-tree", "--expect-landing-sha256", "--expect-landing-bytes", "--expect-landing-blob"];
  const landingFlagCount = landingFlags.filter((flag) => process.argv.includes(flag)).length;
  assert(landingFlagCount === 0 || landingFlagCount === landingFlags.length, "landing expectation requires commit, tree, SHA-256, byte-count, and blob flags together");
  const expectedLanding = landingFlagCount
    ? validateLandingExpectation({
      commit: valueAfter("--expect-landing-commit") ?? "",
      tree: valueAfter("--expect-landing-tree") ?? "",
      sha256: valueAfter("--expect-landing-sha256") ?? "",
      bytes: Number(valueAfter("--expect-landing-bytes")),
      blobOid: valueAfter("--expect-landing-blob") ?? "",
    })
    : PINNED_LANDING;
  if (process.argv.includes("--project-landing")) {
    assert(expectedLanding, "--project-landing requires every --expect-landing-* value");
    const result = validatePublishedProductTruth({ expectedLanding: undefined });
    const projected = projectVerifiedLanding(result.manifest, expectedLanding);
    validateProductTruth(projected, { facts: result.facts, latest: result.latest, releaseManifest: result.releaseManifest, expectedLanding });
    console.log(JSON.stringify(projected, null, 2));
  } else {
    const result = validatePublishedProductTruth({ selfTest: process.argv.includes("--self-test"), expectedLanding });
    if (result.tests.length) {
      console.log(JSON.stringify({ schema: "hive.ecosystem.product-truth-self-test.v1", ok: true, tests: result.tests }, null, 2));
    }
    console.log(`PRODUCT_TRUTH_OK source=${result.manifest.source.sourceCommit.slice(0, 12)} canonical=${result.manifest.canonicalManifest.status} atlas_tester=${result.manifest.atlasTesterMatch} digest=${result.manifest.bindingDigest.value}`);
  }
}
