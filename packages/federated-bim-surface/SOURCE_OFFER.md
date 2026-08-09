# Federated BIM Surface source availability

`@bim-explorer/federated-bim-surface@0.2.0` is currently a private release
candidate under the Mozilla Public License 2.0. Its complete corresponding
source and deterministic package build instructions are available in this
repository:

- repository: <https://github.com/menaje/bim-explorer>
- package source: `packages/federated-bim-surface`
- bundle generator: `scripts/build-federated-bim-surface.mjs`
- package qualification: `scripts/qualify-federated-bim-surface-package.mjs`

The candidate tarball contains one generated, zero-runtime-dependency ESM
entrypoint. No Coni Spatial private source, Workspace capability or third-party
runtime package is embedded. A future public release must replace this
candidate notice with an exact immutable source tag after its consumer and
release Gates pass.
