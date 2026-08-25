# Public Constellation Atlas snapshot custody

## Current boundary

The automatic public/private bridge is intentionally retired from this
presentation release. This repository contains no scheduled private checkout,
deploy-key consumer, private-source bundle executor, contents-write snapshot
publisher, or direct source-sync deployment handoff. The checked-in
`hub-assets/hub-facts.json` is a historical source snapshot, not evidence that a
refresh job, runtime, or product is currently operating.

The snapshot keeps two time planes separate:

- capture fields describe the immutable acquisition configuration and source
  identity at the original observation; and
- `latestRefreshObservation` records the later bridge disposition, observation
  time, configuration at that observation, execution status, and current
  operational status.

A failed or retired refresh may update only the second plane and the derived
snapshot self-hash. It must not rewrite `capturedAt`, the acquisition mode or
reason at capture, source facts, topology, or authored geometry. No implicit
wall-clock timestamp is admitted; both manual generation and inactive marking
require an explicit UTC-second instant so a no-change operation cannot mint new
evidence.

## Manual compiler

`script/sync-galaxy-snapshot.mjs` remains an offline/manual compiler. It accepts
an explicitly selected clean source checkout, verifies the exact checkout and
remote-main relation before and after compilation, binds tracked inputs by Git
object and bytes, validates the graph and evidence closure, and writes one
strict public projection atomically. `--source-bundle` is rejected because the
public repository no longer accepts a private materialization format. The
compiler requires `--captured-at`; it does not infer evidence time from the
machine clock.

The v3.1 output is a bounded public projection: aggregate source facts, six
public organ descriptions, stable topology, and exact authored geometry. The
`hive.galaxy.renderer-contract.v1` projection cardinality-checks and hashes 16
divisions, 64 families, and 640 neuron identities. It does not publish private
paths, prompts, credentials, per-neuron runtime status, or operator authority.

Product Truth compares a valid snapshot with the separately frozen semantic
baseline. The classification precedence is:

1. invalid structure becomes `SNAPSHOT_INVALID_BLOCKED`;
2. a valid source identity different from the reviewed baseline becomes
   `NEW_SOURCE_SNAPSHOT_UNREVIEWED_HOLD`, even for a manual or inactive
   acquisition;
3. the exact reviewed source plus an inactive later bridge observation becomes
   `BRIDGE_INACTIVE_LAST_GOOD_SOURCE`; and
4. the exact reviewed source with the exact active relation becomes
   `EXACT_REVIEWED_BASELINE_MATCH`.

A valid new topology may render, but unreviewed semantic, runtime, product, and
authority claims remain `HOLD`. This makes future convergence satisfiable
without letting a mutable snapshot rewrite reviewed meaning.

## Future re-enable

Automatic convergence requires a separate reviewed private producer and a new
authority package. That producer must export only the sanitized public snapshot
through an independently bounded custody interface; this public repository must
not execute private source or hold a private checkout credential. Re-enabling a
producer, changing secrets, or granting publication authority is outside this
presentation candidate.

The sole current publication workflow is public-only
`.github/workflows/publish-reviewed-pages.yml`. It builds the reviewed Pages
allowlist, verifies the exact uploaded artifact by ID/digest/tar/membership, and
deploys only after current-main and parity state agree. This does not claim that
repository Pages settings, a workflow run, deployed bytes, or live parity have
been observed.

## Local verification

```bash
node script/check-central-hub.mjs
node script/check-product-truth.mjs --self-test --require-git-binding
node script/check-galaxy-bridge.mjs
node script/check-galaxy-core.mjs
node script/check-browser-json-acquisition.mjs
node script/check-publisher-races.mjs
node script/build-public-pages.mjs --self-test
node script/verify-pages-artifact.mjs --self-test
node script/check-public-pages-artifact.mjs
node --check hub-assets/hub.js
node --check hub-assets/galaxy-core.mjs
node --check hub-assets/strict-json-fetch.mjs
node --check script/sync-galaxy-snapshot.mjs
node --check script/mark-galaxy-bridge-inactive.mjs
```

Run `script/check-live-parity.mjs` only after an authorized deployment and
repository-setting readback. It compares every reviewed public byte with the
exact checkout and requires private, fixture, and retired routes to remain 404
or 410.
