# HivePoA tester network v1

This mode is for functional storage-proof testing. It uses real local Kubo
blocks, two-of-three irreversible Hive RPC agreement, worker-owned Ed25519
proofs, and durable test-credit accounting. It never asks for a Hive posting
key, never broadcasts a Hive transaction, and never creates an `anchor_tx_id`.

Each accepted proof awards exactly **100 test credits to its proving worker**.
The second worker is the independent verifier/revocation control and earns zero
unless it separately submits an accepted proof. Test credits are
non-transferable, non-redeemable, test-only, and have no monetary value.

## Functional boundary

- In scope now: multiple enrolled workers, multi-block DAG challenges,
  independent verifier reads, restart-safe receipts, idempotent retries,
  revocation, and visible test-credit balances.
- Not required to exercise this mode: Windows signing, SmartScreen reputation,
  a Hive posting key, or a Hive transaction. The package, signed metadata,
  SHA-256, CID, IPFS source, and exact GitHub byte mirror are still mandatory.
- A status response means the mode booted. A worker is `testerReady` only after
  that worker has one accepted proof receipt.

## 1. Prove Hive read connectivity

```bash
npm run probe:storage-poa-tester-hive
```

Success prints `STORAGE_POA_TESTER_HIVE_QUORUM_OK`, `readOnly: true`, and
`transactionBroadcast: false`. This is a connectivity/consensus probe, not a
substitute for a completed round.

## 2. Collect worker enrollment responses

On each opted-in desktop worker, use its authenticated local API:

```text
POST /api/storage-poa/worker/enrollment-request
X-SPK-Local-Token: <that desktop's local token>
```

Save each exact JSON response as an owner-only file. Do not move worker private
keys to the coordinator; the response contains only the public key and a signed
proof of possession.

## 3. Create one multi-worker coordinator custody directory

```bash
npm run operator:bootstrap-storage-poa-runtime -- \
  --mode tester-network \
  --enrollment-response /absolute/path/worker-01.json \
  --additional-enrollment-responses /absolute/path/worker-02.json \
  --output-dir /absolute/new/path/storage-poa-tester-runtime \
  --hive-rpc-endpoints https://api.hive.blog,https://api.deathwing.me,https://hive-api.arcange.eu \
  --issuer-ipfs-api http://127.0.0.1:5001 \
  --verifier-ipfs-api http://127.0.0.1:5101
```

The command refuses an existing output directory, duplicate workers, redirected
inputs, unsafe files, and more than 64 workers. Its manifest lists every
`nodeInstanceId`, worker key ID, and per-worker Forge enrollment body. The
runtime environment intentionally contains no Hive posting account.

## 4. Enroll and start

As the existing trust-root administrator, submit every file listed under
`forgeEnrollmentBodies` to that worker's exact Forge enrollment endpoint with
the normal scoped second factor. Then load `storage-poa-runtime.env` only into
the coordinator process that owns the custody directory and start the two
distinct local Kubo APIs named in the environment.

On each desktop worker, keep storage contribution enabled and configure the
coordinator URL, Agent API key, and the manifest's exact registry authority key
ID/public key. Enable `testingGradeStoragePoaEnabled`; the same worker loop is
used for tester-network mode.

## 5. Exercise a round and read credits

Pin a real multi-block root in the worker's local Kubo, then call:

```text
POST /api/storage-poa/worker/test-round
X-SPK-Local-Token: <local token>
Content-Type: application/json

{"rootCid":"<pinned multi-block root CID>"}
```

The worker polls automatically. The coordinator first signs a no-transaction
anchor receipt, waits for the committed future Hive block to become irreversible
on two RPCs, issues the challenge, independently fetches the selected blocks,
and atomically stores the acceptance plus the 100-credit award.

Read the durable balance with:

```text
GET /api/storage-poa/worker/credits?limit=50
X-SPK-Local-Token: <local token>
```

Retrying the same proof must return the same acceptance and leave the balance
unchanged. Restart the coordinator, both Kubo processes, and each worker; the
receipt and balance must remain. Revoking a worker key must deny new challenge
work while preserving read-only visibility of its prior credits.

## Acceptance checklist

- Two different node instance IDs and worker public keys are in one signed registry.
- The tested root manifest contains more than one block.
- Worker 1 receives one acceptance with `anchorTxId: null` and reaches exactly
  100 credits from one accepted proof.
- Worker 2 independently holds/verifies the multi-block root, remains at zero
  credits, and serves as the revocation control.
- Replaying Worker 1's exact proof adds zero credits.
- Restart preserves round receipts, pins, worker keys, and balances.
- Revocation blocks new proofs and does not hide historical credits.
- No HIVE/HBD transfer, posting key, transaction ID, or broadcast call appears.
- Stop the task-scoped processes and remove only explicitly disposable test data.
