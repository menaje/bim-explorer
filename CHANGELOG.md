# Changelog

## Unreleased

- add an experimental multi-IFC federation contract with source-scoped
  identity, visibility, partial/stale state, explicit Float64 alignment,
  incremental refresh, cross-source selection and saved views;
- add a bounded glTF 2.0/GLB read-only reference source with Khronos Validator,
  generic renderer, Browser WebGL2 and federation admission evidence;
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
