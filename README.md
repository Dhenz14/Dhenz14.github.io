# Hive AI public hub

This repository contains the source for the Hive ecosystem GitHub Pages hub.
The public experience is a cinematic, source-bound **Constellation Atlas**. It
describes target architecture and reviewed source facts; it is not an installed
runtime, a product-live claim, or an authority surface.

The homepage separates these planes deliberately:

- **Reviewed Product Truth baseline** — stable semantic claims that a routine
  source refresh cannot rewrite. The browser admits only the closed relation
  set `EXACT_REVIEWED_BASELINE_MATCH`, `NEW_SOURCE_SNAPSHOT_UNREVIEWED_HOLD`,
  `BRIDGE_INACTIVE_LAST_GOOD_SOURCE`, or `SNAPSHOT_INVALID_BLOCKED`.
- **Published source snapshot** — the exact mutable `hub-assets/hub-facts.json`
  topology and authored geometry. A valid new source snapshot may be displayed,
  but its semantic, runtime, product, and authority claims remain `HOLD` until a
  new reviewed baseline is deliberately published.
- **Freshness** — evaluated from the capture time. A structurally valid aged or
  historical capture stays source-bound but renders `FRESHNESS HOLD`; automatic
  sync configuration cannot make old evidence current.
- **Local Living Anatomy** — a future reserved presentation overlay that
  requires separate attestation. Its inert context tuple cannot become an
  active `:5002` handoff until an exact strict-runtime receipt exists.
- **Operator Body** — a distinct intended `127.0.0.1:5003` service. It is never
  aliased to the Local Body and remains `HOLD` until separately deployed and
  observed.
- **Chat** — not available from this public presentation. Status: `WAIT`.
- **Hive IDE** — not available from this public candidate. Status: `WAIT`.
  Expired tester.5/tester.6 observations remain historical evidence only;
  current package identity and retrievability are `UNKNOWN`, and no download,
  install, testing, runtime, or product claim is authorized.
  The manual GitHub workflow validates that HOLD only; it fetches and executes
  no installer. The retained Windows smoke harness is dormant until fresh
  package evidence and separate operator authorization exist.
- **HivePoA** — one actionless quarantine/history boundary. Historical immutable
  observations are preserved, while current delivery, coordinator, runtime,
  product-live state, and publication authority remain `UNKNOWN`/`HOLD`.

The Atlas renders 640 source-authored capability identities in the exact
16-division / 64-family geometry bound by
`hive.galaxy.renderer-contract.v1`. Aggregate source counts are not liveness,
served influence, work-lane, runtime, or product telemetry. Full-atlas,
Director, and Mission Control interactions are keyboard-operable, reduced-motion
safe, and zero-effect.

## Publication custody

The repository root is **not** the Pages artifact. The custom workflow
`.github/workflows/publish-reviewed-pages.yml` creates a brand-new empty stage
from `.github/pages-public-allowlist.v1.json`, verifies exact final membership,
runs the HTTP-surface contract against that stage, and uploads only that
artifact. The builder rejects unsafe paths, unlisted public JSON, symlinks,
detectable hard-link ambiguity, and private repository material.

The published artifact intentionally excludes:

- `.github/**`, including portable historical verification fixtures;
- `script/**`, `docs/**`, `README.md`, tests, receipts, and runbooks;
- retired `HivePoA/cid-mirrors/**` and
  `HivePoA/distribution-assets/**` delivery/authorization files; and
- the original 23 exact forbidden fixture/retired raw paths plus
  `HivePoA/.distribution-publish-receipt.json` and `HivePoA/.nojekyll`, all
  frozen as negative routes in the allowlist.

Seven legacy HivePoA routes remain as byte-identical, scriptless, CSP-bound
quarantine pages so old links fail safely. They expose no download, verification,
release, authorization, or tester-network action.

The source workflow does not prove that the repository's Pages setting has been
switched from legacy branch publication to **GitHub Actions**. That setting and
the deployed artifact require a separate repository readback before anyone may
claim the allowlisted workflow is product-live.

## Source snapshot refresh

`.github/workflows/sync-living-galaxy.yml` compiles and admits only one bounded
`hub-assets/hub-facts.json` candidate. Its publisher reconstructs from current
`main`, applies the tested concurrent-writer policy, validates exact bytes and
paths, and pushes only the facts file. It never requests a legacy Pages build.

Because a push made with `GITHUB_TOKEN` does not trigger another push workflow,
the Pages workflow also listens for the successful completion of `Sync living
galaxy`. That route checks out exact current `main`, refuses a stale artifact,
proves the workflow-start commit is the sole parent of an admitted facts-only
update, skips a no-change completion, and uses the same allowlisted build. This
is a source design contract, not proof that a scheduled run, deployment, or
public readback succeeded.

The browser acquires `hub-facts.json`, Product Truth, its evidence ledger, and
both Hive IDE evidence documents through one shared streaming primitive. It
requires a canonical `Content-Length`, enforces declared and actual byte counts,
cancels at the supplied limit plus one byte, uses an eight-second request/body
deadline, performs fatal UTF-8 decoding, and then invokes the shared strict JSON
parser. Missing, malformed, or lying lengths; early disconnects; stalls; BOMs;
duplicate keys; NFC-colliding keys; non-RFC8259 whitespace; unpaired surrogates;
trailing content; invalid UTF-8; empty bodies; and oversized bodies fail closed.
Snapshot retries are scheduled independently of the first request settling.

## Dependency-free verification

Run the static and hostile contracts from the repository root:

```bash
node --check hub-assets/hub.js
node --check hub-assets/galaxy-core.mjs
node --check hub-assets/ide-release-core.mjs
node --check hub-assets/strict-json.mjs
node --check hub-assets/strict-json-fetch.mjs
node --check script/check-browser-json-acquisition.mjs
node --check script/hub-facts-custody.mjs
node script/hub-facts-custody.mjs --self-test
node script/check-central-hub.mjs
node script/check-product-truth.mjs --self-test
node script/check-ide-release.mjs --self-test
node script/check-browser-json-acquisition.mjs
node script/check-galaxy-bridge.mjs
node script/check-galaxy-core.mjs
node script/check-publisher-races.mjs
node script/check-signed-release.mjs
node script/check-signed-release.mjs --verify-git-provenance
node script/check-signed-release.mjs --self-test
node script/check-signed-release-portability.mjs --git-archive
node script/build-public-pages.mjs --self-test
node script/check-public-pages-artifact.mjs
git diff --check
```

`check-public-pages-artifact.mjs` builds in a temporary empty directory, checks
exact membership, starts an ephemeral loopback HTTP server against the staged
artifact, asserts deliberate public routes, asserts every private/retired route
is absent, closes the server, and removes its exact temporary directory.

After an authorized workflow deployment and Pages-setting readback, live parity
is a separate gate. It compares every deliberate allowlisted public byte,
strict-parses the public JSON set, and requires every private/retired path probe
to return 404 or 410:

```bash
node script/check-live-parity.mjs --origin https://dhenz14.github.io
```

Source validation, candidate construction, landing on `main`, workflow success,
deployed bytes, installed runtime, observed behavior, product-live state, and
operator authority remain separate claims throughout this repository.
