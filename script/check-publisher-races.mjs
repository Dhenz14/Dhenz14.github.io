#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAGES_POLICY,
  artifactName,
  durablePublicationDecision,
  finalMarkerState,
  markerDescription,
  pendingQueueSurvivors,
  predeployDecision,
  publicationAuthorityDecision,
  publicationDecisionAfterProbe,
} from "./publisher-candidate-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github", "workflows", "publish-reviewed-pages.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const commit = (character) => character.repeat(40);
const digest = (character) => character.repeat(64);
const B = commit("b");
const C = commit("c");
const E = commit("e");
const repositoryId = 12345;

function authority(overrides = {}) {
  return publicationAuthorityDecision({
    repository: PAGES_POLICY.repository,
    ref: PAGES_POLICY.ref,
    eventName: "push",
    eventSha: E,
    workflowSha: E,
    currentMainSha: E,
    workflowPath: PAGES_POLICY.workflowPath,
    ...overrides,
  });
}

function exactMarker(overrides = {}) {
  const runId = "7001";
  const runAttempt = "2";
  const artifactId = "9001";
  const valueDigest = digest("a");
  return {
    state: "success",
    context: PAGES_POLICY.statusContext,
    creator: "github-actions[bot]",
    description: markerDescription({ runId, runAttempt, artifactId, digest: valueDigest }),
    targetUrl: `https://github.com/${PAGES_POLICY.repository}/actions/runs/${runId}/attempts/${runAttempt}`,
    ...overrides,
  };
}

function exactArtifact(overrides = {}) {
  return {
    id: "9001",
    name: artifactName("7001", "2"),
    digest: `sha256:${digest("a")}`,
    expired: false,
    runId: "7001",
    runAttempt: "2",
    headSha: E,
    repositoryId,
    exactNameCount: 1,
    ...overrides,
  };
}

function durable(overrides = {}) {
  return durablePublicationDecision({
    targetSha: E,
    workflowSha: E,
    currentMainSha: E,
    exactDeploymentSucceeded: true,
    marker: exactMarker(),
    artifact: exactArtifact(),
    repositoryId,
    ...overrides,
  });
}

assert(authority() === "ADMIT_CURRENT_MAIN", "exact current-main workflow authority was refused");
assert(authority({ eventSha: B, workflowSha: B }) === "REDISPATCH_CURRENT_MAIN", "old push/rerun did not redispatch current main");
assert(authority({ eventSha: C, workflowSha: C }) === "REDISPATCH_CURRENT_MAIN", "intermediate push did not redispatch current main");
assert(authority({ ref: "refs/tags/main" }) === "REFUSE_SCOPE", "tag authority was admitted");
assert(authority({ ref: "refs/heads/feature" }) === "REFUSE_SCOPE", "non-main authority was admitted");
assert(authority({ eventName: "pull_request" }) === "REFUSE_SCOPE", "unlisted event authority was admitted");

const survivors = pendingQueueSurvivors([B, C, E]);
assert(survivors.length === 2 && survivors[0] === B && survivors[1] === E, "one-pending replacement model drifted");
assert(authority({ eventSha: survivors[0], workflowSha: survivors[0] }) === "REDISPATCH_CURRENT_MAIN", "stale active survivor did not repair a replaced pending signal");
assert(authority({ eventSha: survivors[1], workflowSha: survivors[1] }) === "ADMIT_CURRENT_MAIN", "stable pending survivor did not reconcile current main");

assert(durable() === "PROBE_LIVE_BEFORE_NOOP", "exact deployment and parity tuple was not admitted for a fresh probe");
assert(publicationDecisionAfterProbe({ durableDecision: durable(), liveParityPassed: true }) === "NOOP", "successful exact deployment plus fresh parity did not no-op");
assert(publicationDecisionAfterProbe({ durableDecision: durable(), liveParityPassed: false }) === "REPAIR", "live parity failure did not repair");
for (const mutation of [
  { exactDeploymentSucceeded: false },
  { marker: null },
  { marker: exactMarker({ state: "pending" }) },
  { marker: exactMarker({ state: "failure" }) },
  { marker: exactMarker({ creator: "attacker" }) },
  { marker: exactMarker({ context: "pages/parity/r7" }) },
  { marker: exactMarker({ targetUrl: "https://example.invalid/spoof" }) },
  { artifact: exactArtifact({ exactNameCount: 2 }) },
  { artifact: exactArtifact({ digest: `sha256:${digest("f")}` }) },
  { artifact: exactArtifact({ expired: true }) },
  { targetSha: C },
  { workflowSha: C },
  { currentMainSha: C },
]) assert(durable(mutation) === "REPAIR", `malformed/missing durable watermark did not repair: ${JSON.stringify(mutation)}`);

assert(predeployDecision({ targetSha: E, workflowSha: E, currentMainSha: E, artifactVerified: true, artifactUnique: true, producersComplete: true }) === "DEPLOY", "exact predeploy tuple was refused");
for (const mutation of [
  { currentMainSha: C },
  { workflowSha: C },
  { artifactVerified: false },
  { artifactUnique: false },
  { producersComplete: false },
]) assert(predeployDecision({ targetSha: E, workflowSha: E, currentMainSha: E, artifactVerified: true, artifactUnique: true, producersComplete: true, ...mutation }) === "REFUSE_STALE_OR_UNBOUND", `predeploy race was admitted: ${JSON.stringify(mutation)}`);

