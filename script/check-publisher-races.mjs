#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  publicationHandoff,
  publisherCandidateDecision,
  publisherTransitionDecision,
  resolvePublicationTarget,
} from "./publisher-candidate-policy.mjs";
import {
  GALAXY_CANONICAL_GEOMETRY_HASH,
  GALAXY_RENDERER_CONTRACT_HASH,
  GALAXY_SNAPSHOT_VERSION,
  validSnapshot,
} from "../hub-assets/galaxy-core.mjs";
import { readHubFactsSync } from "./hub-facts-custody.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/sync-living-galaxy.yml"), "utf8");
const pagesWorkflow = fs.readFileSync(path.join(root, ".github/workflows/publish-reviewed-pages.yml"), "utf8");
const facts = readHubFactsSync(path.join(root, "hub-assets/hub-facts.json"), "publisher race snapshot");
const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);
const factsPath = "hub-assets/hub-facts.json";
const mutation = (sha, paths, parentCount = 1) => ({ sha, paths, parentCount });
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

const transition = (overrides = {}) => publisherTransitionDecision({
  baseCommit: commit("b"),
  remoteCommit: commit("d"),
  baseIsAncestor: true,
  mutations: [mutation(commit("d"), ["README.md"])],
  baseFactsHash: hash("a"),
  remoteFactsHash: hash("a"),
  candidateFactsHash: hash("b"),
  ...overrides,
});

// B -> D(other) admits rebuilding C(facts) directly on D.
assert(transition() === "REBUILD_EXACT", "B -> D(other) did not admit an exact facts-only child");
assert(transition({
  remoteCommit: commit("c"),
  mutations: [mutation(commit("c"), [factsPath, "README.md"])],
}) === "REJECT_MIXED_FACTS_MUTATION", "facts plus another path was admitted");
assert(transition({ baseIsAncestor: false }) === "REJECT_BASE_NOT_ANCESTOR", "non-ancestor compiler base was admitted");
assert(transition({ mutations: [mutation(commit("d"), ["README.md"], 2)] }) === "REJECT_MERGE_MUTATION", "merge mutation was admitted");

// B -> C(facts) -> E(other) recognizes the candidate but never calls E "C".
assert(transition({
  remoteCommit: commit("e"),
  mutations: [mutation(commit("c"), [factsPath]), mutation(commit("e"), ["README.md"])],
  remoteFactsHash: hash("b"),
}) === "ALREADY_LANDED", "B -> C -> E did not recognize the exact candidate at current main");
assert(resolvePublicationTarget({
  requestedSha: commit("c"), currentMainSha: commit("e"), requestedIsAncestor: true,
}) === commit("e"), "a later current-main target was mislabeled as the earlier facts commit");

const changedHandoff = publicationHandoff({ changed: true, targetSha: commit("c") });
assert(changedHandoff?.requestedSha === commit("c") && changedHandoff.signalKind === "sync-direct-handoff", "changed bot push did not emit one exact handoff");
assert(publicationHandoff({ changed: false, targetSha: commit("c") }) === null, "no-change sync emitted a deploy signal");

// With cancel-in-progress false, every admitted signal resolves under the lock
// to current main. A stable newer tip is therefore the only deployable target.
const queuedSignals = [commit("b"), commit("c"), commit("e")];
const resolvedTargets = queuedSignals.map((requestedSha) => resolvePublicationTarget({
  requestedSha,
  currentMainSha: commit("e"),
  requestedIsAncestor: true,
}));
assert(resolvedTargets.every((target) => target === commit("e")), "a queued permutation could deploy stale main");
let malformedRefused = false;
try {
  publisherCandidateDecision({ baseFactsHash: "bad", remoteFactsHash: hash("a"), candidateFactsHash: hash("b") });
} catch { malformedRefused = true; }
assert(malformedRefused, "malformed custody hash was accepted");
let staleSignalRefused = false;
try {
  resolvePublicationTarget({ requestedSha: commit("b"), currentMainSha: commit("e"), requestedIsAncestor: false });
} catch { staleSignalRefused = true; }
assert(staleSignalRefused, "non-ancestor deployment signal was admitted");

