#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GALAXY_CANONICAL_GEOMETRY_HASH,
  GALAXY_RENDERER_CONTRACT_HASH,
  GALAXY_SNAPSHOT_VERSION,
  validSnapshot,
} from "../hub-assets/galaxy-core.mjs";
import { publisherCandidateDecision } from "./publisher-candidate-policy.mjs";
import { readHubFactsSync } from "./hub-facts-custody.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/sync-living-galaxy.yml"), "utf8");
const pagesWorkflow = fs.readFileSync(path.join(root, ".github/workflows/publish-reviewed-pages.yml"), "utf8");
const facts = readHubFactsSync(path.join(root, "hub-assets/hub-facts.json"), "publisher race snapshot");
const hash = (character) => character.repeat(64);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(publisherCandidateDecision({
  baseFactsHash: hash("a"), remoteFactsHash: hash("a"), candidateFactsHash: hash("b"),
}) === "REBUILD_EXACT", "disjoint Pages-main motion did not rebuild the exact candidate");
assert(publisherCandidateDecision({
  baseFactsHash: hash("a"), remoteFactsHash: hash("b"), candidateFactsHash: hash("b"),
}) === "ALREADY_LANDED", "an independently landed identical candidate was not recognized");
assert(publisherCandidateDecision({
  baseFactsHash: hash("a"), remoteFactsHash: hash("c"), candidateFactsHash: hash("b"),
}) === "CONCURRENT_FACTS_WINNER", "a concurrent facts writer did not win safely");
let malformedRefused = false;
try {
  publisherCandidateDecision({
    baseFactsHash: "bad", remoteFactsHash: hash("a"), candidateFactsHash: hash("b"),
  });
} catch {
  malformedRefused = true;
}
assert(malformedRefused, "malformed custody hash was accepted");

assert(workflow.includes("node script/publisher-candidate-policy.mjs"), "publisher does not invoke the tested race policy");
assert(!workflow.includes("git rebase"), "publisher may mutate an admitted candidate through rebase");
assert(/committed_candidate_sha[\s\S]*candidate_sha/.test(workflow), "committed candidate bytes are not reverified");
assert(/changed_paths[\s\S]*hub-assets\/hub-facts\.json/.test(workflow), "rebuilt commit lacks an exact path proof");
assert(!/pages\/builds/.test(workflow), "snapshot publisher still requests a legacy branch-root Pages build");
assert(/workflow_run:[\s\S]*workflows: \["Sync living galaxy"\][\s\S]*conclusion == 'success'[\s\S]*head_branch == 'main'/.test(pagesWorkflow), "token-originated snapshot pushes lack a guarded deployment route");
assert(/Check out current main with exact history[\s\S]*ref: main[\s\S]*fetch-depth: 0[\s\S]*persist-credentials: false/.test(pagesWorkflow), "workflow-run resolver does not start from current main");
assert(/target_sha="\$\(git rev-parse HEAD\)"[\s\S]*base_sha="\$\{\{ github\.event\.workflow_run\.head_sha \}\}"[\s\S]*HEAD\^[\s\S]{0,40}\$base_sha/.test(pagesWorkflow), "workflow-run publication is not bound to one exact current-main child");
assert(/git diff --name-only "\$base_sha"\.\.HEAD[\s\S]{0,80}hub-assets\/hub-facts\.json/.test(pagesWorkflow), "workflow-run child is not restricted to the admitted facts path");
assert(/target_sha" == "\$base_sha"[\s\S]*should_publish=false[\s\S]*exit 0/.test(pagesWorkflow), "successful no-change sync can still cause a Pages redeploy");
assert(/ref: \$\{\{ needs\.resolve-publication\.outputs\.target-sha \}\}[\s\S]*test "\$\(git rev-parse HEAD\)" = "\$\{\{ needs\.resolve-publication\.outputs\.target-sha \}\}"[\s\S]*refs\/remotes\/origin\/main/.test(pagesWorkflow), "Pages build is not bound to the exact resolved main target");
assert(/Refuse a stale main artifact[\s\S]*git rev-parse HEAD[\s\S]*refs\/remotes\/origin\/main/.test(pagesWorkflow), "Pages builder can upload a stale main artifact");
assert(/cancel-in-progress: true/.test(pagesWorkflow), "newer main publication cannot cancel stale in-flight work");
assert(/compile:[\s\S]*if: github\.repository == 'Dhenz14\/Dhenz14\.github\.io' && github\.ref == 'refs\/heads\/main'/.test(workflow), "secret-bearing compile path is not main-bound");
assert(/publish:[\s\S]*if: needs\.compile\.result == 'success' && github\.ref == 'refs\/heads\/main'/.test(workflow), "contents-write publisher is not main-bound");
assert(workflow.includes("/hiveai/static/living-anatomy/src/galaxy-contract.json"), "sparse source checkout omits the canonical renderer contract");
assert(workflow.includes("node script/check-galaxy-core.mjs"), "publisher does not revalidate authored geometry on current Pages main");
assert(facts.schema === "hive.ecosystem.public-source-snapshot.v3"
  && facts.snapshotVersion === GALAXY_SNAPSHOT_VERSION
  && /^[a-f0-9]{64}$/.test(facts.snapshotHash || ""), "publisher candidate is not a sealed v3 snapshot");
assert(facts.galaxy?.geometry?.contractHash === GALAXY_RENDERER_CONTRACT_HASH, "publisher candidate is not bound to the canonical renderer contract");
assert(facts.galaxy?.geometry?.geometryHash === GALAXY_CANONICAL_GEOMETRY_HASH, "publisher candidate is not bound to the reviewed authored geometry digest");
assert(await validSnapshot(facts), "publisher candidate fails the strict runtime validator");

console.log("PUBLISHER_RACES_OK disjoint=rebuild_exact identical=already_landed conflict=winner_preserved sealed_v3=true geometry_contract=true deployment=workflow_run_current_main");
