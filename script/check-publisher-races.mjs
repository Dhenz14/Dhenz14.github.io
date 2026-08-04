#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { publisherCandidateDecision } from "./publisher-candidate-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/sync-living-galaxy.yml"), "utf8");
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
assert(/pages\/builds\/latest[\s\S]*pages\/builds/.test(workflow), "failed Pages deployment cannot recover independently");

console.log("PUBLISHER_RACES_OK disjoint=rebuild_exact identical=already_landed conflict=winner_preserved deployment=retryable");
