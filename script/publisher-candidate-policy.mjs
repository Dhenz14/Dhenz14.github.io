#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const FACTS_PATH = "hub-assets/hub-facts.json";

export function publisherCandidateDecision({ baseFactsHash, remoteFactsHash, candidateFactsHash }) {
  for (const [name, value] of Object.entries({ baseFactsHash, remoteFactsHash, candidateFactsHash })) {
    if (!SHA256.test(String(value || ""))) throw new Error(`invalid ${name}`);
  }
  if (remoteFactsHash === candidateFactsHash) return "ALREADY_LANDED";
  if (remoteFactsHash === baseFactsHash) return "REBUILD_EXACT";
  return "CONCURRENT_FACTS_WINNER";
}

function exactMutation(value) {
  if (!value || !COMMIT.test(value.sha || "") || !Number.isSafeInteger(value.parentCount)
    || !Array.isArray(value.paths) || value.paths.length < 1) {
    throw new Error("invalid intervening mutation");
  }
  const paths = [...new Set(value.paths.map((entry) => String(entry || "")))];
  if (paths.some((entry) => !entry || entry.includes("\\") || path.posix.normalize(entry) !== entry)) {
    throw new Error("unsafe intervening mutation path");
  }
  return { ...value, paths };
}

export function publisherTransitionDecision({
  baseCommit,
  remoteCommit,
  baseIsAncestor,
  mutations,
  baseFactsHash,
  remoteFactsHash,
  candidateFactsHash,
}) {
  if (!COMMIT.test(String(baseCommit || "")) || !COMMIT.test(String(remoteCommit || ""))) {
    throw new Error("invalid source commit identity");
  }
  if (baseIsAncestor !== true) return "REJECT_BASE_NOT_ANCESTOR";
  if (!Array.isArray(mutations)) throw new Error("invalid intervening mutation set");
  const admittedMutations = mutations.map(exactMutation);
  if (admittedMutations.some((mutation) => mutation.parentCount !== 1)) return "REJECT_MERGE_MUTATION";
  if (admittedMutations.some((mutation) => mutation.paths.includes(FACTS_PATH) && mutation.paths.length !== 1)) {
    return "REJECT_MIXED_FACTS_MUTATION";
  }
  return publisherCandidateDecision({ baseFactsHash, remoteFactsHash, candidateFactsHash });
}

export function publicationHandoff({ changed, targetSha }) {
  if (changed === false) return null;
  if (changed !== true || !COMMIT.test(String(targetSha || ""))) throw new Error("invalid publication handoff");
  return Object.freeze({ requestedSha: targetSha, signalKind: "sync-direct-handoff" });
}

export function resolvePublicationTarget({ requestedSha, currentMainSha, requestedIsAncestor }) {
  if (!COMMIT.test(String(requestedSha || "")) || !COMMIT.test(String(currentMainSha || ""))) {
    throw new Error("invalid publication target identity");
  }
  if (requestedIsAncestor !== true) throw new Error("publication signal is not an ancestor of current main");
  return currentMainSha;
}

function git(repository, args, options = {}) {
  return execFileSync("git", ["-C", repository, ...args], {
    encoding: options.encoding ?? "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitObjectHash(repository, commit, repositoryPath) {
  const bytes = git(repository, ["show", `${commit}:${repositoryPath}`], { encoding: null });
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function inspectPublisherTransition({ repository, baseCommit, remoteCommit, candidateFactsHash }) {
  const repo = path.resolve(repository);
  let baseIsAncestor = true;
  try {
    git(repo, ["merge-base", "--is-ancestor", baseCommit, remoteCommit]);
  } catch {
    baseIsAncestor = false;
  }
  const mutations = [];
  if (baseIsAncestor && baseCommit !== remoteCommit) {
    const commits = git(repo, ["rev-list", "--reverse", "--topo-order", `${baseCommit}..${remoteCommit}`])
      .trim().split(/\s+/u).filter(Boolean);
    for (const sha of commits) {
      const parents = git(repo, ["rev-list", "--parents", "-n", "1", sha]).trim().split(/\s+/u);
      const paths = git(repo, ["diff-tree", "--no-commit-id", "--name-only", "-r", `${sha}^`, sha])
        .trim().split(/\r?\n/u).filter(Boolean);
      mutations.push({ sha, parentCount: parents.length - 1, paths });
    }
  }
  return publisherTransitionDecision({
    baseCommit,
    remoteCommit,
    baseIsAncestor,
    mutations,
    baseFactsHash: gitObjectHash(repo, baseCommit, FACTS_PATH),
    remoteFactsHash: gitObjectHash(repo, remoteCommit, FACTS_PATH),
    candidateFactsHash,
  });
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : String(process.argv[index + 1] || "");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (option("--repository")) {
      console.log(inspectPublisherTransition({
        repository: option("--repository"),
        baseCommit: option("--base-commit"),
        remoteCommit: option("--remote-commit"),
        candidateFactsHash: option("--candidate"),
      }));
    } else {
      console.log(publisherCandidateDecision({
        baseFactsHash: option("--base"),
        remoteFactsHash: option("--remote"),
        candidateFactsHash: option("--candidate"),
      }));
    }
  } catch (error) {
    console.error(`publisher candidate policy refused: ${error.message}`);
    process.exitCode = 1;
  }
}
