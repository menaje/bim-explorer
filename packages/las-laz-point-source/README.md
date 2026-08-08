# `@bim-explorer/las-laz-point-source`

Experimental, read-only LAS/LAZ product-source projection for BIM Explorer.
It accepts a bounded LAS 1.0–1.3 point-format 2 or 3 source, validates its
header and LASzip VLR identity, and derives one source-neutral
`BEXPTS01` Float64-origin/relative-Float32/RGBA8 point range.

LAZ decompression is supplied by exact `laz-perf@0.0.6` inside an isolated
product Worker. Browser serves the generated strict-CSP runtime directly;
VS Code loads the point Worker, adapted Emscripten glue and original WASM as
bounded extension resources and injects `blob:` capabilities without enabling
`unsafe-eval`. The source has no BIM semantic authority, native write or
round-trip authority. Coordinates remain `unqualified`: this package does not
infer a CRS or datum from file metadata and does not establish surveyed
accuracy. This source package itself does not declare point identity. The
product renderer may derive `point:n` from the exact projected range order and
pick it only within the matching source revision and range digest; that is not LAS/LAZ source-record
or semantic authority. LOD streaming remains outside this profile.

Default bounds are 8 MiB source bytes, 500,000 points, 24 MiB decoded point
records and one 8 MiB derived point range. Callers own and must clear source
and returned range buffers after transfer or renderer upload.
