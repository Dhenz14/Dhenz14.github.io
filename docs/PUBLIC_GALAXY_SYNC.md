# Public Constellation Atlas synchronization

## Current guarantee

`script/sync-galaxy-snapshot.mjs` is the only path that can recompile the public
source-topology snapshot. It cannot activate a runtime or rewrite the stable
reviewed Product Truth baseline. It refuses to emit a candidate unless the selected
Hive-AI input is either a clean exact remote-`main` checkout or a separately
verified inert materialization of exact private-main bytes. Direct local mode
checks remote `main` before and after compilation. Cloud mode executes no
private module in the credentialed checkout job: it binds the exact commit,
tree, reviewed path set, byte counts, SHA-256 digests, and Git blob OIDs, removes
Git/credential custody, and verifies that bounded artifact again in a fresh
credential-free job. The generated graph must pass Living Anatomy validation,
and every source-manifest and tracked evidence byte must match the selected
binding. Three publisher-only ratification inputs must enter the compiled
evidence closure. The write is atomic and `--check` is idempotent.

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

1. A read-only `materialize-private-source` job checks out the exact trusted
   Pages compiler with persisted credentials disabled. When configured, only a
   pinned checkout action may use the dedicated read-only key to materialize a
   blob-filtered, sparse Hive-AI `main`; no private Python or JavaScript module
   executes in this job.
2. The trusted materializer rejects unsafe paths, unsupported entries,
   symlinks, detectable hard links, `.git`, unexpected or empty directories,
   unbounded files, and path-set drift. It emits an inert artifact bound to the
   exact source commit/tree and every admitted file's bytes, SHA-256, and Git
   blob OID. Missing credentials or checkout failure emits only a typed inactive
   marker.
3. A fresh read-only `compile` job downloads and verifies that artifact. It has
   no deploy key, SSH command, persisted credential, or write token. Only after
   verification may it prepare an ephemeral local Git view and execute the
   private compiler. Python 3.12 dependencies install from the exact hash lock
   in `script/requirements-galaxy-sync.txt`.
4. The generator validates the selected source binding, graph, and generic
   evidence closure, then emits the strict public projection atomically. An
   inactive marker preserves last-good source facts and topology but may change
   the refresh boundary to an explicit HOLD.
5. The credential-free compile job refuses every changed path except
   `hub-assets/hub-facts.json`, runs the credential-free test suite, and uploads
   only that inert JSON file as a short-retention artifact.
6. A separate `publish` job receives write authority and starts from a fresh
   checkout of current Pages `main`. It never checks out Hive-AI or executes its
   code. It admits exactly one regular `hub-facts.json` within a bounded size,
   verifies the copy hash, refuses every other changed path, and reruns the
   trusted current-main suite.
7. The publisher commits the source-bound snapshot using only this repository's
   short-lived `GITHUB_TOKEN`. It never rebases or merges the admitted JSON. The
   executable transition policy requires the compiler base to remain an
   ancestor, rejects merges and any single commit that mixes facts with another
   path, preserves a distinct concurrent facts winner, and permits unrelated
   main motion by reconstructing the exact candidate bytes as a facts-only
   child. It rechecks the committed hash and one-path diff before each bounded
   push attempt.
8. The snapshot publisher never requests a legacy branch-root Pages build.
   `.github/workflows/publish-reviewed-pages.yml` builds a brand-new empty stage
   from the reviewed public allowlist and deploys only that exact artifact.
9. Because `GITHUB_TOKEN` pushes do not emit another push workflow, a successful
   changed publisher directly invokes the reusable Pages workflow with its exact
   pushed SHA. No-change, failed, and ineligible runs emit no handoff and never
   enter the shared Pages lock. Under the non-cancelling deployment-only lock,
   the requested SHA is an ancestor audit lower-bound; the workflow resolves,
   builds, and labels exact current Pages `main`, reruns the full stage and HTTP
   surface gates, rechecks main immediately before upload, deploys, and performs
   bounded target-bound live parity without a PAT or `workflow_run` inference.
10. Any source, validation, Actions, push, or deployment failure preserves the
    last-good source facts and topology; a typed inactive refresh boundary may
    still replace the prior refresh metadata. The page identifies the exact
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
node script/private-source-bundle.mjs --self-test
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
