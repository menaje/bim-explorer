---
type: release-notes
status: accepted
authority:
  - bim-surface-v0.1.0
last_reviewed: 2026-08-09
---

# BIM Surface v0.1.0

This is the first experimental, host-neutral BIM Surface package release from
BIM Explorer.

## Included

- one zero-runtime-dependency ESM entrypoint;
- `BimModelSource` creation and exact source identity;
- bounded read-only mesh renderer host lifecycle;
- semantic tree, properties, relations, search and selection lifecycle;
- optional authority-free Spatial provider composition;
- MPL-2.0 license, exact source offer, SPDX, SHA-256 checksums,
  cross-platform reproducibility and GitHub attestations.

## Install the exact GitHub asset

```bash
npm install \
  https://github.com/menaje/bim-explorer/releases/download/bim-surface-v0.1.0/bim-explorer-bim-surface-0.1.0.tgz
```

The repository manifest remains `private: true`; this release does not publish
the package to npm or another registry.

## Important limits

The package is experimental and read-only. It does not provide native BIM
authoring, write or round-trip, stable production support, Coni Spatial
Workspace authority, Canonical Entity IDs, accept, publish or export authority.
The actual Coni Spatial consumer conformance remains a separate admission Gate.
Point-cloud and other experimental reference-format runtimes are outside this
entrypoint.

## Verify

```bash
gh release verify bim-surface-v0.1.0 \
  --repo menaje/bim-explorer
gh release verify-asset bim-surface-v0.1.0 \
  bim-explorer-bim-surface-0.1.0.tgz \
  --repo menaje/bim-explorer
gh attestation verify \
  --repo menaje/bim-explorer \
  bim-explorer-bim-surface-0.1.0.tgz
shasum -a 256 -c SHA256SUMS
```

See `SOURCE_OFFER.md` and `release-manifest.json` for the exact source,
qualification and authority boundary.