assert(workflow.includes("node script/publisher-candidate-policy.mjs"), "publisher does not invoke the tested transition policy");
assert(!workflow.includes("git rebase"), "publisher may mutate an admitted candidate through rebase");
assert(!/pages\/builds/.test(workflow), "snapshot publisher still requests a legacy branch-root Pages build");
assert(!/workflow_run:/.test(pagesWorkflow), "Pages still infers a deployment from ambiguous workflow_run state");
assert(/workflow_call:[\s\S]*requested_sha:[\s\S]*signal_kind:/.test(pagesWorkflow), "Pages is not an exact reusable publication workflow");
assert(/deploy-changed-snapshot:[\s\S]*changed == 'true'[\s\S]*uses: \.\/\.github\/workflows\/publish-reviewed-pages\.yml[\s\S]*requested_sha: \$\{\{ needs\.publish\.outputs\.target_sha \}\}/.test(workflow), "changed sync does not invoke exactly one direct reusable handoff");
assert(/outputs:[\s\S]*changed: \$\{\{ steps\.publish\.outputs\.changed \}\}[\s\S]*target_sha: \$\{\{ steps\.publish\.outputs\.target_sha \}\}/.test(workflow), "publisher does not propagate changed plus exact pushed SHA");
assert(/deploy-reviewed-pages:[\s\S]*concurrency:[\s\S]*group: reviewed-pages[\s\S]*cancel-in-progress: false/.test(pagesWorkflow), "genuine deployment work lacks one non-cancelling lock");
assert(!/^concurrency:/mu.test(pagesWorkflow), "non-deployment resolver work still owns the Pages concurrency group");
assert(/REQUESTED_SHA:[\s\S]*git merge-base --is-ancestor "\$REQUESTED_SHA" "\$target_sha"/.test(pagesWorkflow), "requested SHA is not a checked audit lower-bound");
assert(/Refuse a stale main artifact immediately before upload[\s\S]*refs\/remotes\/origin\/main[\s\S]*steps\.bind\.outputs\.target_sha/.test(pagesWorkflow), "Pages upload can race a newer main tip");
assert(/Build and exercise[\s\S]*build-public-pages\.mjs build[\s\S]*build-public-pages\.mjs check[\s\S]*check-http-surface\.mjs/.test(pagesWorkflow), "exact stage tests do not precede Pages upload");
assert(/Deploy the reviewed artifact[\s\S]*check-live-parity\.mjs[\s\S]*expected-target-sha/.test(pagesWorkflow), "deployment lacks bounded target-bound live parity");
assert(/materialize-private-source:[\s\S]*HIVE_AI_READ_DEPLOY_KEY[\s\S]*persist-credentials: false[\s\S]*private-source-bundle\.mjs create/.test(workflow), "credentialed materialization is not inert and non-persistent");
const compileSection = workflow.split(/\n  compile:\n/u)[1]?.split(/\n  publish:\n/u)[0] || "";
assert(compileSection && !compileSection.includes("secrets.HIVE_AI_READ_DEPLOY_KEY"), "credential-free compiler references the private deploy key");
assert(/Prove the compiler job has no private checkout credential[\s\S]*HIVE_AI_READ_DEPLOY_KEY[\s\S]*GIT_SSH_COMMAND[\s\S]*private-source-bundle\.mjs verify/.test(compileSection), "compiler does not prove credential absence before private execution");
assert(/private-source-bundle\.mjs prepare[\s\S]*sync-galaxy-snapshot\.mjs --source-bundle/.test(compileSection), "compiler does not verify and prepare the inert source bundle before execution");
assert(/publish:[\s\S]*if: needs\.compile\.result == 'success' && github\.ref == 'refs\/heads\/main'/.test(workflow), "contents-write publisher is not main-bound");
assert(workflow.includes("/hiveai/static/living-anatomy/src/galaxy-contract.json"), "private materialization omits the canonical renderer contract");
assert(facts.schema === "hive.ecosystem.public-source-snapshot.v3"
  && facts.snapshotVersion === GALAXY_SNAPSHOT_VERSION
  && /^[a-f0-9]{64}$/.test(facts.snapshotHash || ""), "publisher candidate is not a sealed v3 snapshot");
assert(facts.galaxy?.geometry?.contractHash === GALAXY_RENDERER_CONTRACT_HASH, "publisher candidate is not bound to the canonical renderer contract");
assert(facts.galaxy?.geometry?.geometryHash === GALAXY_CANONICAL_GEOMETRY_HASH, "publisher candidate is not bound to the reviewed authored geometry digest");
assert(await validSnapshot(facts), "publisher candidate fails the strict runtime validator");

console.log("PUBLISHER_RACES_OK b_d_c=accepted facts_plus_other=refused nonancestor=refused merge=refused b_c_e=current_main changed_handoff=one nochange_handoff=zero concurrency=noncancelling credential_isolation=bound");
