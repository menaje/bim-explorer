# BIM model source

IFC adapter가 생성한 immutable artifact를 bounded read-only source session으로
노출합니다.

현재 계약은 BIM Explorer 내부 draft입니다.

- raw source SHA-256을 revision의 기준으로 사용합니다.
- GlobalId와 Express ID를 같은 snapshot의 Render/Pick ID에 연결합니다.
- geometry record 경계를 보존한 digest 기반 immutable range directory를
  노출합니다.
- 한 번의 read 크기와 session 누적 read budget을 강제합니다.
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
bounded read를 검증했습니다. 이는 renderer가 GPU에 올린 first-frame이나
IFC2X3 지원 profile 승인이 아닙니다.

`queryTree`, `searchEntities`, `queryRelations`는 geometry range를 읽지
않습니다. property set은 현재 이름까지만 보존하며 value-level payload는
deferred range가 준비될 때까지 제공하지 않습니다.

공용 Viewer Core의 durable package와 conformance가 아직 없으므로 이
package는 Viewer Core 호환성을 주장하지 않습니다.
