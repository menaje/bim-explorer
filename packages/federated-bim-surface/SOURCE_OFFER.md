# Federated BIM Surface source availability

`@bim-explorer/federated-bim-surface@0.2.0` is a release-ready private
candidate under the Mozilla Public License 2.0. Its complete corresponding
source and deterministic package build instructions are available in this
public repository:

- repository: <https://github.com/menaje/bim-explorer>
- package source: `packages/federated-bim-surface`
- bundle generator: `scripts/build-federated-bim-surface.mjs`
- package qualification: `scripts/qualify-federated-bim-surface-package.mjs`
- expected immutable source tag: `bim-surface-v0.2.0`

The candidate tarball contains one generated, zero-runtime-dependency ESM
entrypoint. No Coni Spatial private source, Workspace capability or third-party
runtime package is embedded. The expected tag is not official until GitHub
publishes and verifies the immutable prerelease. The current release-ready
package bytes must first pass downstream exact-digest revalidation; until then
the tag, public package and production support claims remain unavailable.
