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
  released_tester: "PUBLIC_RELEASE_METADATA_STALE_SUBJECT",
  installed_runtime: "UNKNOWN",
  observed_behavior: "UNKNOWN",
});
const SUBJECT_BASE_KEYS = Object.freeze(["subject_status", "evidence", "claim", "freshness", "invalidators", "evidenceRef", "verifiedAt"]);

const EXPECTED_DEFINITION_IDS = Object.freeze([
  "neuron",
  "halo",
  "division-family",
  "hivebrain",
  "twitch",
  "living-anatomy",
]);

const EXPECTED_PLATFORM_IDS = Object.freeze(["windows-x64", "windows-wsl", "linux-x64", "macos"]);
const EXPECTED_CANDIDATE_BINDING_DIGEST = "72bbd7d76634ce4453e4213f1347c6416f29339ca476ee9570181a978b4b470c";

export function releasedTesterAvailability(manifest, now = Date.now()) {
  const validUntil = Date.parse(manifest?.truth_subjects?.released_tester?.validUntil ?? "");
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
    "status", "repository", "path", "evidenceSourceCommit", "evidenceSourceTree", "candidateSha256", "candidateBytes",
    "landedCommit", "landedSha256", "landedBytes",
  ], "canonical manifest custody");
  const canonicalManifest = manifest.canonicalManifest;
  assert(canonicalManifest.repository === "Dhenz14/Hive-AI"
    && canonicalManifest.path === "configs/public/constellation_architecture_v1.json"
    && canonicalManifest.evidenceSourceCommit === "472131baa2bc212a043966773bd92477c3a8a16c"
    && canonicalManifest.evidenceSourceTree === "1910ab8b2bc7bcfe544b2d615f38ce2f9de5ce00"
    && canonicalManifest.candidateSha256 === "f29fe75be0209225178af018c466c198361c3f72440e70360b4b94edf7412911"
    && canonicalManifest.candidateBytes === 30589, "canonical manifest candidate custody drifted");
  if (canonicalManifest.status === "CANDIDATE_NOT_LANDED") {
    assert(canonicalManifest.landedCommit === null
      && canonicalManifest.landedSha256 === null
      && canonicalManifest.landedBytes === null
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
      && canonicalManifest.landedBytes === expectedLanding.bytes, "landed architecture contract lacks independent exact landing expectations");
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
  assert(/bounded public projection/i.test(manifest.source.projectionRole)
    && /not the canonical manifest (?:or|and not) runtime telemetry/i.test(manifest.source.projectionRole)
    && /candidate.*not.*claimed present.*evidence.*pin/i.test(manifest.source.projectionRole), "public projection role is not fail-closed");
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
  assert(manifest.architecture.status === "TARGET_DOCTRINE_AT_PIN", "target architecture display status drifted");
  assert(/hive-runtime/i.test(manifest.architecture.servingBoundary)
    && /deterministic scaffold/i.test(manifest.architecture.servingBoundary)
    && /No BYOM/i.test(manifest.architecture.servingBoundary)
    && /no implicit external-checkpoint fallback/i.test(manifest.architecture.servingBoundary)
    && /no local-model product serve path/i.test(manifest.architecture.servingBoundary)
    && /not a blanket no-LLM claim/i.test(manifest.architecture.servingBoundary)
    && /not installed-runtime behavior proof/i.test(manifest.architecture.servingBoundary), "serving boundary lost required qualifications");

  exactKeys(manifest.boundaries, ["architectureVsLive", "currentVsLegacy", "noLlmClaim"], "product truth boundaries");
  exactKeys(manifest.boundaries.architectureVsLive, ["status", "claim"], "architecture-versus-live boundary");
  exactKeys(manifest.boundaries.currentVsLegacy, ["status", "claim"], "current-versus-legacy boundary");
  exactKeys(manifest.boundaries.noLlmClaim, ["status", "claim", "exactBoundary"], "no-LLM boundary");
  assert(manifest.boundaries.architectureVsLive.status === "SEPARATE_PLANES"
    && /read-only GET surfaces/i.test(manifest.boundaries.architectureVsLive.claim)
    && /authority-bearing Mission Control mutations are credential-gated when configured/i.test(manifest.boundaries.architectureVsLive.claim)
    && /separate evidence/i.test(manifest.boundaries.architectureVsLive.claim), "architecture and local live truth were conflated");
  assert(manifest.boundaries.currentVsLegacy.status === "SUBJECT_SCOPED_DISPOSITIONS"
    && manifest.boundaries.currentVsLegacy.claim === "BYOM is RETIRED and external-checkpoint fallback is FORBIDDEN in the source-bound target doctrine. Electron desktop shell status is EXTERNAL_REPO_PROOF_REQUIRED: do not claim Electron removal from this Hive-AI source manifest alone. Docker client requirement is NOT_ADJUDICATED_BY_THIS_MANIFEST: do not claim all Docker code is removed; prove the exact client and package predicate in its owning repository.", "current and legacy subject dispositions drifted");
  assert(manifest.boundaries.noLlmClaim.status === "HOLD"
    && /does not publish a bare ['\u2018\u2019\"]no LLM/i.test(manifest.boundaries.noLlmClaim.claim)
    && /centralized AI-as-user/i.test(manifest.boundaries.noLlmClaim.exactBoundary)
    && /H10/i.test(manifest.boundaries.noLlmClaim.exactBoundary), "bare no-LLM claim is not held and precisely bounded");

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
    assert(subject.verifiedAt === null || UTC_SECONDS.test(subject.verifiedAt), `${subjectId} verification time malformed`);
    if (expectedStatus === "UNKNOWN") {
      assert(subject.evidenceRef === null && subject.verifiedAt === null && subject.freshness === "UNKNOWN", `${subjectId} UNKNOWN must not carry invented verification`);
    } else {
      assert(typeof subject.evidenceRef === "string" && subject.evidenceRef.trim()
        && UTC_SECONDS.test(subject.verifiedAt)
        && !/^(?:UNKNOWN|EXPIRED)$/i.test(subject.freshness), `${subjectId} non-UNKNOWN evidence metadata is incomplete or stale`);
    }
  }
  const subjectEvidence = Object.values(manifest.truth_subjects).map((subject) => subject.evidence);
  assert(new Set(subjectEvidence).size === subjectEvidence.length, "one evidence statement must not cover unrelated truth subjects");

  const target = manifest.truth_subjects.target_architecture;
  exactKeys(target, [
    ...SUBJECT_BASE_KEYS, "productLaneByom", "legacyApiNamesPresent", "implicitExternalFallback",
    "localModelProductServePath", "bareNoLlmClaimAllowed", "defaultPath", "inboundGenerationToday",
  ], "target architecture subject");
  assert(target.productLaneByom === false
    && target.legacyApiNamesPresent === true
    && target.implicitExternalFallback === false
    && target.localModelProductServePath === false
    && target.bareNoLlmClaimAllowed === false
    && target.defaultPath === "hive-runtime (constellation-local in-process deterministic scaffold)"
    && target.inboundGenerationToday === "centralized AI-as-user traffic until the custom generation head earns H10 serve influence"
    && /targets the HiveBrain Constellation on the hive-runtime default path/i.test(target.claim), "target architecture serving predicates drifted");
  const candidateEvidenceRef = `candidate ${canonicalManifest.path} sha256 ${canonicalManifest.candidateSha256}; NOT LANDED at evidence source pin`;
  if (canonicalManifest.status === "CANDIDATE_NOT_LANDED") {
    assert(target.evidence === "Operator-approved architecture contract candidate; not landed"
      && target.evidenceRef === candidateEvidenceRef, "candidate architecture evidence must remain explicitly not landed");
  } else {
    const landingEvidenceRef = `${candidateEvidenceRef}; later landing readback Dhenz14/Hive-AI@${canonicalManifest.landedCommit}: ${canonicalManifest.path} sha256 ${canonicalManifest.landedSha256}; ${canonicalManifest.landedBytes} bytes`;
    assert(target.evidence === "Operator-approved architecture contract candidate content; later landing readback hash verified"
      && target.evidenceRef === landingEvidenceRef
      && !/NOT LANDED$/.test(target.evidenceRef), "landed architecture evidence did not reconcile candidate and landing custody");
  }

  const sourceAtlas = manifest.truth_subjects.source_atlas;
  exactKeys(sourceAtlas, [
    ...SUBJECT_BASE_KEYS, "sourceCommit", "graphHash", "snapshotHash", "neurons", "trainable",
    "deterministic", "divisions", "families", "rowBackedTwitchProofs",
  ], "source atlas subject");
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
    && /logical HALO_DECLARED contracts/i.test(halos.claim), "declared halo fleet was promoted beyond evidence");

  const released = manifest.truth_subjects.released_tester;
  exactKeys(released, [
    ...SUBJECT_BASE_KEYS, "tag", "url", "bytes", "sha256", "publisherAuthenticated",
    "signedPublicRelease", "smartScreenWarningExpected", "sourceCommit", "embeddedHiveAiCommit", "tester6Public", "validUntil",
    "subject_kind", "claim_plane", "artifact_identity_evidence", "artifact_bytes_independently_verified", "artifact_sha256_independently_verified",
  ], "released tester subject");
  assert(released.tag === "hive-ide-v0.3.0-tester.5"
    && released.subject_kind === "PUBLIC_RELEASE_METADATA"
    && released.claim_plane === "PUBLIC_ARTIFACT_METADATA_VERIFIED"
    && released.artifact_identity_evidence === "PUBLIC_RELEASE_API_AND_FEED_METADATA_READBACK"
    && released.artifact_bytes_independently_verified === false
    && released.artifact_sha256_independently_verified === false
    && released.url === "https://github.com/Dhenz14/Dhenz14.github.io/releases/download/hive-ide-v0.3.0-tester.5/Hive-IDE-OneClick-Windows-x64.exe"
    && released.bytes === 924864317
    && released.sha256 === "be1795640763e99315b426757c76d655f6f07f92701d040c62f6126c1401b000"
    && released.publisherAuthenticated === false
    && released.signedPublicRelease === false
    && released.smartScreenWarningExpected === true
    && released.sourceCommit === "6f7fd8a9a18c8921aa0fad1fe5b0b901bacd3383"
    && released.embeddedHiveAiCommit === "a0fe64832edb801c9944c0923e222a64ef14e498"
    && released.tester6Public === false
    && released.validUntil === "2026-08-24T18:46:30Z"
    && Date.parse(released.validUntil) > Date.parse(released.verifiedAt)
    && /metadata readback/i.test(released.evidence)
    && /not independently fetched or hashed/i.test(released.evidence)
    && /metadata declares/i.test(released.claim)
    && /remote executable bytes remain independently UNVERIFIED until download and local hashing/i.test(released.claim)
    && /older Hive-AI generation/i.test(released.claim)
    && /not proof of the mapped Constellation/i.test(released.claim), "released tester metadata was promoted into byte verification or its stale-subject boundary drifted");
  if (latest) {
    assert(released.url === latest.installerUrl
      && released.bytes === latest.installerSizeBytes
      && released.sha256 === latest.installerSha256
      && released.publisherAuthenticated === latest.publisherAuthenticated
      && released.smartScreenWarningExpected === latest.smartScreenWarningExpected
      && released.sourceCommit === latest.sourceCommit, "released tester subject is stale against latest.json");
  }
  if (releaseManifest) {
    assert(released.embeddedHiveAiCommit === releaseManifest.source?.hiveAi?.commit, "released tester embedded Hive-AI identity drifted");
  }

  for (const subjectId of ["installed_runtime", "observed_behavior"]) {
    exactKeys(manifest.truth_subjects[subjectId], SUBJECT_BASE_KEYS, `${subjectId} subject`);
    assert(/required outside Pages/i.test(manifest.truth_subjects[subjectId].evidence)
      && /neither probes nor claims|do not prove/i.test(manifest.truth_subjects[subjectId].claim), `${subjectId} UNKNOWN boundary drifted`);
  }

  assert(manifest.atlasTesterMatch === "MISMATCH", "atlas and released tester must remain an explicit MISMATCH");
  exactKeys(manifest.relations, ["atlasTester"], "product truth relations");
  exactKeys(manifest.relations.atlasTester, ["status", "atlasSourceCommit", "testerEmbeddedHiveAiCommit", "claim"], "atlas-tester relation");
  assert(manifest.relations.atlasTester.status === "MISMATCH"
    && manifest.relations.atlasTester.atlasSourceCommit === sourceAtlas.sourceCommit
    && manifest.relations.atlasTester.testerEmbeddedHiveAiCommit === released.embeddedHiveAiCommit
    && manifest.relations.atlasTester.atlasSourceCommit !== manifest.relations.atlasTester.testerEmbeddedHiveAiCommit
    && /(?:must|may) not be presented as realizing it/i.test(manifest.relations.atlasTester.claim), "atlas-tester generation mismatch was hidden or misclassified");

  assert(Array.isArray(manifest.definitions) && manifest.definitions.length === EXPECTED_DEFINITION_IDS.length, "metaphor definition roster drifted");
  assert(JSON.stringify(manifest.definitions.map((entry) => entry.id)) === JSON.stringify(EXPECTED_DEFINITION_IDS), "metaphor definition order or identities drifted");
  for (const definition of manifest.definitions) exactKeys(definition, ["id", "label", "definition", "boundary"], `definition ${definition?.id || "unknown"}`);
  const definitions = Object.fromEntries(manifest.definitions.map((entry) => [entry.id, entry]));
  assert(/learned or deterministic/i.test(definitions.neuron.definition)
    && /does not mean one scalar/i.test(definitions.neuron.boundary), "neuron definition excludes deterministic substrates or collapses to a scalar weight");
  assert(/retrieval-and-evidence contract/i.test(definitions.halo.definition)
    && /zero admitted and zero indexed/i.test(definitions.halo.boundary)
    && /not a claim of live retrieval/i.test(definitions.halo.boundary), "halo definition exceeds the declared hard-off fleet truth");
  assert(/not a retrieval halo/i.test(definitions["division-family"].boundary), "visual division ring conflicts with the neuron halo contract");
  assert(/not current execution/i.test(definitions.twitch.boundary)
    && /not.*runtime availability/i.test(definitions.twitch.boundary)
    && /not.*product-live behavior/i.test(definitions.twitch.boundary), "Twitch definition was conflated with current liveness");
  assert(/does not become brain authority/i.test(definitions["living-anatomy"].boundary), "Living Anatomy was granted brain authority");

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
      "id", "label", "supportStatus", "testStatus", "packageStatus", "signingStatus", "evidence",
      "evidenceRef", "verifiedAt", "validUntil", "freshness",
    ], `platform ${platform?.id || "unknown"}`);
    assert(typeof platform.evidence === "string" && platform.evidence.trim(), `platform ${platform.id} evidence missing`);
    assert(typeof platform.evidenceRef === "string" && platform.evidenceRef.trim(), `platform ${platform.id} evidence reference missing`);
    assert(UTC_SECONDS.test(platform.verifiedAt), `platform ${platform.id} verification time malformed`);
    assert(UTC_SECONDS.test(platform.validUntil)
      && Date.parse(platform.validUntil) > Date.parse(platform.verifiedAt), `platform ${platform.id} validity window malformed`);
    assert(platform.verifiedAt === released.verifiedAt
      && platform.validUntil === released.validUntil, `platform ${platform.id} publication readback window drifted from released_tester`);
  }
  const platforms = Object.fromEntries(manifest.platforms.map((entry) => [entry.id, entry]));
  assert(platforms["windows-x64"].label === "Windows 10/11 x64"
    && platforms["windows-x64"].supportStatus === "PUBLIC_ARTIFACT_METADATA_VERIFIED"
    && platforms["windows-x64"].testStatus === "PUBLIC_METADATA_READBACK_ONLY"
    && platforms["windows-x64"].packageStatus === "PUBLIC_HTTPS_URL_DECLARED"
    && platforms["windows-x64"].signingStatus === "UNSIGNED_PUBLISHER_NOT_AUTHENTICATED_IN_METADATA"
    && platforms["windows-x64"].freshness === "PUBLIC_METADATA_READBACK_WINDOW"
    && /truth_subjects\.released_tester/.test(platforms["windows-x64"].evidenceRef)
    && /downloads\/hive-ide\/latest\.json/.test(platforms["windows-x64"].evidenceRef)
    && /downloads\/hive-ide\/hive-ide-release-manifest\.json/.test(platforms["windows-x64"].evidenceRef)
    && platforms["windows-x64"].evidence.includes(String(released.bytes))
    && platforms["windows-x64"].evidence.includes(released.sha256)
    && /SmartScreen warning/i.test(platforms["windows-x64"].evidence)
    && /did not download or hash the executable bytes/i.test(platforms["windows-x64"].evidence), "Windows tester metadata was promoted into verified artifact bytes");
  assert(platforms["windows-wsl"].label === "Windows + WSL"
    && platforms["windows-wsl"].supportStatus === "TESTER_DESIGN_TOPOLOGY"
    && platforms["windows-wsl"].testStatus === "DECLARED_INSIDE_WINDOWS_TESTER_PATH"
    && platforms["windows-wsl"].packageStatus === "NO_SEPARATE_PUBLIC_IDE_ARTIFACT"
    && platforms["windows-wsl"].signingStatus === "NOT_APPLICABLE"
    && platforms["windows-wsl"].freshness === "TESTER_DESIGN_AT_RELEASE_READBACK"
    && /truth_subjects\.released_tester/.test(platforms["windows-wsl"].evidenceRef)
    && /design metadata, not an observed installed runtime or a separate package/i.test(platforms["windows-wsl"].evidence), "Windows WSL topology exceeded tester design evidence");
  assert(platforms["linux-x64"].label === "Linux x64"
    && platforms["linux-x64"].supportStatus === "CORE_SOURCE_DEVELOPMENT_ONLY"
    && platforms["linux-x64"].testStatus === "NO_PUBLIC_PRODUCT_TEST_EVIDENCE"
    && platforms["linux-x64"].packageStatus === "NO_PUBLISHED_IDE_ARTIFACT"
    && platforms["linux-x64"].signingStatus === "NOT_PUBLISHED"
    && platforms["linux-x64"].freshness === "SOURCE_SCOPE_PLUS_PUBLICATION_READBACK_WINDOW"
    && /truth_subjects\.source_atlas/.test(platforms["linux-x64"].evidenceRef)
    && /truth_subjects\.released_tester/.test(platforms["linux-x64"].evidenceRef)
    && platforms["linux-x64"].evidenceRef.includes(manifest.source.sourceCommit)
    && /source\/development scope/i.test(platforms["linux-x64"].evidence)
    && /no Linux IDE artifact/i.test(platforms["linux-x64"].evidence), "Linux source-only scope was promoted beyond evidence");
  assert(platforms.macos.label === "macOS"
    && platforms.macos.supportStatus === "HELD"
    && platforms.macos.testStatus === "NOT_PUBLICLY_VERIFIED"
    && platforms.macos.packageStatus === "NOT_PUBLISHED"
    && platforms.macos.signingStatus === "NOT_NOTARIZED_HERE"
    && platforms.macos.freshness === "PUBLICATION_READBACK_WINDOW"
    && /truth_subjects\.released_tester/.test(platforms.macos.evidenceRef)
    && /no macOS artifact or notarization receipt/i.test(platforms.macos.evidence), "macOS platform scope was promoted beyond evidence");

  exactKeys(manifest.integrityBoundary, ["manifestSelfHashProvesSemanticTruth", "claim"], "manifest integrity boundary");
  assert(manifest.integrityBoundary.manifestSelfHashProvesSemanticTruth === false
    && /not.*(?:semantic proof|semantic truth)/i.test(manifest.integrityBoundary.claim), "manifest self-hash was promoted into a semantic oracle");

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
    candidateBaseline.canonicalManifest.landedSha256 = null;
    candidateBaseline.canonicalManifest.landedBytes = null;
    candidateBaseline.truth_subjects.target_architecture.evidence = "Operator-approved architecture contract candidate; not landed";
    candidateBaseline.truth_subjects.target_architecture.evidenceRef = `candidate ${candidateBaseline.canonicalManifest.path} sha256 ${candidateBaseline.canonicalManifest.candidateSha256}; NOT LANDED at evidence source pin`;
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
  exactKeys(expectedLanding, ["commit", "sha256", "bytes"], "landing expectation");
  assert(HEX40.test(expectedLanding.commit), "landing expectation commit must be exact 40-hex Git identity");
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
  projected.canonicalManifest.landedSha256 = landing.sha256;
  projected.canonicalManifest.landedBytes = landing.bytes;
  const target = projected.truth_subjects?.target_architecture;
  assert(isPlainObject(target), "target architecture subject missing from landing projection");
  const candidateEvidenceRef = `candidate ${projected.canonicalManifest.path} sha256 ${projected.canonicalManifest.candidateSha256}; NOT LANDED at evidence source pin`;
  target.evidence = "Operator-approved architecture contract candidate content; later landing readback hash verified";
  target.evidenceRef = `${candidateEvidenceRef}; later landing readback Dhenz14/Hive-AI@${landing.commit}: ${projected.canonicalManifest.path} sha256 ${landing.sha256}; ${landing.bytes} bytes`;
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
  const simulatedLandingExpectation = { commit: "1".repeat(40), sha256: "2".repeat(64), bytes: manifest.canonicalManifest.candidateBytes + 12 };
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
    expectReject("full_digest_platform_tamper_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "linux-x64").evidence += " tampered"; }),
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
    expectRejectRebound("tester6_promotion_refused", manifest, context, (value) => { value.truth_subjects.released_tester.tester6Public = true; }),
    expectRejectRebound("tester6_url_refused", manifest, context, (value) => { value.truth_subjects.released_tester.url = value.truth_subjects.released_tester.url.replace("tester.5", "tester.6"); }),
    expectRejectRebound("malformed_release_expiry_refused", manifest, context, (value) => { value.truth_subjects.released_tester.validUntil = "never"; }),
    expectRejectRebound("non_advancing_release_expiry_refused", manifest, context, (value) => { value.truth_subjects.released_tester.validUntil = value.truth_subjects.released_tester.verifiedAt; }),
    expectRejectRebound("signed_replay_refused", manifest, context, (value) => { value.truth_subjects.released_tester.publisherAuthenticated = true; }),
    expectRejectRebound("release_byte_count_mismatch_refused", manifest, context, (value) => { value.truth_subjects.released_tester.bytes += 1; }),
    expectRejectRebound("release_digest_mismatch_refused", manifest, context, (value) => { value.truth_subjects.released_tester.sha256 = "0".repeat(64); }),
    expectRejectRebound("metadata_promoted_to_remote_byte_verification_refused", manifest, context, (value) => {
      value.truth_subjects.released_tester.evidence = "Remote executable independently downloaded and hashed; PASS.";
      value.truth_subjects.released_tester.claim = "Public tester.5 executable bytes are verified and functionally certified.";
      value.truth_subjects.released_tester.artifact_bytes_independently_verified = true;
      value.truth_subjects.released_tester.artifact_sha256_independently_verified = true;
    }),
    expectRejectRebound("windows_metadata_promoted_to_verified_artifact_refused", manifest, context, (value) => {
      const windows = value.platforms.find((entry) => entry.id === "windows-x64");
      windows.supportStatus = "PUBLIC_FUNCTIONAL_TESTING_ARTIFACT";
      windows.testStatus = "FUNCTIONALLY_CERTIFIED";
      windows.packageStatus = "PUBLIC_HTTPS_ARTIFACT_BYTES_VERIFIED";
    }),
    expectRejectRebound("linux_package_overclaim_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "linux-x64").packageStatus = "PUBLIC_HTTPS_ARTIFACT"; }),
    expectRejectRebound("platform_missing_evidence_ref_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "windows-x64").evidenceRef = ""; }),
    expectRejectRebound("platform_malformed_verified_at_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "windows-wsl").verifiedAt = "yesterday"; }),
    expectRejectRebound("platform_non_advancing_expiry_refused", manifest, context, (value) => {
      const platform = value.platforms.find((entry) => entry.id === "linux-x64");
      platform.validUntil = platform.verifiedAt;
    }),
    expectRejectRebound("platform_release_window_mismatch_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "macos").validUntil = "2026-08-25T18:46:30Z"; }),
    expectRejectRebound("wsl_runtime_proof_promotion_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "windows-wsl").supportStatus = "INSTALLED_RUNTIME_VERIFIED"; }),
    expectRejectRebound("platform_unknown_nested_field_refused", manifest, context, (value) => { value.platforms.find((entry) => entry.id === "windows-x64").authority = "self-attested"; }),
    expectReject("digest_tamper_refused", manifest, context, (value) => { value.bindingDigest.value = "0".repeat(64); }),
    { label: "release_after_expiry_is_held", passed: releasedTesterAvailability(manifest, Date.parse(manifest.truth_subjects.released_tester.validUntil) + 1) === "PUBLICATION_FRESHNESS_EXPIRED_HELD" },
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
  const landingFlags = ["--expect-landing-commit", "--expect-landing-sha256", "--expect-landing-bytes"];
  const landingFlagCount = landingFlags.filter((flag) => process.argv.includes(flag)).length;
  assert(landingFlagCount === 0 || landingFlagCount === landingFlags.length, "landing expectation requires commit, SHA-256, and byte-count flags together");
  const expectedLanding = landingFlagCount
    ? validateLandingExpectation({
      commit: valueAfter("--expect-landing-commit") ?? "",
      sha256: valueAfter("--expect-landing-sha256") ?? "",
      bytes: Number(valueAfter("--expect-landing-bytes")),
    })
    : undefined;
  if (process.argv.includes("--project-landing")) {
    assert(expectedLanding, "--project-landing requires all three --expect-landing-* values");
    const result = validatePublishedProductTruth();
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
