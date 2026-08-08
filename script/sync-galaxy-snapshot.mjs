#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(siteRoot, "hub-assets", "hub-facts.json");
const GENERATOR_VERSION = "3.0.0";
const SNAPSHOT_VERSION = "3.0.0";
const RENDERER_CONTRACT_PATH = "hiveai/static/living-anatomy/src/galaxy-contract.json";
const RENDERER_CONTRACT_HASH = "698d9c371ebe98b47cffbf10643080cb06ccb2c06267d580349063fb992230ad";
const CANONICAL_GEOMETRY_HASH = "29948f2ccbc310eb9ecc802a82ba1ff298aa19bc131ea21ebce85b8db7c5c314";
const REQUIRED_PUBLISHER_EVIDENCE_PATHS = Object.freeze([
  "data/neuron_swarm/portable_green_evidence_membership_20260722.json",
  "tests/fixtures/physiology/formal_l3_e01_v2/RATIFY_L3_E01_V2.json",
  "tests/fixtures/physiology/formal_l3_e02/window_seal/RATIFY_L3_E02_V1.json",
]);
const automaticBridgeEnabled = process.env.GALAXY_AUTOMATIC_BRIDGE === "true";
const inactiveBridgeReason = process.env.GALAXY_BRIDGE_INACTIVE_REASON === "MANUAL_WORKFLOW_DISPATCH"
  ? "MANUAL_WORKFLOW_DISPATCH"
  : "CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED";
const bridgeMode = automaticBridgeEnabled && process.env.GALAXY_BRIDGE_MODE === "local"
  ? "local"
  : automaticBridgeEnabled ? "cloud" : "inactive";

const PYTHON_BUILD = String.raw`
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))

from hiveai.living_anatomy import validate_living_anatomy_graph
from hiveai.living_anatomy.compat_v1 import compatibility_errors
from hiveai.living_anatomy.compiler_v2 import (
    build_living_anatomy_bundle,
    strip_pr1_meta,
    validate_bundle,
)
from hiveai.living_anatomy.compose import (
    build_composed_living_anatomy,
    validate_composed_payload,
)
from hiveai.living_anatomy.galaxy_contract import (
    build_public_geometry_projection,
    load_renderer_contract,
)

v1, v2, layout = build_living_anatomy_bundle(root)
composed = build_composed_living_anatomy(root, include_work=False)
errors = [
    *validate_living_anatomy_graph(v1),
    *validate_bundle(v1, v2, layout),
    *compatibility_errors(v1, v2),
    *validate_composed_payload(composed),
]
if errors:
    raise SystemExit("living anatomy validation failed: " + "; ".join(errors[:8]))

physiology = v1.get("physiology") or {}
summary = v1.get("summary") or {}
payload = {
    "graph": strip_pr1_meta(v2),
    "public_geometry": build_public_geometry_projection(root, composed),
    "renderer_contract": load_renderer_contract(root),
    "truth_input_commit": (v2.get("_pr1_meta") or {}).get("source_commit"),
    "summary": summary,
    "physiology": {
        "purpose_mastered": physiology.get("purpose_mastered_total"),
        "twitches": physiology.get("formal_l2_edges"),
        "pm_only": physiology.get("pm_only_count"),
        "raw_formal_l2_rows": physiology.get("raw_formal_l2_edges"),
        "excluded_formal_l2_rows": physiology.get("excluded_formal_l2_edges"),
    },
}
print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
`;

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : String(process.argv[index + 1] || "").trim();
}

