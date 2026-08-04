---
type: release-policy
status: accepted
authority:
  - community-release-channel
  - compatibility-and-migration
  - security-and-support
last_reviewed: 2026-08-04
---

# Community release

## Release channel

`v0.1.0` is the first account-free BIM Explorer Community release. Official
source, VSIX, SBOM, checksums, and provenance are published together on
<https://github.com/menaje/bim-explorer/releases>. The VSIX publisher is
`menaje`; a fork or locally rebuilt artifact is not an official update.

The release is a local-first, read-only exploration product. It does not
require a Coni Spatial account, installation, service, or telemetry endpoint.

## Supported flow

The admitted flow is:

1. select a regular local `.ifc` file of at most 64 MiB;
2. parse it in a dedicated Worker with exact `web-ifc@0.0.77`;
3. inspect the bounded source snapshot, 3D view, hierarchy, primitive
   properties, relations, search, section, measurement, and saved view;
4. close or replace the source and release Worker, model, cache, and GPU state.

The admitted format profile is IFC4 `ReferenceView_V1.2` for local read-only
semantic and extruded-geometry exploration. Unsupported entities remain
diagnostic or non-renderable without losing source identity.

## Explicitly unsupported

- native BIM authoring, model mutation, write, patch, or round-trip guarantees;
- IFC2X3 or IFC4.3 profile admission despite best-effort parser observations;
- RVT, DGN, NWD/NWC, point-cloud, glTF, 3D Tiles, or native SDK bridges;
- cloud upload, external model URL fetch, collaboration, or Workspace authority;
- native IDS validation, full BCF XSD conformance, or live bSDD availability;
- browser heap, native allocator, parser memory-safety, or physical GPU claims;
- paid support, warranty, SLA, or Coni Spatial verified delivery.

## Clean build and package

Use a clean checkout of the exact tag:

```bash
git clone --branch v0.1.0 --depth 1 \
  https://github.com/menaje/bim-explorer.git
cd bim-explorer
npm ci
npm run check
npm run release:bundle
```

The release command writes only ignored `dist/` artifacts. Running it twice
from the same commit and Node/npm versions must produce the same VSIX, source
archive, SPDX SBOM, release manifest, and checksums. CI repeats the check on
macOS and Linux. GitHub artifact attestations bind official release files to
the tag workflow and commit.

## Compatibility and migration

Public contracts use explicit schema/version identifiers. A reader must reject
an unsupported major protocol, schema, cache, or artifact version. Minor
versions may add optional fields but may not silently change identity,
coordinate, authority, or cleanup semantics.

Generated caches are disposable and fingerprint-scoped; they are not migrated
across incompatible versions. Original BIM sources are never rewritten.
Breaking contract changes require a new major contract identifier, fixture,
compatibility manifest, migration note, and release changelog entry.

## Security, privacy, and diagnostics

No selected source bytes, source path, credential, customer metadata, or cache
is included in a diagnostic by default. Public reports use synthetic input and
path-free receipts. Sensitive reports follow [`SECURITY.md`](../SECURITY.md).

The Community branch receives best-effort security fixes for the latest
release only. It has no SLA. Coni Spatial support and commercial delivery are
separate products and do not change the Community source license.
