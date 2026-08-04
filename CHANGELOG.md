# Changelog

## Unreleased

- add an experimental multi-IFC federation contract with source-scoped
  identity, visibility, partial/stale state, explicit Float64 alignment,
  incremental refresh, cross-source selection and saved views;
- add fail-closed capability Gates for glTF/GLB, LAS/LAZ/E57, 3D Tiles and
  RVT/DGN without claiming codec or SDK support.

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
