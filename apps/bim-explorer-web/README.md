# BIM Explorer Web

local IFC를 Browser에서 선택해 Worker-isolated source artifact,
`BimModelSource`, semantic explorer와 WebGL2 renderer로 여는 standalone
read-only product shell입니다.

- source는 64 MiB admission limit 뒤 Worker로 전달합니다.
- 파일명, local path, credential을 Worker/report에 넣지 않습니다.
- source switch와 cancel은 prior Worker를 종료해 stale result를 차단합니다.
- tree, property, search와 3D pick은 같은 fingerprint/revision을 사용합니다.
- timing과 source/geometry/metadata/range budget을 diagnostics로 표시합니다.
- account, telemetry, 외부 upload를 요구하지 않습니다.

`npm run start:web`은 loopback-only local server를 실행합니다. generated
qualification fixture는 `--fixture synthetic`을 명시한 경우에만 노출합니다.
실제 고객 IFC는 저장하거나 Git에 추적하지 않습니다.
