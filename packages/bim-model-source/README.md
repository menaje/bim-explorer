# BIM model source

IFC adapter가 생성한 immutable artifact를 bounded read-only source session으로
노출합니다.

현재 계약은 BIM Explorer 내부 draft입니다.

- raw source SHA-256을 revision의 기준으로 사용합니다.
- GlobalId와 Express ID를 같은 snapshot의 Render/Pick ID에 연결합니다.
- geometry record 경계를 보존한 digest 기반 immutable range directory를
  노출합니다.
- eager semantic summary와 `BEXDET01` deferred detail directory를
  분리합니다.
- occurrence/type `IfcPropertySingleValue` primitive를 별도 `BEXPRP01`
  property directory에서 lazy read합니다.
- geometry, semantic detail과 property detail의 한 번 read 크기와 session
  누적 budget을 독립적으로 강제합니다.
- IFC4 projected CRS/MapConversion을 `mapped`, `absent`, `invalid`로
  구분하고 Float64 world-to-map metadata를 노출합니다.
- fingerprinted external IFC source와 lossy Float32 display tessellation의
  authority를 명시적으로 분리합니다.
- empty tessellation 제품은 tree/property identity와 diagnostic을 유지하되
  Render/Pick ID를 발급하지 않습니다.
- tree child, semantic search와 relation을 1..100 item page로 제한하고
  query/revision-bound opaque continuation cursor를 사용합니다.
- decomposition과 spatial containment, type/occurrence, Pset/Qto, direct
  material과 classification을 구분합니다.
- GlobalId, name, IFC class, property set, quantity, material,
  classification, type과 container 검색을 제공합니다.
- 지원하지 않는 host/void/fill, connection과 broader graph는 opaque
  coverage로 반환합니다.
- stale revision/snapshot/layer 요청과 중복 identity를 거부합니다.
- source/session dispose 뒤 metadata와 range 접근을 거부합니다.

고정된 46.77MB 공개 IFC2X3에서 3개 geometry range와 첫 range 단독
bounded read를 검증했습니다. 5,490,130-byte quantity/material/classification
detail은 6개 range로 분할하고 첫 geometry read에서는 0 bytes를 유지한 뒤
선택 entity의 2,575-byte JSON slice만 읽었습니다. renderer first-frame과
제품 Worker packaging은 별도 호환성 evidence가 소유하며, IFC2X3 지원
profile 승인은 아닙니다.

`queryTree`, `searchEntities`, `queryRelations`는 geometry range를 읽지
않습니다. `getEntityDetails`와 `getPropertySetValues`는 각각 exact Express
ID의 독립 bounded slice를 읽고 같은 session의 반복 선택은 immutable
결과를 재사용합니다. property value projection은 primitive
`IfcPropertySingleValue`에 한정하며 complex property kind는 `opaque`입니다.

현재 계약은
[`bim-source-artifact/0.2`](../../specs/bim-source-artifact-v0.2.md)와
`bim-explorer-bim-source/0.2`입니다.

공개 `@menaje/viewer-core` 0.1.2 prerelease의 conformance runner에서 이
source의 3D projection, bounded range, identity, stale 거부와 disposal을
통과했습니다. IFC 제품 entrypoint도 public RenderSource adapter를 통해 같은
range와 lifecycle을 검증했습니다. stable/production compatibility는 별도
Gate입니다.