function fail(message) {
  throw new Error(`galaxy snapshot refused: ${message}`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function runBytes(command, args) {
  return execFileSync(command, args, {
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function gitBlobSha1(value) {
  return crypto.createHash("sha1")
    .update(`blob ${value.length}\0`)
    .update(value)
    .digest("hex");
}

function normalizedEvidencePath(value) {
  const raw = String(value || "");
  const repositoryPath = raw.split("#", 1)[0];
  if (!repositoryPath
    || repositoryPath.includes("\\")
    || path.posix.isAbsolute(repositoryPath)
    || path.posix.normalize(repositoryPath) !== repositoryPath
    || repositoryPath === ".."
    || repositoryPath.startsWith("../")) {
    fail(`unsafe evidence path: ${raw || "missing"}`);
  }
  return repositoryPath;
}

function sourceTree(commit, repository) {
  const entries = new Map();
  const listing = runBytes("git", ["-C", repository, "ls-tree", "-r", "-z", commit]);
  for (const record of listing.toString("utf8").split("\0")) {
    if (!record) continue;
    const match = record.match(/^(\d{6})\s+(\S+)\s+([a-f0-9]+)\t([\s\S]+)$/);
    if (!match) fail("source tree contains an unreadable entry");
    entries.set(match[4], {
      mode: match[1],
      type: match[2],
      objectId: match[3],
    });
  }
  return entries;
}

function naturalId(left, right) {
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
}

function atomicWriteJson(destination, value) {
  const rendered = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${Date.now()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o644);
    fs.writeFileSync(descriptor, rendered, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, destination);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return rendered;
}

const hiveAiRepo = path.resolve(
  option("--hive-ai-repo", process.env.HIVE_AI_REPO || "/home/theyc/src/Hive-AI"),
);
const sourceRef = option("--hive-ai-ref", process.env.HIVE_AI_REF || "origin/main");
const checkOnly = process.argv.includes("--check");

if (!fs.existsSync(hiveAiRepo)) fail(`Hive-AI repository missing: ${hiveAiRepo}`);

const sourceCommit = run("git", ["-C", hiveAiRepo, "rev-parse", `${sourceRef}^{commit}`]);
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) fail("source commit is not an exact SHA-1");
const checkoutCommit = run("git", ["-C", hiveAiRepo, "rev-parse", "HEAD^{commit}"]);
if (checkoutCommit !== sourceCommit) {
  fail(`compiled checkout does not equal the selected source: HEAD=${checkoutCommit} source=${sourceCommit}`);
}

function remoteMainCommit() {
  return run("git", ["-C", hiveAiRepo, "ls-remote", "origin", "refs/heads/main"])
    .split(/\s+/)[0] || "";
}

const remoteMainBeforeCompile = remoteMainCommit();
if (remoteMainBeforeCompile !== sourceCommit) {
  fail(`local ${sourceRef} is not live GitHub main: local=${sourceCommit} remote=${remoteMainBeforeCompile || "missing"}`);
}

const checkoutStatus = run("git", [
  "-C", hiveAiRepo, "status", "--porcelain", "--untracked-files=all", "--ignored=matching",
]);
if (checkoutStatus) fail("compiled checkout contains modified, untracked, or ignored files");

const objectFormat = run("git", ["-C", hiveAiRepo, "rev-parse", "--show-object-format"]);
if (objectFormat !== "sha1") fail(`unsupported source object format: ${objectFormat}`);
const sourceTreeEntries = sourceTree(sourceCommit, hiveAiRepo);
const verifiedCheckoutPaths = new Map();

function verifyMaterializedSource(repositoryPath, expected = null) {
  const previous = verifiedCheckoutPaths.get(repositoryPath);
  if (previous) {
    if (expected && (expected.bytes !== previous.bytes || expected.sha256 !== previous.sha256)) {
      fail(`contradictory evidence metadata for ${repositoryPath}`);
    }
    return previous;
  }
  const entry = sourceTreeEntries.get(repositoryPath);
  if (!entry || entry.type !== "blob" || !/^100\d{3}$/.test(entry.mode)) {
    fail(`evidence path is not a regular tracked blob at ${sourceCommit}: ${repositoryPath}`);
  }
  const checkoutPath = path.join(hiveAiRepo, ...repositoryPath.split("/"));
  let bytes;
  try {
    bytes = fs.readFileSync(checkoutPath);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`tracked evidence is unresolved in the materialized checkout: ${repositoryPath}`);
    throw error;
  }
  const observed = { bytes: bytes.length, sha256: sha256(bytes) };
  if (gitBlobSha1(bytes) !== entry.objectId) {
    fail(`working evidence is not byte-bound to ${sourceCommit}: ${repositoryPath}`);
  }
  if (expected && (expected.bytes !== observed.bytes || expected.sha256 !== observed.sha256)) {
    fail(`compiled evidence metadata is not byte-bound to ${sourceCommit}: ${repositoryPath}`);
  }
  verifiedCheckoutPaths.set(repositoryPath, observed);
  return observed;
}

for (const repositoryPath of REQUIRED_PUBLISHER_EVIDENCE_PATHS) {
  verifyMaterializedSource(repositoryPath);
}
verifyMaterializedSource(RENDERER_CONTRACT_PATH);

const compiled = JSON.parse(run("env", [
  "PYTHONDONTWRITEBYTECODE=1",
  "python3",
  "-B",
  "-c",
  PYTHON_BUILD,
  hiveAiRepo,
]));
const graph = compiled.graph;
const publicGeometry = compiled.public_geometry;
const rendererContract = compiled.renderer_contract;
if (graph?.schema_version !== "hiveai.living_anatomy_graph.v2") {
  fail(`unexpected graph schema: ${graph?.schema_version || "missing"}`);
}
if (!/^[a-f0-9]{64}$/.test(graph.graph_content_hash || "")) {
  fail("graph content hash is missing or malformed");
}
if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
  fail("graph nodes or edges are unavailable");
}
if (!Array.isArray(graph.source_manifest) || graph.source_manifest.length < 1) {
  fail("compiled graph has no source manifest");
}
if (canonicalJson(rendererContract) !== canonicalJson({
  schema: "hive.galaxy.renderer-contract.v1",
  version: "1.0.0",
  geometrySchema: "hive.galaxy.public-geometry.v1",
  statusSchema: "hive.galaxy.status-language.v1",
  cameraSchema: "hive.galaxy.camera.v1",
  eventSchema: "hive.galaxy.event-semantics.v1",
  fallbackSchema: "hive.galaxy.progressive-fallback.v1",
}) || sha256(canonicalJson(rendererContract)) !== RENDERER_CONTRACT_HASH) {
  fail("renderer contract is not the exact canonical v1 contract");
}
if (publicGeometry?.schema !== rendererContract.geometrySchema
  || publicGeometry?.contractVersion !== rendererContract.version
  || publicGeometry?.contractHash !== RENDERER_CONTRACT_HASH
  || publicGeometry?.sourceGraphHash !== graph.graph_content_hash
  || publicGeometry?.geometryHash !== CANONICAL_GEOMETRY_HASH
  || publicGeometry?.coordinateSpace !== "hiveai.living_anatomy_layout.v1"
  || publicGeometry?.divisions?.length !== 16
  || publicGeometry?.families?.length !== 64
  || publicGeometry?.neurons?.length !== 640) {
  fail("canonical public geometry projection is unavailable or source-unbound");
}
const truthInputCommit = String(compiled.truth_input_commit || "").toLowerCase();
if (!/^[a-f0-9]{40}$/.test(truthInputCommit)) {
  fail(`source history is too shallow to prove the truth-input commit: ${truthInputCommit || "missing"}`);
}
const shallowPathRaw = run("git", ["-C", hiveAiRepo, "rev-parse", "--git-path", "shallow"]);
const shallowPath = path.isAbsolute(shallowPathRaw) ? shallowPathRaw : path.resolve(hiveAiRepo, shallowPathRaw);
if (fs.existsSync(shallowPath)) {
  const shallowBoundaries = new Set(fs.readFileSync(shallowPath, "utf8").trim().split(/\s+/).filter(Boolean));
  if (shallowBoundaries.has(truthInputCommit)) {
    fail(`truth-input commit ${truthInputCommit} is a shallow boundary; deepen source history`);
  }
}

for (const source of graph.source_manifest) {
  if (!source || typeof source.path !== "string" || !/^[a-f0-9]{64}$/.test(source.sha256 || "")) {
    fail("compiled graph contains a malformed source manifest entry");
  }
  if (!Number.isSafeInteger(source.bytes) || source.bytes < 0) {
    fail(`compiled graph contains invalid source bytes: ${source.path}`);
  }
  verifyMaterializedSource(normalizedEvidencePath(source.path), source);
}

if (!Array.isArray(graph.evidence) || graph.evidence.length < 1) {
  fail("compiled graph contains no evidence closure");
}
const evidenceByPath = new Map();
for (const evidence of graph.evidence) {
  if (!evidence
    || typeof evidence.path !== "string"
    || !/^[a-f0-9]{64}$/.test(evidence.sha256 || "")
    || !Number.isSafeInteger(evidence.bytes)
    || evidence.bytes < 0) {
    fail("compiled graph contains a malformed evidence entry");
  }
  const repositoryPath = normalizedEvidencePath(evidence.path);
  const expected = { bytes: evidence.bytes, sha256: evidence.sha256 };
  const prior = evidenceByPath.get(repositoryPath);
  if (prior && (prior.bytes !== expected.bytes || prior.sha256 !== expected.sha256)) {
    fail(`compiled graph contains contradictory evidence entries: ${repositoryPath}`);
  }
  evidenceByPath.set(repositoryPath, expected);
}
for (const repositoryPath of REQUIRED_PUBLISHER_EVIDENCE_PATHS) {
  if (!evidenceByPath.has(repositoryPath)) {
    fail(`required publisher evidence did not enter the compiled closure: ${repositoryPath}`);
  }
}
for (const [repositoryPath, expected] of evidenceByPath) {
  if (sourceTreeEntries.has(repositoryPath)) {
    verifyMaterializedSource(repositoryPath, expected);
    continue;
  }
  const unresolvedCheckoutPath = path.join(hiveAiRepo, ...repositoryPath.split("/"));
  if (fs.existsSync(unresolvedCheckoutPath)) {
    fail(`evidence resolves to an untracked checkout path: ${repositoryPath}`);
  }
}

const kindCounts = Object.create(null);
const nodesById = new Map();
for (const node of graph.nodes) {
  if (!node || typeof node.id !== "string" || typeof node.kind !== "string") {
    fail("graph contains a malformed node");
  }
  if (nodesById.has(node.id)) fail(`duplicate node: ${node.id}`);
  nodesById.set(node.id, node);
  kindCounts[node.kind] = (kindCounts[node.kind] || 0) + 1;
}

const familyToDivision = new Map();
const familyToNeurons = new Map();
for (const edge of graph.edges) {
  if (edge.relationship_type === "family_in_division") familyToDivision.set(edge.source, edge.target);
  if (edge.relationship_type === "belongs_to_family") {
    const members = familyToNeurons.get(edge.target) || [];
    members.push(edge.source);
    familyToNeurons.set(edge.target, members);
  }
}

const divisions = graph.nodes
  .filter((node) => node.kind === "division")
  .sort((left, right) => naturalId(left.id, right.id))
  .map((division) => {
    const code = division.id.replace(/^division:/, "");
    const families = graph.nodes
      .filter((node) => node.id.startsWith("family:") && familyToDivision.get(node.id) === division.id)
      .sort((left, right) => naturalId(left.id, right.id))
      .map((family) => ({
        code: family.id.replace(/^family:/, ""),
        name: family.purpose,
        neuronIds: (familyToNeurons.get(family.id) || [])
          .map((id) => id.replace(/^neuron:/, ""))
          .sort(naturalId),
      }));
    return {
      code,
      name: division.purpose,
      neuronCount: families.reduce((total, family) => total + family.neuronIds.length, 0),
      families,
    };
  });

const familyCount = divisions.reduce((total, division) => total + division.families.length, 0);
const representedNeurons = divisions.reduce((total, division) => total + division.neuronCount, 0);
if (kindCounts.neuron !== 640 || representedNeurons !== kindCounts.neuron) {
  fail(`neuron roster mismatch: graph=${kindCounts.neuron} represented=${representedNeurons}`);
}
if (divisions.length !== 16 || familyCount !== 64) {
  fail(`division/family invariant failed: divisions=${divisions.length} families=${familyCount}`);
}
for (const division of divisions) {
  if (division.neuronCount !== 40 || division.families.length !== 4) {
    fail(`division ${division.code} is not the expected 4-family / 40-neuron shape`);
  }
  for (const family of division.families) {
    if (family.neuronIds.length !== 10) fail(`family ${family.code} is not the expected 10-neuron shape`);
  }
}

const physiology = compiled.physiology || {};
for (const [name, value] of Object.entries(physiology)) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`invalid physiology value: ${name}`);
}
if (physiology.twitches > physiology.purpose_mastered) fail("Twitch count exceeds purpose-mastered count");
if (physiology.pm_only !== physiology.purpose_mastered - physiology.twitches) {
  fail("PM-only count does not reconcile with purpose-mastered minus Twitch");
}

