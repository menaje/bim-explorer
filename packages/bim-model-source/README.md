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
- stale revision/snapshot/layer 요청과 중복 identity를 거부합니다.
- source/session dispose 뒤 metadata와 range 접근을 거부합니다.

고정된 46.77MB 공개 IFC2X3에서 3개 geometry range와 첫 range 단독
bounded read를 검증했습니다. 이는 renderer가 GPU에 올린 first-frame이나
IFC2X3 지원 profile 승인이 아닙니다.

공용 Viewer Core의 durable package와 conformance가 아직 없으므로 이
package는 Viewer Core 호환성을 주장하지 않습니다.
