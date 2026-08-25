# Public hub publication scope

## Supported claim

```text
PUBLIC_HUB_R8_PUBLICATION: COMPLETE_SUPPORTED
```

This claim covers only the reviewed 30-member static GitHub Pages surface published at
`https://dhenz14.github.io/`, bound to the landed source cut, with private material
excluded and non-live systems represented as HOLD or WAIT.

The static artifact also contains a fixed, visible, user-initiated navigation to
`http://127.0.0.1:5002/constellation/body?presentation=1`. That doorway is part of
the supported HTML surface; it is not a runtime probe, liveness claim, automatic
request, context transfer, or assertion that Local Body is running on a visitor's
computer.

## Explicitly out of scope

These are not established by the Pages origin and must not ride the publication claim:

- Local Body runtime on `:5002`
- Operator Body runtime on `:5003`
- Chat availability
- Hive IDE package/runtime/product behavior
- Fable Three.js runtime correctness or deployment (the public doorway does not attest either)
- End-to-end request execution across live bodies
- Whole-system product-live behavior

## Durable receipt

`docs/publication-receipts/r8-ecd8ac42.v1.json` preserves the R8 lander receipt,
including artifact digests, membership, deployment identity, parity status, the
repair deploy run, the hosted verify run, and the later steady-state no-op run
`32815317619`.
