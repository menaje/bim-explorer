---
type: specification
status: draft
authority:
  - internal-bim-source-artifact
  - geometry-range-encoding
  - semantic-detail-range-encoding
  - property-detail-range-encoding
  - georeferencing-projection
  - source-display-precision-boundary
  - source-local-identity
last_reviewed: 2026-08-04
---

# BIM source artifact v0.2

## 상태와 변경

`bim-explorer-bim-source-artifact/0.2`는 format adapter와 BIM Explorer
`BimModelSource` 사이의 내부 read-only draft입니다. 공용 Viewer Core
protocol이나 production IFC 지원 profile이 아닙니다.

v0.2는 v0.1의 geometry range와 identity를 유지하면서 다음을 추가합니다.

- snapshot의 eager semantic summary와 deferred semantic detail 분리
- `application/vnd.bim-explorer.semantic-detail-range.v1`
- `application/vnd.bim-explorer.property-detail-range.v1`
- source protocol `bim-explorer-bim-source/0.2`의
  `getEntityDetails`와 `getPropertySetValues`
- geometry, semantic detail과 property detail의 독립 request/session read
  budget
- detail digest, binary directory, JSON payload와 Express ID의 fail-closed
  admission
- IFC4 projected CRS/MapConversion의 명시적 `mapped`·`absent`·`invalid`
  상태
- fingerprinted IFC source와 lossy Float32 display tessellation의 authority
  분리

v0.1 consumer는 새 artifact를 암묵적으로 열 수 없습니다. consumer는
artifact schema와 source protocol을 모두 명시적으로 협상해야 합니다.

## Artifact projection

artifact는 engine object나 전체 IFC object graph가 아니라 다음의 bounded
projection만 전달합니다.

- raw source SHA-256, byte length, IFC schema/profile와 adapter identity
- product와 spatial tree의 GlobalId/Express ID
- containment, type, property-set name과 semantic summary
- source-local geometry range와 occurrence transform
- deferred quantity, direct material과 classification detail
- occurrence/type `IfcPropertySingleValue`의 deferred primitive value
- projected CRS와 normalized IFC world→map conversion metadata
- 지원/미지원 projection의 명시적 목록과 cleanup receipt

각 entity는 `detailSlice`를 가집니다.

```json
{
  "rangeId": "range:ifc:semantic-detail:0",
  "offset": 24,
  "byteLength": 204
}
```

eager `semantics`는 container, type, property-set names, quantity names,
material names와 classification names만 보존합니다. quantity value,
direct material과 classification record는 detail slice에 둡니다.
property-set primitive value는 별도의 `propertyDetails` slice에 두며 complex,
bounded, enumerated, list와 table property kind는 이름을 보존하고
`opaque`로 남깁니다.

## Revision과 cache identity

`sourceFingerprint`는 raw source bytes의 SHA-256이고 `revisionId`는 정확한
source fingerprint에 종속됩니다.

```text
sha256:<64 lowercase hex>
source-snapshot:<sourceFingerprint>
```

legacy `cacheFingerprint`는 source descriptor, adapter identity, projection
metadata, geometry/detail range byte length와 digest의 canonical JSON
SHA-256입니다. 기존 geometry/detail consumer의 identity를 깨지 않도록
property/georeferencing extension은 별도 `semanticCacheFingerprint`에
포함합니다. raw source가 달라지면 두 fingerprint 모두 달라지며
property/georeferencing만 달라도 semantic cache는 달라집니다. 기존
digest의 bytes를 덮어쓰지 않습니다.

## Identity

- GlobalId는 source fingerprint 범위에서 안정적입니다.
- Express ID는 정확한 source snapshot에서만 유효합니다.
- renderable product의 Render/Pick ID는 source fingerprint와 Express
  ID에서 파생합니다.
- 빈 tessellation product는 semantic identity와 diagnostic을 유지하지만
  Render/Pick ID는 발급하지 않습니다.
- tree, summary, detail과 3D selection은 같은 `revisionId`, `snapshotId`,
  `layerId`를 사용합니다.
- 외부 identity token은
  `ifc-globalid:<sourceFingerprint>:<GlobalId>`입니다.
- Spatial Canonical ID나 Context Reference를 생성하지 않습니다.

중복 GlobalId/Express ID, 누락·중복 detail Express ID, stale context와
Render/Pick 불일치는 fail closed로 거부합니다.

## Geometry range v1

media type:

```text
application/vnd.bim-explorer.geometry-range.v1
```

v0.1의 little-endian `BEXGEO01` encoding을 그대로 사용합니다.

| Offset | Type | 의미 |
| ---: | --- | --- |
| 0 | 8 bytes | ASCII `BEXGEO01` |
| 8 | uint32 | format version `1` |
| 12 | uint32 | unique geometry record count |

각 record는 geometry Express ID, vertex/index count와 byte length,
interleaved position/normal `float32[]`, triangle `uint32[]`를 가집니다.
record 경계를 나누지 않고 configured range limit까지 분할합니다.

## Semantic detail range v1

media type:

```text
application/vnd.bim-explorer.semantic-detail-range.v1
```

모든 integer는 little-endian입니다.

| Offset | Type | 의미 |
| ---: | --- | --- |
| 0 | 8 bytes | ASCII `BEXDET01` |
| 8 | uint32 | format version `1` |
| 12 | uint32 | semantic detail record count |

각 record는 다음 header와 UTF-8 JSON payload를 가집니다.

