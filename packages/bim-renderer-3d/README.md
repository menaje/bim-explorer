# BIM renderer 3D

source-neutral 3D geometry range를 bounded CPU staging과 backend lifecycle로
연결하는 내부 draft입니다.

현재 vertical slice는 다음만 구현합니다.

- `application/vnd.bim-explorer.geometry-range.v1`의 독립 consumer-side decode
- snapshot의 `firstFrameRangeIds`만 bounded chunk read
- geometry record와 primitive slice/count의 교차 검증
- Render/Pick ID와 source revision이 묶인 instance plan
- headless backend의 upload/draw/resource 영수증
- source switch, abort, malformed bytes와 disposal의 fail-closed 처리

headless backend의 frame은 실제 GPU render나 화면 표시가 아닙니다. 이
package는 아직 camera, visibility, picking, section, measurement, Browser
GPU backend 또는 Viewer Core conformance를 주장하지 않습니다.

session/source lifecycle은 호출자가 소유합니다. renderer는 자신이 만든
backend allocation과 임시 range staging만 정리합니다.