const galaxyWithoutHash = {
  schema: "hive.ecosystem.public-galaxy.v2",
  generatorVersion: GENERATOR_VERSION,
  sourceGraphHash: graph.graph_content_hash,
  representedNeurons,
  divisions,
  geometry: publicGeometry,
  statusProjection: "none",
  claimBoundary:
    "The public atlas shows topology and family purpose only. Gold Twitch, mastery, runtime, work-lane, mission, and urgency states remain on the authenticated local Living Anatomy surface.",
};
const galaxy = {
  ...galaxyWithoutHash,
  projectionHash: sha256(canonicalJson(galaxyWithoutHash)),
};

const base = {
  schema: "hive.ecosystem.public-source-snapshot.v3",
  snapshotVersion: SNAPSHOT_VERSION,
  hiveAi: {
    sourceCommit,
    sourceBranch: "main",
    graphSource: "compiled from the source manifest and authored layout; no private graph bytes published",
    graphSchema: graph.schema_version,
    graphHash: graph.graph_content_hash,
    sourceFingerprint: graph.source_fingerprint,
    neurons: kindCounts.neuron,
    trainableNeurons: Number(compiled.summary?.trainable_neurons || 448),
    deterministicNeurons: Number(compiled.summary?.deterministic_neurons || 192),
    purposeMastered: physiology.purpose_mastered,
    twitches: physiology.twitches,
    pmOnly: physiology.pm_only,
    notPurposeMastered: kindCounts.neuron - physiology.purpose_mastered,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    divisions: kindCounts.division,
    families: familyCount,
    moons: kindCounts.moon,
    organs: kindCounts.organ,
    components: kindCounts.component,
    federationRepositories: graph.edges.filter((edge) => edge.relationship_type === "federation_member").length,
  },
  galaxy,
  ecosystem: {
    schema: "hive.ecosystem.public-organ-map.v1",
    primaryOrgans: [
      { id: "hive-ai", label: "Hive-AI", role: "reasoning brain", exposure: "private-source-local-runtime" },
      { id: "hivepoa", label: "HivePoA", role: "proof and storage plane", exposure: "signed-public-distribution" },
      { id: "neurachain", label: "NeuraChain", role: "durable coordination and settlement", exposure: "private-source-chain-surface" },
      { id: "hive-ide", label: "Hive IDE", role: "operator hands", exposure: "private-tester-surface" },
      { id: "second-brain", label: "Second Brain", role: "operator-owned knowledge memory", exposure: "local-private" },
      { id: "compute-pool", label: "Compute Pool", role: "guarded CPU and GPU capacity", exposure: "contract-routed" }
    ],
    federationRepositories: graph.edges.filter((edge) => edge.relationship_type === "federation_member").length,
  },
  refresh: {
    privateSourceMode: bridgeMode === "local"
      ? "local-living-main-publisher"
      : automaticBridgeEnabled ? "scheduled-living-main-publisher" : "manual-source-bound-snapshot",
    automaticBridgeEnabled,
    reasonCode: bridgeMode === "local"
      ? "LOCAL_LIVING_MAIN_PUBLISHER"
      : automaticBridgeEnabled ? "SCHEDULED_LIVING_MAIN_PUBLISHER" : inactiveBridgeReason,
    lastGoodBehavior: "retain_previous_snapshot",
  },
  boundaries: {
    snapshotOnly: true,
    runtimeTelemetry: false,
    grantsAuthority: false,
    privateEvidencePublished: false,
    localChatUrl: "http://127.0.0.1:5002/chat",
    localGalaxyUrl: "http://127.0.0.1:5002/constellation/body?presentation=1",
  },
};

