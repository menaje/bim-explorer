# BIM reference anchor

Federated 3D pick을 exact source revision, source-native identity와
`source-local` hit에 묶는 authority-free 내부 draft입니다.

- IFC와 glTF/GLB identity를 source slot 사이에서 합치지 않습니다.
- screen coordinate나 composite Render/Pick ID를 장기 anchor identity로
  저장하지 않습니다.
- source fingerprint/revision, native identity/occurrence path, alignment 또는
  renderer projection이 달라지면 stale로 판정합니다.
- receipt는 32 KiB, occurrence path는 64개로 제한합니다.
- Workspace, Canonical Entity ID, mutation, acceptance, publish와 export
  authority는 모두 `false`입니다.

`createBimReferenceAnchorFromFederatedPick()`은 renderer pick과 federation
projection의 namespaced identity를 확인하지만, 현재 renderer가 제공하지 않는
표면 normal이나 triangle locator를 합성하지 않습니다. 호출자는 검증한
`sourceLocalHit`을 제공해야 하며, 이를 제공할 수 없는 backend는 object
selection만 유지하고 anchor를 unsupported로 처리해야 합니다.

공개 package나 Spatial constraint API가 아니며 계약은
[`bim-explorer-reference-anchor/0.1`](../../specs/bim-reference-anchor-v0.1.md)
draft를 따릅니다.
