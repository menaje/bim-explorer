# Federated BIM Surface source availability

`@bim-explorer/federated-bim-surface@0.3.0` is an experimental package
candidate under the Mozilla Public License 2.0. Its complete corresponding
source and deterministic package build instructions are available in this
public repository:

- repository: <https://github.com/menaje/bim-explorer>
- package source: `packages/federated-bim-surface`
- bundle generator: `scripts/build-federated-bim-surface-v0.3.mjs`
- package qualification:
  `scripts/qualify-federated-bim-surface-v0.3-package.mjs`
- expected immutable source tag: `bim-surface-v0.3.0`

The tarball contains one generated zero-runtime-dependency ESM entrypoint. It
implements the read-only federated Surface v0.2 contract and the additive
retained-overlay v0.1 contract. No Workspace capability, source mutation,
acceptance, publish or export authority is embedded. The package remains an
experimental candidate until the tag workflow publishes and verifies its
immutable GitHub prerelease assets.
