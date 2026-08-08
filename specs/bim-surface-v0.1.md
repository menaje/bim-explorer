# BIM Surface v0.1

Status: experimental release-candidate contract

License: Apache-2.0 for this specification. The reference implementation is
MPL-2.0.

## 1. Purpose

`bim-explorer-bim-surface/0.1` composes one immutable BIM source session, one
bounded 3D renderer host and one semantic explorer. It is a reusable surface,
not the BIM Explorer product shell: it does not own a DOM, file picker, network
client, account or application navigation.

## 2. Input

`open` accepts:

- a `bim-explorer-bim-source/0.2` snapshot;
- the exact session that owns the snapshot's bounded semantic and range reads;
- an optional Worker lease owned by the same source open;
- optional initial camera and range strategy;
- optional initial renderable selection.

The snapshot fingerprint MUST match `sha256:<64 lowercase hex>` and its revision
MUST equal `source-snapshot:<fingerprint>`. A surface instance opens at most one
source. A stale or malformed identity MUST fail closed.

## 3. Lifecycle

The states are `idle`, `opening`, `ready`, `disposing`, `disposed` and `failed`.
On successful open the implementation MUST:

1. mount the renderer through the Browser or `vscode-webview` host contract;
2. initialize the semantic explorer against the exact snapshot;
3. optionally select the first renderable entity;
4. return `bim-explorer-bim-surface-receipt/0.1`.

On dispose it MUST release the semantic explorer, renderer, range session and
optional Worker lease. Open failure after ownership transfer MUST release the
same resources. Repeated dispose returns `false`; disposed or failed instances
cannot open another source.

## 4. Authority

Every ready and disposed receipt exposes the following non-authority record:

```json
{
  "workspace": false,
  "canonicalEntityId": false,
  "sourceMutation": false,
  "revisionMutation": false,
  "acceptance": false,
  "publish": false,
  "export": false
}
```

The optional Spatial integration export is a provider contract only. It does
not include a Spatial bridge, Workspace capability or private package.

## 5. Package surface

The release-candidate ESM entrypoint exports the BIM source, mesh renderer,
semantic explorer, optional Spatial provider contract and `createBimSurface`.
Experimental E57/LAS/LAZ point renderer code is excluded from this entrypoint
and remains a separately composed reference surface.

The artifact MUST have zero runtime dependencies and include `LICENSE`,
`NOTICE`, `SOURCE_OFFER.md`, `README.md` and one generated runtime module.
Repository manifests remain private to prevent accidental publication; a
release stage may remove `private` only for an explicit qualification or
approved release.

## 6. Conformance

A package candidate conforms only when two independent packs are byte-identical
and a clean project installs the tarball offline, imports it by package name,
opens a generated IFC source, preserves its fingerprint/revision, initializes
selection and search, observes standalone Spatial availability, and releases
all source/renderer resources. This does not establish public registry
publication, an immutable public release asset, actual Spatial consumer
conformance or production support.
