---
type: specification
status: draft
authority:
  - semantic-exploration-state
  - bounded-tree-search-relation-query
  - tree-property-3d-selection-sync
last_reviewed: 2026-08-04
---

# BIM semantic explorer v0.1

## 상태와 범위

`bim-explorer-bim-semantic-explorer/0.1`은 immutable BIM source snapshot을
tree, search, property, relation과 3D selection 상태로 투영하는 내부
read-only draft입니다. DOM, IFC parser, renderer resource와 Spatial
authority를 소유하지 않습니다.

## Source query

모든 query는 정확한 `protocolVersion`, `sessionId`, `sourceId`,
`revisionId`, `snapshotId`, `layerId`를 포함합니다. 결과 schema는
`bim-explorer-bim-source-semantic-query-result/0.1`입니다.

- `queryTree`: parent의 direct child를 Express ID 순으로 반환합니다.
- `searchEntities`: GlobalId, name, IFC class, property set, quantity,
  material, classification, type, container를 검색합니다.
- `queryRelations`: decomposition, spatial containment, type/occurrence,
  property set, quantity, material과 classification을 반환합니다.

limit은 1..100이며 continuation cursor는 query와 source revision에
결합됩니다. 다른 query나 revision의 cursor는 fail closed로 거부합니다.
각 page는 `total`, `returned`, `remaining`, `hasMore`, `nextCursor`를
제공해 omission을 숨기지 않습니다.

## Explorer state

Explorer는 다음 aggregate bound를 생성 시 고정합니다.

- 최대 loaded tree item
- 최대 DOM row projection
- 최대 누적 search result
- 최대 relation page
- tree/search page size

selection은 tree, search, relation 또는
`bim-explorer-bim-renderer-3d-pick-receipt/0.1`에서 시작할 수 있습니다.
모든 selection과 inspector에는 동일 source fingerprint와 revision이
유지됩니다. stale pick이나 tree/entity identity 불일치는 거부합니다.

visibility state는 search result 또는 selection의 Render ID만 반환하며
renderer를 직접 호출하지 않습니다. saved view
`bim-explorer-bim-semantic-saved-view/0.1`은 source fingerprint,
revision, selected identity, search, visibility와 camera를 source-local
storage key에 저장합니다. 다른 revision에서는 복원하지 않습니다.

## 정보 손실 표시

- property set value가 없으면 `lossy: property-set-name-only`
- source가 제공하지 않는 host/void/fill과 connection은 `opaque`
- relation page, search aggregate나 DOM bound 밖은 `omitted`

이 상태를 빈 panel이나 완전한 결과로 표현하지 않습니다.

## 현재 보류

- public representative model의 semantic DOM/search scale
- deferred property-value payload
- host/void/fill과 connection의 broader graph
- public representative Browser/VS Code product scale
- Viewer Core public conformance와 Spatial handoff
