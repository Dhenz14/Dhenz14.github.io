#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const INTEGER = /^[1-9][0-9]*$/;

export const PAGES_POLICY = Object.freeze({
  repository: "Dhenz14/Dhenz14.github.io",
  ref: "refs/heads/main",
  workflowPath: ".github/workflows/publish-reviewed-pages.yml",
  statusContext: "pages/parity/r8",
  admittedEvents: Object.freeze(["push", "workflow_dispatch", "schedule"]),
});

function exactSha(value, label) {
  if (!COMMIT.test(String(value || ""))) throw new Error(`invalid ${label}`);
  return value;
}

function exactInteger(value, label) {
  if (!INTEGER.test(String(value || ""))) throw new Error(`invalid ${label}`);
  return String(value);
}

export function artifactName(runId, runAttempt) {
  return `github-pages-${exactInteger(runId, "run ID")}-${exactInteger(runAttempt, "run attempt")}`;
}

export function publicationAuthorityDecision({
  repository,
  ref,
  eventName,
  eventSha,
  workflowSha,
  currentMainSha,
  workflowPath,
}) {
  if (repository !== PAGES_POLICY.repository || ref !== PAGES_POLICY.ref
    || workflowPath !== PAGES_POLICY.workflowPath || !PAGES_POLICY.admittedEvents.includes(eventName)) {
    return "REFUSE_SCOPE";
  }
  exactSha(eventSha, "event SHA");
  exactSha(workflowSha, "workflow SHA");
  exactSha(currentMainSha, "current main SHA");
  if (eventSha !== workflowSha || workflowSha !== currentMainSha) return "REDISPATCH_CURRENT_MAIN";
  return "ADMIT_CURRENT_MAIN";
}

export function pendingQueueSurvivors(signals) {
  if (!Array.isArray(signals) || signals.length === 0) throw new Error("publication signal set is empty");
  signals.forEach((signal, index) => exactSha(signal, `signal ${index}`));
  return signals.length === 1 ? [signals[0]] : [signals[0], signals.at(-1)];
}

export function markerDescription({ runId, runAttempt, artifactId, digest, pending = false }) {
  const prefix = pending ? "r8 pending" : "r8";
  if (!DIGEST.test(String(digest || ""))) throw new Error("invalid artifact digest");
  return `${prefix} run=${exactInteger(runId, "run ID")} attempt=${exactInteger(runAttempt, "run attempt")} artifact=${exactInteger(artifactId, "artifact ID")} digest=${digest}`;
}

export function parseSuccessMarker({ state, context, creator, description, targetUrl, repository = PAGES_POLICY.repository }) {
  if (state !== "success" || context !== PAGES_POLICY.statusContext || creator !== "github-actions[bot]") return null;
  const match = /^r8 run=([1-9][0-9]*) attempt=([1-9][0-9]*) artifact=([1-9][0-9]*) digest=([a-f0-9]{64})$/.exec(String(description || ""));
  if (!match) return null;
  const [, runId, runAttempt, artifactId, digest] = match;
  const exactTargetUrl = `https://github.com/${repository}/actions/runs/${runId}/attempts/${runAttempt}`;
  if (targetUrl !== exactTargetUrl) return null;
  return Object.freeze({ runId, runAttempt, artifactId, digest, artifactName: artifactName(runId, runAttempt) });
}

export function artifactTupleMatches({ marker, artifact, targetSha, repositoryId }) {
  if (!marker || !artifact || !Number.isSafeInteger(Number(repositoryId)) || Number(repositoryId) <= 0) return false;
  exactSha(targetSha, "target SHA");
  return String(artifact.id) === marker.artifactId
    && artifact.name === marker.artifactName
    && artifact.digest === `sha256:${marker.digest}`
    && artifact.expired === false
    && String(artifact.runId) === marker.runId
    && String(artifact.runAttempt) === marker.runAttempt
    && artifact.headSha === targetSha
    && Number(artifact.repositoryId) === Number(repositoryId)
    && artifact.exactNameCount === 1;
}

export function durablePublicationDecision({
  targetSha,
  workflowSha,
  currentMainSha,
  exactDeploymentSucceeded,
  marker,
  artifact,
  repositoryId,
}) {
  exactSha(targetSha, "target SHA");
  exactSha(workflowSha, "workflow SHA");
  exactSha(currentMainSha, "current main SHA");
  if (targetSha !== workflowSha || targetSha !== currentMainSha) return "REPAIR";
  const parsed = parseSuccessMarker(marker || {});
  if (exactDeploymentSucceeded !== true || !artifactTupleMatches({ marker: parsed, artifact, targetSha, repositoryId })) return "REPAIR";
  return "PROBE_LIVE_BEFORE_NOOP";
}

export function publicationDecisionAfterProbe({ durableDecision, liveParityPassed }) {
  return durableDecision === "PROBE_LIVE_BEFORE_NOOP" && liveParityPassed === true ? "NOOP" : "REPAIR";
}

export function predeployDecision({ targetSha, workflowSha, currentMainSha, artifactVerified, artifactUnique, producersComplete }) {
  exactSha(targetSha, "target SHA");
  exactSha(workflowSha, "workflow SHA");
  exactSha(currentMainSha, "current main SHA");
  return targetSha === workflowSha && targetSha === currentMainSha
    && artifactVerified === true && artifactUnique === true && producersComplete === true
    ? "DEPLOY" : "REFUSE_STALE_OR_UNBOUND";
}

export function finalMarkerState({ pendingWritten, deployResult, parityResult, currentMainStillTarget }) {
  return pendingWritten === true && deployResult === "success" && parityResult === "success" && currentMainStillTarget === true
    ? "success" : "failure";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`PUBLISHER_POLICY_OK context=${PAGES_POLICY.statusContext} queue=one-active-one-pending recovery=redispatch-current-main`);
}
