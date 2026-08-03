# Hive Ecosystem Pages hub

This repository is the canonical public GitHub Pages surface for the Hive
ecosystem. The root is a source-snapshot, non-authoritative map connecting:

- **Hive-AI** — local chat, RAG, Living Anatomy, and Mission Control concepts.
- **HivePoA** — the generated distribution, verification, IPFS, proof-of-access,
  and tester-network frontend under `HivePoA/`.

The root never proxies private chat, accepts credentials, auto-downloads a
package, or acts as release authority. Hive-AI metrics are identified as a
source snapshot. HivePoA release facts appear only after the existing pinned
Ed25519 verifier accepts the signed channel index embedded by the canonical
private `Dhenz14/HivePoA` build.

`HivePoA/` remains generated output. Publish it with the canonical HivePoA
workflow; do not hand-edit those mirrored bytes. The publisher intentionally
preserves the root hub, `404.html`, and `hub-assets/`.

The obsolete public `spknetworkpoa` repository is not a current source or
distribution channel.

Run the dependency-free hub contract before publishing:

```bash
node script/check-central-hub.mjs
node --check hub-assets/hub.js
```
