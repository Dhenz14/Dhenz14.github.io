# Hive AI public hub

This repository contains the source for the Hive ecosystem GitHub Pages hub.
The public experience is a cinematic, source-bound **Constellation Atlas**. It
describes target architecture and reviewed source facts; it is not an installed
runtime, a product-live claim, or an authority surface.

The homepage separates these planes deliberately:

- **Reviewed Product Truth baseline** — stable semantic claims that a routine
  source refresh cannot rewrite. The public-safe baseline is frozen in its own
  predecessor commit before the projection that binds it. The browser verifies
  its exact bytes and independently derives its semantic digest; browser-only
  custody does not verify the Git commit:path relation and is not an independent
  trust root. The browser admits only the closed relation
  set `EXACT_REVIEWED_BASELINE_MATCH`, `NEW_SOURCE_SNAPSHOT_UNREVIEWED_HOLD`,
  `BRIDGE_INACTIVE_LAST_GOOD_SOURCE`, or `SNAPSHOT_INVALID_BLOCKED`.
- **Published source snapshot** — the exact mutable `hub-assets/hub-facts.json`
  topology and authored geometry. A valid new source snapshot may be displayed,
  but its semantic, runtime, product, and authority claims remain `HOLD` until a
  new reviewed baseline is deliberately published.
- **Freshness** — evaluated from the capture time. A structurally valid aged or
  historical capture stays source-bound but renders `FRESHNESS HOLD`; automatic
  sync configuration cannot make old evidence current.
- **Local Living Anatomy** — the preserved separate 3D presentation surface.
  The public hub exposes one exact, user-initiated `:5002` navigation in its
  five source-preserved body doorways across Presentation and Proof; three stay
  visible in Presentation. It never probes, starts, or attests that runtime and
  sends no selected Atlas context. The retained context tuple is a non-executing
  preview until a strict-runtime receipt authorizes more.
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

The repository root is **not** the Pages artifact. The sole publication state
machine, `.github/workflows/publish-reviewed-pages.yml`, creates a brand-new
empty stage from `.github/pages-public-allowlist.v1.json`, verifies its exact
30-file and exact-directory membership, runs the HTTP-surface contract, and
uploads a unique run/attempt artifact. A fresh read-only job downloads that
artifact by exact ID, binds the REST digest, inspects the inner tar bytes and
member types, and records exact tar and membership-manifest digests before a
no-checkout deploy job may consume the same unique artifact name. The builder
and verifier reject unsafe/non-NFC paths, control characters, case or Unicode
collisions, extra directories, links, special/PAX members, unlisted JSON, and
private repository material.

The published artifact intentionally excludes:

- `.github/**`, including portable historical verification fixtures;
- `script/**`, `docs/**`, `README.md`, tests, receipts, and runbooks;
- retired `HivePoA/cid-mirrors/**` and
  `HivePoA/distribution-assets/**` delivery/authorization files; and
- the original 23 exact forbidden fixture/retired raw paths,
  `HivePoA/.distribution-publish-receipt.json`, `HivePoA/.nojekyll`, and the
  private Product Truth ledger v1, all frozen as 26 exact negative routes in
  the allowlist.

Seven legacy HivePoA routes remain as byte-identical, scriptless, CSP-bound
quarantine pages so old links fail safely. They expose no download, verification,
release, authorization, or tester-network action.

The source workflow and its local tests do not prove that the repository's Pages setting has been
switched from legacy branch publication to **GitHub Actions**. That setting and
the deployed artifact require a separate repository readback before anyone may
claim the allowlisted workflow is product-live.

## Source snapshot refresh

The public/private automatic source bridge is intentionally retired from this
presentation release. There is no scheduled private checkout, deploy-key use,
private-source executor, contents-write source publisher, or direct sync/deploy
handoff in this repository. The checked-in facts are a historical captured
source snapshot. Capture-time acquisition fields remain immutable; the separate
`latestRefreshObservation` records that automatic execution is not attested and
current operation is `UNKNOWN`. A future re-enable requires a separately
reviewed private producer and authority package that exports only a sanitized,
strictly bounded public snapshot. This repository neither configures nor claims
that producer.

Pages publication is recovery-driven and public-only. Main pushes, manual
dispatch, and a bounded schedule enter one non-cancelling lock. A run whose
event/workflow SHA is no longer exact current main performs no build or deploy;
it issues one fixed no-checkout redispatch at `main`. An admitted run no-ops only
when an exact successful Pages deployment, a versioned exact-SHA parity marker
bound to its run/attempt/artifact tuple, and a fresh live parity read all agree.
Otherwise it rebuilds and verifies the public artifact. A pending marker
invalidates older success before deploy, and final success is written only after
exact deployment and bounded live parity. GitHub branch movement has no atomic
cross-API compare-and-swap, so current main is rechecked before upload, before
deploy, and after parity; any mismatch fails closed and the newer push or
scheduled recovery must reconcile the stable tip. This is source policy, not
proof that a run, deployment, Pages setting, or public readback succeeded.

The browser acquires `hub-facts.json`, Product Truth, its evidence ledger, and
both Hive IDE evidence documents through one shared streaming primitive.
`Content-Length` is optional; when present it must be canonical, and it is
compared with received bytes only for an identity representation. For gzip or
Brotli, expected bytes and SHA-256 bind the decoded body rather than the encoded
header length. The reader rejects the first chunk that crosses its decoded-byte
ceiling, applies one eight-second fetch-and-body deadline, aborts and
best-effort-cancels every rejection without awaiting an unbounded cancel, then
performs fatal UTF-8 and strict JSON validation. Malformed or lying identity
lengths; early disconnects; stalls; BOMs; duplicate or NFC-colliding keys;
non-RFC8259 whitespace; unpaired surrogates; trailing content; invalid UTF-8;
empty bodies; and oversized decoded bodies fail closed. Snapshot retries are
scheduled independently of the first request settling.

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
node script/check-product-truth.mjs --self-test --require-git-binding
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
node script/verify-pages-artifact.mjs --self-test
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
