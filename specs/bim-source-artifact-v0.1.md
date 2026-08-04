---
type: specification
status: draft
authority:
  - internal-bim-source-artifact
  - geometry-range-encoding
  - source-local-identity
last_reviewed: 2026-08-04
---

# BIM source artifact v0.1

## 상태와 범위

`bim-explorer-bim-source-artifact/0.1`은 format adapter와 BIM Explorer
`BimModelSource` 사이의 내부 read-only draft입니다. 공용 Viewer Core
protocol이나 production IFC 지원 profile이 아닙니다.

source artifact는 adapter engine object나 전체 IFC object graph가 아니라
다음의 bounded projection만 전달합니다.

- raw source SHA-256, byte length, IFC schema/profile와 adapter identity
- product와 spatial tree의 GlobalId/Express ID
- containment, type, property-set name, quantity와 제한된 assignment
- source-local geometry range와 occurrence transform
- 지원/미지원 projection의 명시적 목록과 cleanup receipt

## Revision과 cache identity

`sourceFingerprint`는 raw source bytes의 SHA-256입니다.

```text
sha256:<64 lowercase hex>
```

`revisionId`는 정확한 source fingerprint에 종속됩니다.

```text
source-snapshot:<sourceFingerprint>
```

cache fingerprint는 source descriptor, adapter identity, projection metadata,
range byte length와 range digest의 canonical JSON SHA-256입니다. source
fingerprint가 같더라도 adapter, profile, metadata 또는 range가 달라지면
cache fingerprint가 달라집니다. cache는 immutable이며 기존 digest의
bytes를 덮어쓰지 않습니다.

## Identity

- GlobalId는 source fingerprint 범위에서 안정적입니다.
- Express ID는 정확한 source snapshot에서만 유효합니다.
- renderable product의 Render ID와 Pick ID는 정확한 source fingerprint와
  Express ID에서 파생합니다.
- engine이 빈 tessellation을 반환한 product는 tree/property/source identity와
  `empty-tessellation` diagnostic을 유지하지만 Render/Pick ID는 없습니다.
- tree, property와 3D selection은 같은 `revisionId`, `snapshotId`,
  `layerId`를 사용합니다.
- 외부 identity token은
  `ifc-globalid:<sourceFingerprint>:<GlobalId>`입니다.
- Spatial Canonical ID나 Context Reference를 생성하지 않습니다.

중복 GlobalId/Express ID, stale revision/snapshot/layer와 Render/Pick 불일치는
fail closed로 거부합니다.

## Geometry range v1

media type:

```text
application/vnd.bim-explorer.geometry-range.v1
```

모든 integer와 float는 little-endian입니다.

| Offset | Type | 의미 |
| ---: | --- | --- |
| 0 | 8 bytes | ASCII `BEXGEO01` |
| 8 | uint32 | format version `1` |
| 12 | uint32 | unique geometry record count |

각 geometry record는 다음 header와 payload를 가집니다.

| Type | 의미 |
| --- | --- |
| uint32 | geometry Express ID |
| uint32 | interleaved vertex float count |
| uint32 | index count |
| uint32 | vertex byte length |
| uint32 | index byte length |
| float32[] | position XYZ + normal XYZ |
| uint32[] | triangle indices |

공유 geometry payload는 한 번만 저장하고 occurrence별 4x4 transform과 RGBA를
metadata에 둡니다. `sourceFromStorage` basis가 web-ifc Y-up storage 좌표를
IFC world Z-up으로 변환합니다.

geometry record는 Express ID 순서로 정렬하며 record 경계를 나누지 않고
configured `maximumRangeBytes`까지 range를 채웁니다. 첫 range는 초기
후보이고 나머지는 deferred 후보입니다. 이는 실제 visibility나 renderer
first-frame 우선순위가 아닙니다.

각 range handle은 digest, byte length, 최대 단일 read 크기와 session 누적
read budget에 묶입니다. 단일 record가 range limit을 넘거나 range count가
configured limit을 넘으면 bytes allocation 전에 거부합니다. 잘못된
offset/length, digest, handle context와 budget 초과도 거부합니다.

artifact는 source, product, geometry, relation-entry, tree-node와 projected
metadata의 configured limit과 observed value를 함께 기록합니다. adapter는
geometry range allocation 전에 누적 payload limit을 검사하며 product,
relation, tree 또는 metadata limit을 넘으면 snapshot을 공개하지 않습니다.

## Bounded semantic query

`BimModelSource` session은 같은 snapshot context에 묶인 다음 read-only
query를 제공합니다.

| Query | Ordering | 최대 page |
| --- | --- | ---: |
| direct tree child | Express ID | 100 |
| semantic search | Express ID | 100 |
| relation | kind, target, name/value | 100 |

cursor는 revision과 정규화된 query/scope에 결합된 opaque token입니다.
stale revision, 다른 query의 cursor, 중복·10,000개 초과 search scope와
256자 초과 query는 거부합니다. 결과는 전체 수, 현재 offset, 반환 수,
remaining과 next cursor를 포함합니다.

decomposition과 spatial containment를 별도 relation으로 유지하고,
occurrence/type, property-set name, quantity, direct material,
classification을 탐색합니다. source projection에 없는 host/void/fill,
connection과 broader object graph는 `opaque` coverage로 반환합니다.

## 현재 보류

- property/relation payload의 deferred range partition
- complex material graph와 connection relation
- IFC map conversion/georeferencing
- Browser Worker/VS Code package integration
- 공용 Viewer Core `RenderSource` conformance
- write/mutation과 cache migration
