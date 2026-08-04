# Public galaxy synchronization

## Current guarantee

`script/sync-galaxy-snapshot.mjs` is the only publisher for the root galaxy
snapshot. It refuses to publish unless the selected Hive-AI commit is current
remote `main`, the compiler paths are clean and commit-bound, the generated
graph passes Living Anatomy validation, and every source-manifest byte matches
the frozen commit. The write is atomic and `--check` is idempotent.

The output schema is an explicit public allowlist: aggregate source facts,
six public organ descriptions, and stable division/family/neuron topology. It
does not contain paths, evidence, blockers, owners, missions, urgency, prompts,
credentials, or per-neuron status. The public renderer therefore cannot color
Twitches gold or imply runtime health; those facts belong to the authenticated
local Living Anatomy surface.

## Active living-main publisher

Hive-AI has a deliberately living `main`; freshness therefore means bounded,
truthful convergence rather than waiting for the branch to stop moving. The
active `.github/workflows/sync-living-galaxy.yml` publisher runs every five
minutes and on manual dispatch:

1. It checks out Pages `main` and a blob-filtered, sparse Hive-AI `main` in
   isolated runner directories.
2. It retries up to three times if Hive-AI advances while the compiler is
   freezing its source commit.
3. The generator accepts only an exact commit that still equals remote `main`,
   validates the graph, and emits the strict public projection atomically.
4. The workflow refuses every changed path except `hub-assets/hub-facts.json`,
   then runs syntax, hub, HTTP, signed-release, and whitespace contracts.
5. It publishes one source-bound snapshot commit using only this repository's
   short-lived `GITHUB_TOKEN`. A non-fast-forward Pages update is rebased and
   rechecked; an incompatible concurrent edit wins and the next run retries.
6. GitHub intentionally does not start branch-based Pages builds for commits
   authored with `GITHUB_TOKEN`, so a changed snapshot explicitly requests the
   repository's legacy Pages build through the Pages API.
7. Any source, validation, Actions, push, or deployment-request failure leaves the last-good public
   snapshot untouched. The page identifies the exact represented commit and
   continues polling the deployed same-origin snapshot while visible.

GitHub's five-minute schedule is a convergence target, not a real-time SLA;
scheduled runs can be delayed by the service. Seconds-level push triggering
would additionally require a narrowly scoped GitHub App installed on exactly
Hive-AI and Pages. The scheduled publisher needs no personal token, broad
secret, private runtime proxy, or write access to Hive-AI.

## Local verification

```bash
node script/sync-galaxy-snapshot.mjs --check \
  --hive-ai-repo /path/to/clean/isolated/Hive-AI \
  --hive-ai-ref HEAD
node script/check-central-hub.mjs
node script/check-galaxy-core.mjs
node script/check-http-surface.mjs
node script/check-signed-release.mjs
node --check hub-assets/hub.js
node --check hub-assets/galaxy-core.mjs
node --check script/sync-galaxy-snapshot.mjs
node script/check-live-parity.mjs --origin https://dhenz14.github.io
```

Run the live-parity command only after the reviewed Pages commit has deployed;
it compares the public bytes of the hub, snapshot, code, and root discovery
assets against the landed checkout.
