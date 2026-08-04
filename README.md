# Hive Ecosystem Pages hub

This repository is the canonical public GitHub Pages surface for the Hive
ecosystem. The root is a cinematic, source-bound, non-authoritative atlas
connecting:

- **Hive-AI** — local chat, RAG, Living Anatomy, and Mission Control concepts.
- **HivePoA** — the generated distribution, verification, IPFS, proof-of-access,
  and tester-network frontend under `HivePoA/`.
- **NeuraChain, Hive IDE, Second Brain, and Compute Pool** — distinct organs in
  the shared system, with their public/private boundaries stated in the UI.

The public Living Anatomy galaxy renders all 640 neuron identities in stable
16-division / 64-family geometry. Its structure comes only from
`hub-assets/hub-facts.json`; animation never invents liveness. Aggregate Twitch
and PM-only counts are source facts, while gold status, evidence, blockers,
urgency, work lanes, missions, and runtime state remain on the authenticated
local map.

The root never proxies private chat, accepts credentials, auto-downloads a
package, or acts as release authority. Hive-AI metrics are identified as a
source snapshot. HivePoA release facts appear only after the existing pinned
Ed25519 verifier accepts the signed channel index embedded by the canonical
private `Dhenz14/HivePoA` build.

## Refresh the public galaxy

The snapshot compiler proves that its local Hive-AI ref is the live GitHub
`main`, freezes that exact commit, recompiles Living Anatomy without writing to
Hive-AI, validates the graph and compatibility contracts, verifies every source
manifest byte against the frozen commit, and atomically publishes only the
strict public allowlist:

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

The living-main publisher in `.github/workflows/sync-living-galaxy.yml` repeats
that exact source-bound build every five minutes and on manual dispatch. It uses
only this repository's short-lived `GITHUB_TOKEN`, can change only the public
snapshot, and leaves the last-good public bytes untouched on any failure. It is
scheduled convergence—not a real-time guarantee—so each rendered snapshot
always names the exact Hive-AI commit it represents. The full race, retry, and
future seconds-level dispatch design is documented in
`docs/PUBLIC_GALAXY_SYNC.md`.

`HivePoA/` remains generated output. Publish it with the canonical HivePoA
workflow; do not hand-edit those mirrored bytes. The publisher intentionally
preserves the root hub, `404.html`, and `hub-assets/`.

The obsolete public `spknetworkpoa` repository is not a current source or
distribution channel.

Run the dependency-free hub contract before publishing:

```bash
node script/check-central-hub.mjs
node script/check-galaxy-core.mjs
node script/check-http-surface.mjs
node script/check-signed-release.mjs
node --check hub-assets/hub.js
node --check hub-assets/galaxy-core.mjs
node --check script/sync-galaxy-snapshot.mjs
```

After `main` deploys, prove that public bytes equal the landed checkout:

```bash
node script/check-live-parity.mjs --origin https://dhenz14.github.io
```

The pull-request workflow runs the dependency-free static checks. The living
publisher independently proves current public Hive-AI `main` before changing
the allowlisted snapshot; neither workflow receives private runtime data.
