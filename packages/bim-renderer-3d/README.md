# BIM renderer 3D

source-neutral 3D geometry range를 bounded CPU staging과 backend lifecycle로
연결하는 내부 draft입니다.

현재 vertical slice는 다음만 구현합니다.

- `application/vnd.bim-explorer.geometry-range.v1`의 독립 consumer-side decode
- snapshot의 `firstFrameRangeIds`만 bounded chunk read
- camera target과 entity bounds 기반 visibility-first range 선택
- geometry record와 primitive slice/count의 교차 검증
- source-native ID, optional IFC GlobalId, Render/Pick ID와 source revision이
  묶인 instance plan
- headless backend의 upload/draw/resource 영수증
- WebGL2 backend의 geometry·instance upload, first-frame pixel 영수증
- perspective/orthographic fit과 orbit·pan·zoom camera state
- active revision의 Render ID hide/show와 view revision 영수증
- offscreen WebGL2 Pick ID pass와 revision-bound selection/highlight
- pick target의 transient allocation·즉시 회수 영수증
- context loss invalidation·복구와 GPU source switch 회수
- bounded progressive range append/cache hit/eviction
- isolate/hide/show-all과 affected-bounds atomic redraw
- camera-relative origin을 쓰는 large-coordinate projection
- DOM pointer/wheel camera control과 직렬화된 frame update
- clipping plane·section box와 depth-backed world-position pick
- active revision pick으로 묶인 distance·area·angle measurement
- Browser/VS Code Webview 공통 host lifecycle과 editor-exit cleanup
- abort, malformed bytes와 disposal의 fail-closed 처리

headless backend의 frame은 실제 GPU render나 화면 표시가 아닙니다.
WebGL2 backend는 실제 Browser GPU API 경로와 rasterized pixel을 검증하지만
physical GPU를 식별하거나 보장하지 않습니다. Browser와
`vscode-webview`는 동일한 내부 host contract를 실제 Chromium WebGL2에서
검증했습니다. 공개 Viewer Core 0.1.2 prerelease에서는 실제 BIM source와
headless renderer를 Browser/VS Code host lifecycle로 mount하고 전량
회수했습니다. 실제 제품 entrypoint 채택과 stable/production 호환은 별도
Gate입니다. measurement 단위는 source-coordinate-unit이며 IFC unit 해석을
renderer authority로 만들지 않습니다.

reference mesh는 IFC GlobalId를 합성하지 않으며 `nativeId`로 source-local
identity를 유지합니다.

renderer 단독 사용 시 session/source lifecycle은 호출자가 소유합니다.
host adapter를 사용하면 active range session과 Worker lease를 소스 교체와
editor 종료 시 함께 정리합니다. source object 자체와 Spatial authority는
host나 renderer가 소유하지 않습니다.
