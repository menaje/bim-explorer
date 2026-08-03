# BIM model source

IFC adapter가 생성한 immutable artifact를 bounded read-only source session으로
노출합니다.

현재 계약은 BIM Explorer 내부 draft입니다.

- raw source SHA-256을 revision의 기준으로 사용합니다.
- GlobalId와 Express ID를 같은 snapshot의 Render/Pick ID에 연결합니다.
- geometry bytes는 digest가 있는 immutable range로만 읽습니다.
- 한 번의 read 크기와 session 누적 read budget을 강제합니다.
- stale revision/snapshot/layer 요청과 중복 identity를 거부합니다.
- source/session dispose 뒤 metadata와 range 접근을 거부합니다.

공용 Viewer Core의 durable package와 conformance가 아직 없으므로 이
package는 Viewer Core 호환성을 주장하지 않습니다.
