# Source availability

BIM Explorer Community executable releases are accompanied by the complete
corresponding source used to build them.

## BIM Explorer v0.1.0

- source repository:
  <https://github.com/menaje/bim-explorer>
- exact release source:
  <https://github.com/menaje/bim-explorer/tree/v0.1.0>
- build instructions:
  [`docs/community-release.md`](docs/community-release.md)
- license: Mozilla Public License 2.0

The VS Code VSIX contains unmodified `web-ifc@0.0.77` JavaScript and WebAssembly.
Its exact corresponding source is:

- npm package: `web-ifc@0.0.77`
- npm source commit:
  <https://github.com/ThatOpen/engine_web-ifc/tree/f26c4beef0a668ebdb180d2b95a94097a1e21cef>
- license: Mozilla Public License 2.0
- local modifications: none

The exact package integrity and bundled file digests are recorded in the
release SBOM and `THIRD_PARTY_NOTICES.md`. The release page publishes the VSIX,
SBOM, source archive, checksums, and build provenance together.

For a copy of the corresponding source without network access, open a GitHub
issue requesting the `v0.1.0` source archive. Only reasonable media and delivery
costs, if any, will be charged.

## Unpublished development VSIX candidate

The current development candidate incorporates the following exact MPL-2.0
package sources, without repository-side edits to their upstream source files,
into a generated BIM Explorer product adapter runtime:

- `@menaje/viewer-core@0.1.2`
- `@menaje/viewer-render-protocol@0.1.2`
- immutable source and release assets:
  <https://github.com/menaje/dwg-viewer/releases/tag/viewer-core-v0.1.2>

The BIM Explorer adapter source is in
[`packages/viewer-core-consumer`](packages/viewer-core-consumer). Run
`npm run build:viewer-core-product` from the exact BIM Explorer source revision
to reproduce the generated executable transformation. The locally qualified
VSIX includes the exact upstream package manifests, LICENSE and NOTICE files.
It has not been published to the VS Code Marketplace or Open VSX, and this
section does not alter the immutable v0.1.0 release.