assert(finalMarkerState({ pendingWritten: true, deployResult: "success", parityResult: "success", currentMainStillTarget: true }) === "success", "exact deploy/parity did not produce success");
for (const mutation of [
  { pendingWritten: false },
  { deployResult: "failure" },
  { parityResult: "failure" },
  { currentMainStillTarget: false },
]) assert(finalMarkerState({ pendingWritten: true, deployResult: "success", parityResult: "success", currentMainStillTarget: true, ...mutation }) === "failure", `failed boundary produced success: ${JSON.stringify(mutation)}`);

function jobSection(job) {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  if (start < 0) throw new Error(`workflow job missing: ${job}`);
  const bodyStart = start + 1;
  const remainder = workflow.slice(bodyStart);
  const next = /\n  [a-z0-9-]+:\n/u.exec(remainder.slice(1));
  return next ? remainder.slice(0, next.index + 1) : remainder;
}

assert(!fs.existsSync(path.join(root, ".github", "workflows", "sync-living-galaxy.yml")), "retired private sync workflow remains");
assert(!fs.existsSync(path.join(root, "script", "private-source-bundle.mjs")), "retired private bundle executor remains");
assert(!/workflow_call|HIVE_AI_READ_DEPLOY_KEY|private-source-bundle|sync-living-galaxy/u.test(workflow), "retired bridge authority remains in Pages workflow");
assert(/push:[\s\S]*branches: \[main\][\s\S]*workflow_dispatch:[\s\S]*schedule:/u.test(workflow), "repair-capable trigger set drifted");
assert(/concurrency:\s*\n\s*group: reviewed-pages\s*\n\s*cancel-in-progress: false/u.test(workflow), "workflow-level non-cancelling lock missing");
assert(/github\.sha|EVENT_SHA/u.test(workflow) && /github\.workflow_sha|WORKFLOW_SHA/u.test(workflow) && /git\/ref\/heads\/main/u.test(workflow), "initial current-main/workflow authority identity is incomplete");

for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu)) {
  assert(/@[a-f0-9]{40}$/u.test(match[1]), `external action is not full-SHA pinned: ${match[1]}`);
}
assert(/github-pages-\$RUN_ID-\$RUN_ATTEMPT|github-pages-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u.test(workflow), "unique run/attempt artifact name is missing");
assert(/include-hidden-files:\s*true/u.test(workflow), "hidden-file artifact admission is not explicit");
assert(/verify-pages-artifact\.mjs[\s\S]*--expected-id[\s\S]*--expected-target-sha/u.test(workflow), "fresh exact-ID artifact verifier is not invoked");
assert(/artifact_rest_digest[\s\S]*artifact_tar_sha256[\s\S]*membership_manifest_sha256[\s\S]*member_count/u.test(workflow), "verified artifact tuple outputs are incomplete");
assert(/pages\/parity\/r8/u.test(workflow) && /r8 pending run=/u.test(workflow) && /r8 run=/u.test(workflow), "versioned pending/final marker lifecycle is incomplete");
assert(/candidate_noop[\s\S]*check-live-parity\.mjs[\s\S]*action=noop/u.test(workflow), "durable no-op is not followed by fresh live parity");
assert(/Redispatch stale authority[\s\S]*actions: write[\s\S]*publish-reviewed-pages\.yml\/dispatches[\s\S]*[{]"ref":"main"[}]/u.test(workflow), "stale one-pending survivor lacks bounded redispatch");

const privileged = ["redispatch-stale", "pending-marker", "deploy", "final-marker"];
for (const job of privileged) {
  const section = jobSection(job);
  assert(!/actions\/checkout|node\s+script\/|python|persist-credentials/u.test(section), `privileged job executes mutable repository/private code: ${job}`);
}
const deploy = jobSection("deploy");
assert(/actions: read[\s\S]*contents: read[\s\S]*pages: write[\s\S]*id-token: write/u.test(deploy), "deploy least-privilege set drifted");
assert(!/statuses: write/u.test(deploy), "deploy job can mutate status");
assert(/git\/ref\/heads\/main[\s\S]*exactNameCount|git\/ref\/heads\/main[\s\S]*\[\.artifacts\[\]/u.test(deploy), "predeploy current-main and exact artifact REST recheck is missing");
assert(/artifact_name:\s*\$\{\{ needs\.verify-artifact\.outputs\.artifact_name \}\}/u.test(deploy), "deploy action does not consume the unique verified name");
assert(/Mark exact target parity pending[\s\S]*statuses: write/u.test(workflow), "pending marker is not isolated to statuses write");
assert(/Finalize exact target parity watermark[\s\S]*statuses: write/u.test(workflow), "final marker is not isolated to statuses write");

console.log("PUBLISHER_RACES_OK authority=current-main stale=redispatch queue=one-pending-repaired durable=deployment+tuple+fresh-parity recovery=all-failures privileged=repo-code-free artifact=unique-id-digest-tar-manifest");
