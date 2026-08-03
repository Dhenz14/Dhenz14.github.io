# HivePoA Storage Preview — distribution front door (generated)

Generated, non-authoritative frontend mirror from private HivePoA source commit `f72189a7d29525f223e7b9f4488494eec3d812c3`.
The signed tester package was built from ancestor commit `71a29b21c8cd62c503582aefe76c7b303aa61708`.
It is not a source repository, package channel, signed bootstrap handoff, or storage-release
authority. Signed IPFS metadata is the trust root; GitHub Releases may mirror the exact
bytes but never supplies trust.

Routes served: /, /download/, /verify/, /releases/, /get-started/, /tester-network/. `/distribution/` redirects to `/`.

Regenerate and publish with `npm run build:distribution-static` then
`npm run publish:distribution-mirror -- --target <mirror>/HivePoA`. Do not hand-copy files
into this directory: the publisher asserts that every generated file came from one build.