const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : null;
const previousBase = previous ? { ...previous } : null;
if (previousBase) {
  delete previousBase.capturedAt;
  delete previousBase.snapshotHash;
}
const unchanged = previousBase && canonicalJson(previousBase) === canonicalJson(base);
const nextBody = {
  ...base,
  capturedAt: unchanged && typeof previous.capturedAt === "string"
    ? previous.capturedAt
    : new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
};
const next = {
  ...nextBody,
  snapshotHash: sha256(canonicalJson(nextBody)),
};
const rendered = `${JSON.stringify(next, null, 2)}\n`;
const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
const stale = current !== rendered;

const remoteMainAfterCompile = remoteMainCommit();
if (remoteMainAfterCompile !== sourceCommit) {
  fail(`Hive-AI main moved during compilation: selected=${sourceCommit} remote=${remoteMainAfterCompile || "missing"}`);
}

if (checkOnly) {
  if (stale) {
    console.error(`GALAXY_SNAPSHOT_STALE source=${sourceCommit.slice(0, 12)} nodes=${next.hiveAi.nodes} edges=${next.hiveAi.edges}`);
    process.exitCode = 1;
  } else {
    console.log(`GALAXY_SNAPSHOT_CURRENT source=${sourceCommit.slice(0, 12)} nodes=${next.hiveAi.nodes} edges=${next.hiveAi.edges}`);
  }
} else if (stale) {
  atomicWriteJson(outputPath, next);
  console.log(`GALAXY_SNAPSHOT_UPDATED source=${sourceCommit.slice(0, 12)} nodes=${next.hiveAi.nodes} edges=${next.hiveAi.edges} twitches=${next.hiveAi.twitches} pm_only=${next.hiveAi.pmOnly}`);
} else {
  console.log(`GALAXY_SNAPSHOT_UNCHANGED source=${sourceCommit.slice(0, 12)} nodes=${next.hiveAi.nodes} edges=${next.hiveAi.edges}`);
}