| Type | 의미 |
| --- | --- |
| uint32 | product Express ID |
| uint32 | JSON payload byte length |
| byte[] | exact UTF-8 JSON payload |

payload shape:

```json
{
  "quantities": {
    "GrossVolume": 2.4
  },
  "materials": [
    "Concrete"
  ],
  "classifications": [
    {
      "identification": "BE-WALL",
      "name": "Synthetic Wall Class",
      "source": "Synthetic Classification"
    }
  ]
}
```

record는 Express ID 순서로 정렬하며 record 경계를 나누지 않습니다.
digest, magic/version, UTF-8/JSON shape, unique Express ID와 entity
`detailSlice`의 exact offset/length가 모두 일치해야 snapshot을 공개합니다.

## Property detail range v1

media type:

```text
application/vnd.bim-explorer.property-detail-range.v1
```

directory는 little-endian `BEXPRP01`, version `1`, record count로
시작합니다. 각 record는 product Express ID, UTF-8 JSON byte length와
exact JSON payload를 가집니다. payload는 source-bound
`bim-explorer-bim-property-set-values/0.1`이며 occurrence/type scope,
property set/property Express ID, 이름, property class, unit과 nominal
value를 보존합니다.

```json
{
  "propertySets": [
    {
      "scope": "occurrence",
      "name": "Pset_WallCommon",
      "properties": [
        {
          "name": "Reference",
          "propertyClass": "IFCPROPERTYSINGLEVALUE",
          "nominalValue": {
            "status": "value",
            "ifcType": "IFCLABEL",
            "value": "MW-SHARED"
          },
          "unit": null
        }
      ]
    }
  ]
}
```

property detail은 최대 64 MiB/4,096 ranges, range당 1 MiB 기본 한도를
적용합니다. digest, directory, UTF-8/JSON shape, identity, exact slice와
session 누적 read budget을 검증한 뒤에만 공개합니다. 같은 entity의 반복
요청은 immutable result cache를 사용합니다.

## Georeferencing과 정밀도 authority

`georeferencing.status`는 다음 셋 중 하나입니다.

- `mapped`: `IfcProjectedCRS`와 scalar `IfcMapConversion`을 보존하고
  normalized X axis와 Float64 column-major `mapFromIfcWorld`를 제공합니다.
- `absent`: source에 map conversion이 없다는 명시적 상태입니다.
- `invalid`: 중복·불완전·비유한 값·0 이하 scale을 diagnostic과 함께
  fail closed로 보고합니다.

`mapped` metadata는 coordinate conversion을 위한 read-only projection이며
GIS datum 변환이나 source mutation 권한이 아닙니다.

snapshot의 `geometryRepresentations`는 두 authority를 분리합니다.

- `sourcePrecision`: SHA-256으로 고정된 외부 IFC document가 authority이며
  STEP source-defined numeric encoding을 보존합니다. source geometry
  range나 mutation API는 노출하지 않습니다.
- `displayTessellation`: web-ifc에서 파생한
  Float32 position/normal + Uint32 index render cache입니다. 명시적으로
  `lossy`이고 source mutation authority가 없습니다.

## Source protocol v0.2

snapshot은 geometry handles와 별도로 다음을 노출합니다.

```text
snapshot.details.rangeHandles
snapshot.propertyDetails.rangeHandles
snapshot.georeferencing
snapshot.geometryRepresentations
snapshot.semanticCacheFingerprint
snapshot.loadPlan.deferredDetailRangeIds
```

`getEntityDetails`는 exact snapshot context와 product Express ID를 요구하고
`bim-explorer-bim-entity-details/0.1`을 반환합니다. 첫 요청은 entity의 JSON
slice만 읽고 검증하며, 같은 session의 반복 선택은 immutable parsed
결과를 재사용합니다.

`getPropertySetValues`도 exact snapshot context와 product Express ID를
요구하며 `bim-explorer-bim-property-set-values/0.1`을 반환합니다.

geometry `readRange`, legacy semantic detail과 property detail budget은
서로 독립적입니다. semantic 선택이 first-frame geometry budget을
소모하지 않고, geometry loading도 두 detail budget을 소모하지 않습니다.
source/session dispose 뒤에는 세 range directory와 cache 모두 접근할 수
없습니다.

## 공개 대표 검증

고정된 46,766,968-byte Schependomlaan IFC2X3에서 다음을 검증했습니다.

- geometry 9,290,696 bytes / 3 ranges
- semantic detail 5,490,130 bytes / 6 ranges
- 첫 geometry range 4,193,868 bytes를 읽는 동안 semantic detail 0 bytes
- 선택 product의 detail slice 2,575 bytes만 읽고 5,487,555 bytes 미읽기
- 두 격리 실행에서 동일 snapshot/detail directory와 cleanup

이는 IFC2X3 production profile 승인이 아닙니다.

추가 generated IFC4 qualification은 1,026-byte property range에서 선택
entity의 497-byte slice만 읽고 occurrence/type `IfcPropertySingleValue`
두 개를 재현했습니다. EPSG:32652 projected CRS와 MapConversion의 Float64
matrix, conversion 부재 상태, invalid scale 거부와 source/display
authority 분리도 검증했습니다.

## 현재 제한

- complex property kind의 value projection
- 실제 측량 좌표 fixture와 datum/vertical transformation
- source-precision geometry export
- complex material graph와 connection relation
- write/mutation과 v0.1 cache migration
