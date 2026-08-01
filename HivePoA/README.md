# HivePoA Storage Preview — distribution front door (generated)

Generated, non-authoritative frontend mirror from private HivePoA source commit `99c1343e4e7b67cbb64dcef796e1c4e91eead3b8`.
It is not a source repository, package channel, signed bootstrap handoff, or storage-release
authority. Tester packages and the package-bound storage-control web interface remain
signed-IPFS-only.

Routes served: /, /download/, /verify/, /releases/, /get-started/. `/distribution/` redirects to `/`.

Regenerate and publish with `npm run build:distribution-static` then
`npm run publish:distribution-mirror -- --target <mirror>/HivePoA`. Do not hand-copy files
into this directory: the publisher asserts that every generated file came from one build.
