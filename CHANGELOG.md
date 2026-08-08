# Changelog

## Unreleased

- allow cache-only public test fixtures without requiring sample redistribution,
  while retaining implementation redistribution as a product admission Gate;
- pin and probe a public CC0 E57 sample on demand without tracking or releasing
  the binary; validate its header, all 116 page CRCs and 7,680-point XML profile;
- download a paired public LAS 1.2/LAZ fixture into an ignored cache and prove
  exact 10,201-point record parity, Float64 coordinates and RGB with a pinned
  qualification-only `laz-perf@0.0.6` decoder;
- isolate that LAZ decoder in an actual Chrome Worker with bounded WASM heap,
  checkpoint and forced in-call cancellation, timeout, malformed payload
  rejection and fresh-Worker recovery without opening product support;
- add an experimental multi-IFC federation contract with source-scoped
  identity, visibility, partial/stale state, explicit Float64 alignment,
  incremental refresh, cross-source selection and saved views;
- add a bounded glTF 2.0/GLB read-only reference source with Khronos Validator,
  generic renderer, Browser WebGL2 and federation admission evidence;
- open bounded local glTF/GLB reference meshes in the Browser product, staged
  VS Code Custom Editor and clean-installed VSIX with source-native identity,
  path-free bridging and deterministic Worker/GPU cleanup;
- reproduce those three glTF product surfaces on macOS arm64 and Linux x64
  CI with exact VS Code 1.131.0 and fail-closed platform evidence;
- qualify a pinned 42.98MB CC BY 4.0 GLB as product-scale reference geometry
  with the official Validator, bounded headless rendering, actual Chrome
  SwiftShader WebGL2 first frame and deterministic resource cleanup;
- open that product-scale GLB through the actual Browser local-file product
  path with bounded rendering, source-native search/pick and close cleanup;
- reproduce the same product-scale projection in the staged VS Code Custom
  Editor and a clean-installed VSIX without bundling the public fixture;
- compose two generated IFC sources and the pinned product-scale GLB in one
  source-scoped federation projection, qualifying bounded headless/Chrome
  WebGL2 first frame, aggregate memory and deterministic cleanup;
- compare that product-scale federation projection across macOS arm64 and
  Linux x64 CI through a committed portable matrix;
- add a privacy-safe reference-format intake/triage contract and public issue
  form without promoting any held codec, SDK or authority Gate;
- keep LAS/LAZ/E57, 3D Tiles and RVT/DGN behind fail-closed codec/SDK Gates.

## 0.1.0 - 2026-08-04

First Community release.

- account-free, local-only Browser and VS Code IFC exploration;
- bounded IFC4 `ReferenceView_V1.2` source, WebGL2 rendering, model tree,
  properties, relations, search, section, measurement, and saved views;
- bounded BCF XML 3.0, IDS 1.0 result, and bSDD reference exploration;
- optional authority-free Coni Spatial handoff contract;
- MPL-2.0 implementation, Apache-2.0 public specifications, exact dependency
  notices, SPDX SBOM, reproducible VSIX/source bundle, and release provenance.

The supported profile remains experimental and read-only. Native authoring,
write/round-trip, IFC2X3/IFC4.3 admission, RVT/DGN bridges, and production
support guarantees are not part of this release.
