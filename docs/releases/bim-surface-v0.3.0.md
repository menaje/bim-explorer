---
type: release-notes
status: published-prerelease
authority:
  - bim-surface-v0.3.0-release
last_reviewed: 2026-08-15
---

# Federated BIM Surface v0.3.0

This experimental package prerelease adds the
`bim-explorer-federated-retained-overlay/0.1` extension to the host-neutral
`bim-explorer-bim-surface/0.2` runtime. The immutable v0.2.0 artifact remains
unchanged.

A `consumer-overlay` source can now receive a versioned `BEXOVL01` geometry
packet. The Surface validates the packet, digest, revision, sequence, identity,
bounds and memory limits before preparing CPU and GPU resources off-scene. One
synchronous commit switches geometry, visibility, Pick mapping and overlay
revision atomically. Rollback, cancellation, malformed or stale packets and
allocation failure preserve the current frame and revision.

Checkpointing records retained display state without rereading, parsing or
uploading native source ranges. Terminal disposal releases staged, retained and
base resources deterministically. These retained objects provide display and
pick identity only; they do not provide native source locators or mutation
authority.

The release bundle is qualified through two byte-identical package builds and
an offline clean install that imports only the tarball. The installed consumer
repeats packet encode/decode, prepare, atomic commit, checkpoint and cleanup.
The package contains one zero-runtime-dependency ESM entrypoint and grants no
Workspace, Canonical identity, source mutation, acceptance, publish or export
authority.

Actual Chrome and VS Code Webview conformance exists for the retained Surface
path. Viewer Core 0.1.3 compatibility was verified against one exact public
source commit; this release does not claim a published Viewer Core 0.1.3
artifact. It also does not publish a VSIX or registry package and does not claim
cross-platform physical GPU or production support.
