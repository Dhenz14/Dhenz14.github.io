#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;

export function publisherCandidateDecision({ baseFactsHash, remoteFactsHash, candidateFactsHash }) {
  for (const [name, value] of Object.entries({ baseFactsHash, remoteFactsHash, candidateFactsHash })) {
    if (!SHA256.test(String(value || ""))) throw new Error(`invalid ${name}`);
  }
  if (remoteFactsHash === candidateFactsHash) return "ALREADY_LANDED";
  if (remoteFactsHash === baseFactsHash) return "REBUILD_EXACT";
  return "CONCURRENT_FACTS_WINNER";
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : String(process.argv[index + 1] || "");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(publisherCandidateDecision({
      baseFactsHash: option("--base"),
      remoteFactsHash: option("--remote"),
      candidateFactsHash: option("--candidate"),
    }));
  } catch (error) {
    console.error(`publisher candidate policy refused: ${error.message}`);
    process.exitCode = 1;
  }
}
