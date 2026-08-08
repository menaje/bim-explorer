# LAS/LAZ Worker probe

Qualification-only Browser surface for the cache-only public LAZ sample.
It runs exact `laz-perf@0.0.6` in a disposable classic Web Worker and records
bounded decode, cooperative checkpoint cancellation, forced cancellation
during synchronous WASM work, timeout termination, malformed payload
isolation and fresh-Worker recovery.

The sample and decoder are served only from the loopback qualification server.
Neither is added to a product bundle or Community release. The probe does not
admit LAS/LAZ, establish CRS authority or provide a point renderer.

The pinned Emscripten glue uses dynamic function generation, so this loopback
surface alone permits `unsafe-eval`. Product CSP and product runtime are not
changed by this probe.
