# Public galaxy synchronization

## Current guarantee

`script/sync-galaxy-snapshot.mjs` is the only path that can activate and
recompile the root galaxy snapshot. It refuses to publish unless the selected
Hive-AI commit is current remote `main`, the entire checkout is clean and
commit-bound, checkout `HEAD` equals that exact commit, the generated graph
passes Living Anatomy validation, and every source-manifest and tracked evidence
byte matches the frozen commit. Three publisher-only ratification inputs must be
materialized and must enter the compiled evidence closure. The compiler checks
remote `main` both before and after compilation; movement produces a clean retry,
never a mixed-era artifact. A shallow clone is accepted only when the newest
truth-input commit is proven before the shallow boundary. The write is atomic
and `--check` is idempotent.

The output schema is an explicit public allowlist: aggregate source facts,
six public organ descriptions, and stable division/family/neuron topology. It
does not contain paths, evidence, blockers, owners, missions, urgency, prompts,
credentials, or per-neuron status. The public renderer therefore cannot color
Twitches gold or imply runtime health; those facts belong to the authenticated
local Living Anatomy surface.

`script/mark-galaxy-bridge-inactive.mjs` has one narrow fail-closed authority:
it can retain all source facts while changing only the refresh boundary from
active to credential-missing. It cannot enable automation or alter source facts.

## Living-main publisher

Hive-AI has a deliberately living `main`; freshness therefore means bounded,
truthful convergence rather than waiting for the branch to stop moving. The
`.github/workflows/sync-living-galaxy.yml` runs every five minutes and on manual
dispatch. Its source bridge is active only when the Pages repository contains
the `HIVE_AI_READ_DEPLOY_KEY` Actions secret and the matching public key is a
read-only deploy key on Hive-AI, and the
`LIVING_GALAXY_CLOUD_SYNC_ENABLED=true` repository variable explicitly enables
cloud publication:

1. A read-only `compile` job checks out trusted Pages code with persisted
   credentials disabled. It checks for the dedicated deploy key without
   printing it and produces an inactive-boundary candidate when the key is
   absent.
2. When configured, that read-only job checks out a blob-filtered, sparse
   Hive-AI `main` over SSH. The key cannot write to Hive-AI, and the job has no
   Pages write or Pages-build permission. Python 3.12 dependencies install from
   the exact hash lock in `script/requirements-galaxy-sync.txt`.
3. It retries up to three times when Hive-AI advances during an observation. It
   starts with 128 commits of filtered history, deepens to 1,024, then
   unshallows only if canonical truth-input provenance still cannot be proven.
4. The generator accepts only an exact commit that equals remote `main` before
   and after compilation, validates the graph, byte-binds every materialized
   tracked evidence reference, and emits the strict public projection atomically.
5. The compile job refuses every changed path except
   `hub-assets/hub-facts.json`, runs the credential-free test suite, and uploads
   only that inert JSON file as a short-retention artifact.
6. A separate `publish` job receives write authority and starts from a fresh
   checkout of current Pages `main`. It never checks out Hive-AI or executes its
   code. It admits exactly one regular `hub-facts.json` within a bounded size,
   verifies the copy hash, refuses every other changed path, and reruns the
   trusted current-main suite.
7. The publisher commits the source-bound snapshot using only this repository's
   short-lived `GITHUB_TOKEN`. After a non-fast-forward update it never rebases
   or merges the admitted JSON. If remote facts still equal the original base,
   it reconstructs the exact candidate bytes on current Pages `main`, rechecks
   the committed hash and one-path diff, and retries up to three times. If a
   concurrent writer changed the facts, that writer wins and the next scheduled
   run recompiles from fresh source truth.
8. GitHub intentionally does not start branch-based Pages builds for commits
   authored with `GITHUB_TOKEN`, so the publisher compares the latest Pages
   build to current `main` and explicitly requests or retries the legacy build
   whenever the commit is absent or its prior build failed.
9. Any source, validation, Actions, push, or deployment-request failure leaves
   the last-good public snapshot untouched. The page identifies the exact
   represented commit and continues polling the deployed same-origin snapshot
   while visible.

GitHub's five-minute schedule is a convergence target, not a real-time SLA;
scheduled runs can be delayed by the service. Seconds-level push triggering
would additionally require a narrowly scoped GitHub App installed on exactly
Hive-AI and Pages. The scheduled publisher needs no personal token, broad
cross-repository token, private runtime proxy, or write access to Hive-AI; its
single private credential is the repository-specific read-only deploy key.

When cloud credentials are intentionally absent, the same strict compiler may
run from a clean authenticated operator checkout with
`GALAXY_AUTOMATIC_BRIDGE=true GALAXY_BRIDGE_MODE=local`. This local fallback
publishes the identical allowlisted artifact and grants no additional source or
runtime authority. The page evaluates `capturedAt` on every 60-second poll:
15 minutes without a validated refresh is delayed, and one hour is critical.
Both states retain the last-good counts.

`capturedAt` records the time of a validated observation, not the source commit
timestamp. Rechecking an already-published observation is byte-idempotent; a
new observation of the same quiet source may legitimately receive a later
timestamp. Within one publication attempt, the admitted candidate hash is
immutable across all Pages-main retries.

## Local verification

```bash
node script/sync-galaxy-snapshot.mjs --check \
  --hive-ai-repo /path/to/clean/isolated/Hive-AI \
  --hive-ai-ref HEAD
node script/check-central-hub.mjs
node script/check-galaxy-bridge.mjs
node script/check-galaxy-core.mjs
node script/check-http-surface.mjs
node script/check-signed-release.mjs
node --check hub-assets/hub.js
node --check hub-assets/galaxy-core.mjs
node --check script/sync-galaxy-snapshot.mjs
node --check script/mark-galaxy-bridge-inactive.mjs
node script/check-live-parity.mjs --origin https://dhenz14.github.io
```

Run the live-parity command only after the reviewed Pages commit has deployed;
it compares the public bytes of the hub, snapshot, code, and root discovery
assets against the landed checkout.
