# Public Constellation Atlas synchronization

## Current guarantee

`script/sync-galaxy-snapshot.mjs` is the only path that can recompile the public
source-topology snapshot. It cannot activate a runtime or rewrite the stable
reviewed Product Truth baseline. It refuses to emit a candidate unless the selected
Hive-AI commit is current remote `main`, the entire checkout is clean and
commit-bound, checkout `HEAD` equals that exact commit, the generated graph
passes Living Anatomy validation, and every source-manifest and tracked evidence
byte matches the frozen commit. Three publisher-only ratification inputs must be
materialized and must enter the compiled evidence closure. The compiler checks
remote `main` both before and after compilation; movement produces a clean retry,
never a mixed-era artifact. A shallow clone is accepted only when the newest
truth-input commit is proven before the shallow boundary. The write is atomic
and `--check` is idempotent.

The v3.1 output schema is an explicit public allowlist: aggregate source facts,
six public organ descriptions, stable topology, and exact authored geometry.
The source-graph-bound `hive.galaxy.renderer-contract.v1` projection closes,
orders, cardinality-checks, and hashes 16 division, 64 family, and 640 neuron
tuples. It does not contain paths, evidence, blockers, owners, missions,
urgency, prompts, credentials, or per-neuron status. The public renderer
therefore cannot color Twitches gold or imply runtime health; any such facts
require a future local Living Anatomy surface with separate attestation.

The public adapter consumes that projection through the existing Canvas2D
atlas. A future local adapter may converge on geometry, camera, event,
status-language, and fallback semantics, but no current local adapter or runtime
is attested here. A future local context may carry only its version, source
commit, graph hash, lens, node, and level as an inert tuple. The public candidate
keeps every action disabled unless an exact strict-runtime receipt supplies
separate attestation. Pages never probes, starts, or claims availability of a
local surface.

`script/mark-galaxy-bridge-inactive.mjs` has one narrow fail-closed authority:
it can retain all source facts while changing only the refresh boundary from
active to credential-missing. It cannot enable automation or alter source facts.

Product Truth evaluates every admitted snapshot against its frozen reviewed
baseline. An exact match yields `EXACT_REVIEWED_BASELINE_MATCH`; a valid newer
source observation yields `NEW_SOURCE_SNAPSHOT_UNREVIEWED_HOLD`; a
credential-missing or checkout-failed last-good projection yields
`BRIDGE_INACTIVE_LAST_GOOD_SOURCE`; and invalid structure yields
`SNAPSHOT_INVALID_BLOCKED`. Only the topology from a valid new snapshot may be
displayed. Semantic, runtime, product, and authority claims remain held until a
separate review updates the baseline deliberately. This separation makes living
source convergence possible without letting an unreviewed sync rewrite public
meaning.

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
8. The snapshot publisher never requests a legacy branch-root Pages build.
   `.github/workflows/publish-reviewed-pages.yml` builds a brand-new empty stage
   from the reviewed public allowlist and deploys only that exact artifact.
9. `GITHUB_TOKEN` pushes do not emit another push workflow, so a guarded
   `workflow_run` route follows a successful `Sync living galaxy` completion.
   It binds to exact current Pages `main`, skips no-change completions, admits
   only a sole-parent facts-only update from the workflow-start commit, refuses
   a stale artifact, and uses the same staged membership and HTTP-surface checks
   without a PAT.
10. Any source, validation, Actions, push, or deployment failure leaves the
    last-good public snapshot untouched. The page identifies the exact
    represented commit and continues polling the deployed same-origin snapshot
    while visible.

GitHub's five-minute schedule is a convergence target, not a real-time SLA;
scheduled runs can be delayed by the service. Seconds-level push triggering
would additionally require a narrowly scoped GitHub App installed on exactly
Hive-AI and Pages. The scheduled publisher needs no personal token, broad
cross-repository token, private runtime proxy, or write access to Hive-AI; its
single private credential is the repository-specific read-only deploy key.
The public badge reports the validated snapshot identity and its freshness
disposition, never that a future runner is healthy. When
`LIVING_GALAXY_CLOUD_SYNC_ENABLED` is false, a manually dispatched workflow may
only retain or publish the bounded source snapshot and does not claim automatic
convergence.

When cloud credentials are intentionally absent, the workflow publishes the
last-good topology with an inactive bridge boundary. This grants no additional
source, semantic, or runtime authority. The page evaluates `capturedAt` on every 60-second poll: a
capture older than 15 minutes is aged, and one older than one hour is
historical. Both states retain the last-good counts and describe source age
only—not publisher delay or runtime health. Once the browser validates the
strict snapshot contract, the compact header reports that validation as
`verified`; the exact capture time and age classification remain in the public
truth rail and detailed badge text. A refresh failure still reports
`Last-good snapshot` instead of verified.

`capturedAt` records the time of a validated observation, not the source commit
timestamp. Rechecking the same source-bound observation is byte-idempotent and
retains its original capture time; a quiet source does not become artificially
newer merely because a browser or publisher checked it again. Browser
validation time is visit-local and reported separately. Within one publication
attempt, the admitted candidate hash is immutable across all Pages-main retries.

## Local verification

```bash
node script/sync-galaxy-snapshot.mjs --check \
  --hive-ai-repo /path/to/clean/isolated/Hive-AI \
  --hive-ai-ref HEAD
node script/check-central-hub.mjs
node script/check-galaxy-bridge.mjs
node script/check-galaxy-core.mjs
node script/check-browser-json-acquisition.mjs
node script/check-public-pages-artifact.mjs
node script/check-signed-release.mjs
node --check hub-assets/hub.js
node --check hub-assets/galaxy-core.mjs
node --check hub-assets/strict-json-fetch.mjs
node --check script/sync-galaxy-snapshot.mjs
node --check script/mark-galaxy-bridge-inactive.mjs
node script/check-live-parity.mjs --origin https://dhenz14.github.io
```

Run the live-parity command only after the reviewed Pages commit has deployed;
it compares every allowlisted public byte against the landed checkout, parses
the deliberate public JSON with the strict parser, and requires every private,
fixture, and retired raw-path probe to return 404 or 410.
