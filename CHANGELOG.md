# Changelog

## Unreleased

- allow cache-only public test fixtures without requiring sample redistribution,
  while retaining implementation redistribution as a product admission Gate;
- pin and probe a public CC0 E57 sample on demand without tracking or releasing
  the binary; validate its header, all 116 page CRCs and 7,680-point XML profile;
- open bounded single-scan Cartesian and spherical E57 profiles through the
  Browser product, staged VS Code and clean-installed VSIX with exact point
  projection and cleanup;
- qualify cache-only E57 Float64/ScaledInteger, validity, indexless and
  spherical profiles, then decode a five-scan 1,213,990-point sample with
  structured indexes and independent local-pose/RGB parity;
- open that five-scan E57 through the Browser product, staged VS Code and a
  clean-installed VSIX with an explicit 32 MiB/2,000,000-point envelope,
  identical pose-applied projection and deterministic cleanup;
- download a paired public LAS 1.2/LAZ fixture into an ignored cache and prove
  exact 10,201-point record parity, Float64 coordinates and RGB with a pinned
  qualification-only `laz-perf@0.0.6` decoder;
- isolate that LAZ decoder in an actual Chrome Worker with bounded WASM heap,
  checkpoint and forced in-call cancellation, timeout, malformed payload
  rejection and fresh-Worker recovery without opening product support;
- add a source-neutral Float64-origin point range and bounded headless/WebGL2
  `POINTS` renderer, qualifying 10,201 LAS/LAZ-parity points and exact cleanup
  in Chrome without admitting a point-cloud format;
- add a 32-bit WebGL2 point pick pass and source-revision/root-range-digest scoped
  derived `point:n` selection, then qualify Browser, staged VS Code and a
  clean-installed VSIX without claiming source semantics, CRS or source-native
  hierarchy;
- derive deterministic octree leaf-page chunks and bounded coarse-to-full point
  LOD from an exact root range, preserve root-range identity through index maps,
  and qualify transitions plus cleanup in Browser, staged VS Code and a
  clean-installed VSIX;
- add a bounded LAS/LAZ product source and one-shot decoder Worker, then open
  both paired files through the actual Browser local-file product with exact
  point-range/visual parity and deterministic source/Worker/CPU/GPU cleanup;
- associate bounded LAS/LAZ sources with the read-only VS Code Custom Editor,
  package a strict-CSP LAZ runtime in the VSIX, and reproduce the same point
  projection and cleanup in staged and clean-installed VS Code 1.131.0;
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
- keep E57 and LAS/LAZ coordinate/format admission, plus 3D Tiles and RVT/DGN,
  behind fail-closed capability Gates.

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
