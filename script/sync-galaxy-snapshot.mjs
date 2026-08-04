#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(siteRoot, "hub-assets", "hub-facts.json");
const GENERATOR_VERSION = "2.0.0";
const automaticBridgeEnabled = process.env.GALAXY_AUTOMATIC_BRIDGE === "true";
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

v1, v2, layout = build_living_anatomy_bundle(root)
errors = [
    *validate_living_anatomy_graph(v1),
    *validate_bundle(v1, v2, layout),
    *compatibility_errors(v1, v2),
]
if errors:
    raise SystemExit("living anatomy validation failed: " + "; ".join(errors[:8]))

physiology = v1.get("physiology") or {}
summary = v1.get("summary") or {}
payload = {
    "graph": strip_pr1_meta(v2),
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

const remoteMainLine = run("git", ["-C", hiveAiRepo, "ls-remote", "origin", "refs/heads/main"]);
const remoteMain = remoteMainLine.split(/\s+/)[0] || "";
if (remoteMain !== sourceCommit) {
  fail(`local ${sourceRef} is not live GitHub main: local=${sourceCommit} remote=${remoteMain || "missing"}`);
}

const checkoutStatus = run("git", [
  "-C", hiveAiRepo, "status", "--porcelain", "--untracked-files=all", "--ignored=matching",
]);
if (checkoutStatus) fail("compiled checkout contains modified, untracked, or ignored files");

const compiled = JSON.parse(run("env", [
  "PYTHONDONTWRITEBYTECODE=1",
  "python3",
  "-B",
  "-c",
  PYTHON_BUILD,
  hiveAiRepo,
]));
const graph = compiled.graph;
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
  const frozenBytes = runBytes("git", ["-C", hiveAiRepo, "show", `${sourceCommit}:${source.path}`]);
  if (frozenBytes.length !== source.bytes || sha256(frozenBytes) !== source.sha256) {
    fail(`working source is not byte-bound to ${sourceCommit}: ${source.path}`);
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
  schema: "hive.ecosystem.public-galaxy.v1",
  generatorVersion: GENERATOR_VERSION,
  sourceGraphHash: graph.graph_content_hash,
  geometry: "deterministic-authored-clusters",
  representedNeurons,
  divisions,
  statusProjection: "none",
  claimBoundary:
    "The public atlas shows topology and family purpose only. Gold Twitch, mastery, runtime, work-lane, mission, and urgency states remain on the authenticated local Living Anatomy surface.",
};
const galaxy = {
  ...galaxyWithoutHash,
  projectionHash: sha256(JSON.stringify(galaxyWithoutHash)),
};

const base = {
  schema: "hive.ecosystem.public-source-snapshot.v2",
  hiveAi: {
    sourceCommit,
    sourceBranch: "main",
    graphSource: "compiled from source manifest; no private graph bytes published",
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
      : automaticBridgeEnabled ? "SCHEDULED_LIVING_MAIN_PUBLISHER" : "CROSS_REPOSITORY_CREDENTIAL_NOT_CONFIGURED",
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
if (previousBase) delete previousBase.capturedAt;
const unchanged = previousBase && JSON.stringify(previousBase) === JSON.stringify(base);
const next = {
  ...base,
  capturedAt: unchanged && typeof previous.capturedAt === "string"
    ? previous.capturedAt
    : new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
};
const rendered = `${JSON.stringify(next, null, 2)}\n`;
const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
const stale = current !== rendered;

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
