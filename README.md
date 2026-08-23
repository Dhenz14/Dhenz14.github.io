# Hive Ecosystem Pages hub

This repository is the canonical public GitHub Pages surface for the Hive
ecosystem. The root is a cinematic, source-bound, non-authoritative atlas
connecting:

- **Hive-AI** — local chat, RAG, Living Anatomy, and Mission Control concepts.
- **HivePoA** — the generated distribution, verification, IPFS, proof-of-access,
  and tester-network frontend under `HivePoA/`.
- **NeuraChain, Hive IDE, Second Brain, and Compute Pool** — distinct organs in
  the shared system, with their public/private boundaries stated in the UI.

The public Living Anatomy galaxy renders all 640 neuron identities in the exact
authored 16-division / 64-family coordinates projected by Hive-AI. The shared
`hive.galaxy.renderer-contract.v1` contract binds those coordinates to the graph
hash and source commit inside `hub-assets/hub-facts.json`; there is no synthetic
geometry fallback. Aggregate Twitch and PM-only counts are source facts, while
gold status, evidence, blockers, urgency, work lanes, missions, and runtime
state remain on the authenticated local map.

Pages retains one progressively enhanced Canvas2D renderer. It shares geometry,
camera, event, status-language, and fallback semantics with the local renderer
without copying the local Three.js bundle. Full-atlas and Director interactions
are zero-effect. Local links are explicit navigation and never probe or start a
loopback service.

The public Mission Control flightdeck presents the full command story—See,
Understand, Select, Dispatch, Verify, Watch—against an echo of that same atlas.
It is keyboard-operable, projector-scaled, reduced-motion safe, and explicitly
zero-effect: it can explain and hand off to the local operator body, but cannot
dispatch work or manufacture a live pulse. The Watch state turns into an
absorbed-source event only when the validated snapshot's exact Hive-AI commit
actually changes.

The root never proxies private chat, accepts credentials, or auto-downloads a
package. Hive-AI metrics are identified as a source snapshot. HivePoA release
facts appear only after the existing pinned Ed25519 verifier accepts the signed
channel index embedded by the canonical private `Dhenz14/HivePoA` build.

Hive IDE has a separate central download door at `#ide-download`. Its
same-origin `downloads/hive-ide/latest.json` feed is fail-closed and points to
one immutable GitHub Release in this repository. The page validates exact
fields, source commit, artifact hash and size, channel truth, and same-tag
manifest/installer URLs before enabling links. An unsigned tester release is
never described as publisher-authenticated or stable, and embedding the
internal HivePoA sidecar never grants public HivePoA reward-network authority.
The same validated immutable release also unlocks its bundled `START-HERE.txt`,
while the page itself presents the five-step no-terminal path from download to
the first Brain question and an in-app `Get help` recovery route.

## Refresh the public galaxy

The snapshot compiler proves that its local Hive-AI ref is the live GitHub
`main`, freezes that exact commit, recompiles Living Anatomy without writing to
Hive-AI, validates the graph and compatibility contracts, verifies every source
manifest and tracked evidence byte against the frozen commit, requires the
publisher-only ratification inputs, checks remote `main` again after compilation,
refuses a mismatched or dirty checkout, and rejects shallow history that cannot
prove canonical truth-input provenance.
It atomically publishes only the strict public allowlist:

```bash
node script/sync-galaxy-snapshot.mjs \
  --hive-ai-repo /path/to/clean/isolated/Hive-AI \
  --hive-ai-ref HEAD

node script/sync-galaxy-snapshot.mjs --check \
  --hive-ai-repo /path/to/clean/isolated/Hive-AI \
  --hive-ai-ref HEAD
```

`--check` exits nonzero if the checked-in projection is stale or the local ref
is not current remote `main`. The page fetches this one snapshot with
`cache: no-store`, so all displayed source metrics update together. An open
page rechecks the same-origin snapshot every 60 seconds while visible and keeps
the last validated snapshot if a refresh fails.

The living-main publisher in `.github/workflows/sync-living-galaxy.yml` attempts
that exact source-bound build every five minutes and on manual dispatch. The
snapshot records automatic publication as configured only while the
`LIVING_GALAXY_CLOUD_SYNC_ENABLED` repository variable is true; a manual run
with that switch off remains truthfully labeled a manual snapshot. Private
source access is intentionally limited to the `HIVE_AI_READ_DEPLOY_KEY` Actions
secret: a read-only deploy key installed only on Hive-AI. If it is absent, the
workflow succeeds fail-closed, retains the last-good source snapshot, and marks
the bridge inactive instead of pretending to refresh. The compiler job is
read-only and has no Pages publication credential; it uploads one bounded JSON
candidate. A separate publisher job starts from fresh Pages `main`, never runs
Hive-AI code, validates that candidate with the trusted current-main tests, and
alone receives the short-lived write token. This is scheduled convergence—not
a stable-main or real-time assumption—so each rendered snapshot always names
the exact Hive-AI commit it represents. The full race, retry, credential, and
future seconds-level dispatch design is documented in
`docs/PUBLIC_GALAXY_SYNC.md`.

Cloud runs remain explicitly gated by the `LIVING_GALAXY_CLOUD_SYNC_ENABLED`
repository variable. Until a dedicated read-only cloud key is authorized, an
authenticated operator can run the same compiler in local publisher mode with
`GALAXY_AUTOMATIC_BRIDGE=true GALAXY_BRIDGE_MODE=local`. The public badge labels
an exact snapshot as verified only after the browser validates its strict
schema, hash, and source bindings. The capture timestamp remains visible as
provenance and is still classified as aged after 15 minutes and historical
after one hour in the detailed status text; it is not presented as publisher
or local-runtime health. A failed same-origin refresh still changes the badge
to `Last-good snapshot`, and unavailable or older truth never becomes zeroes.

`HivePoA/` remains generated output. Publish it with the canonical HivePoA
workflow; do not hand-edit those mirrored bytes. The publisher intentionally
preserves the root hub, `404.html`, and `hub-assets/`.

The obsolete public `spknetworkpoa` repository is not a current source or
distribution channel.

Run the dependency-free hub contract before publishing:

```bash
node script/check-central-hub.mjs
node script/check-galaxy-bridge.mjs
node script/check-galaxy-core.mjs
node script/check-ide-release.mjs --self-test
node script/check-http-surface.mjs
node script/check-signed-release.mjs
node --check hub-assets/hub.js
node --check hub-assets/galaxy-core.mjs
node --check hub-assets/ide-release-core.mjs
node --check script/sync-galaxy-snapshot.mjs
```

After an IDE release bundle is mirrored into `downloads/hive-ide/`, also run:

```bash
node script/check-ide-release.mjs
```

After `main` deploys, prove that public bytes equal the landed checkout:

```bash
node script/check-live-parity.mjs --origin https://dhenz14.github.io
```

The pull-request workflow runs the dependency-free static checks. The living
publisher independently proves current public Hive-AI `main` before changing
the allowlisted snapshot; neither workflow receives private runtime data.
