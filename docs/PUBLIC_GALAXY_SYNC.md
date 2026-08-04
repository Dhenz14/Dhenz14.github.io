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

## Event-driven activation design

The safe automatic path is PR-gated:

1. Hive-AI `main` lands and completes its private truth/declassification gate.
2. A narrowly scoped GitHub App sends a revision-bound dispatch containing only
   the source commit—not graph data or credentials.
3. An isolated publisher checks out that exact Hive-AI commit and this Pages
   repository, runs the snapshot generator, then runs both contracts.
4. The publisher opens or updates one idempotent Pages pull request containing
   only the allowlisted snapshot and any deliberate presentation changes.
5. A human reviews and merges. GitHub Pages remains sourced from `main`.
6. A post-deploy probe compares the public snapshot hash and source commit to
   the landed Pages bytes. Failure retains the last known-good page and alerts;
   it never publishes partial or invented state.

Required activation authority is intentionally absent today: create a GitHub
App with read-only Hive-AI contents and pull-request-only Pages permissions,
install it on exactly those two repositories, restore working Actions billing,
and protect Pages `main` with the static contract as a required check. Do not
reuse a broad personal token, auto-merge the generated PR, or turn Pages into a
private runtime proxy.

## Local verification

```bash
node script/sync-galaxy-snapshot.mjs --check \
  --hive-ai-repo /home/theyc/src/Hive-AI \
  --hive-ai-ref origin/main
node script/check-central-hub.mjs
node script/check-http-surface.mjs
node script/check-signed-release.mjs
node --check hub-assets/hub.js
node --check script/sync-galaxy-snapshot.mjs
node script/check-live-parity.mjs --origin https://dhenz14.github.io
```

Run the live-parity command only after the reviewed Pages commit has deployed;
it compares the public bytes of the hub, snapshot, code, and root discovery
assets against the landed checkout.
