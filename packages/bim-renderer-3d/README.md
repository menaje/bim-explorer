# BIM renderer 3D

source-neutral 3D geometry range를 bounded CPU staging과 backend lifecycle로
연결하는 내부 draft입니다.

현재 vertical slice는 다음만 구현합니다.

- `application/vnd.bim-explorer.geometry-range.v1`의 독립 consumer-side decode
- `application/vnd.bim-explorer.geometry-range.v2`의 interleaved UV와 bounded
  PNG texture table 독립 재검증
- snapshot의 `firstFrameRangeIds`만 bounded chunk read
- camera target과 entity bounds 기반 visibility-first range 선택
- geometry record와 primitive slice/count의 교차 검증
- source-native ID, optional IFC GlobalId, Render/Pick ID와 source revision이
  묶인 instance plan
- headless backend의 upload/draw/resource 영수증
- WebGL2 backend의 geometry·instance upload, first-frame pixel 영수증
- WebGL2 `SRGB8_ALPHA8` base-color texture upload, 표준 sampler·mipmap과
  texture source/decoded/GPU allocation의 exact release 영수증
- `application/vnd.bim-explorer.point-range.v1`의 Float64 origin +
  relative Float32/RGBA8 point primitive decode
- 별도 headless/WebGL2 point backend의 단일 `POINTS` draw, bounded staging과
  exact resource-release 영수증
- WebGL2 point backend의 32-bit Pick ID pass, depth-tested point 선택과
  선택 좌표 12-byte GPU readback
- exact source revision/root range에 묶인 derived octree leaf chunks, bounded
  coarse-to-full LOD materialization과 rendered-index→root-index map
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
회수했습니다. IFC/glTF/GLB 실제 제품 entrypoint도 공개 session을 통해 range를
읽고 terminal cleanup을 통과했습니다. stable/production 호환은 별도
Gate입니다. measurement 단위는 source-coordinate-unit이며 IFC unit 해석을
renderer authority로 만들지 않습니다.

reference mesh는 IFC GlobalId를 합성하지 않으며 `nativeId`로 source-local
identity를 유지합니다.

textured v2 range는 OPAQUE PNG `baseColorTexture`와 `TEXCOORD_0`만 소비합니다.
renderer는 source와 별도로 PNG signature/chunk/CRC, dimensions, decoded ratio,
geometry-to-texture reference와 trailing/unused payload를 검증합니다. external
bundle과 embedded GLB의 actual BoxTextured Gate는 같은 3,750-byte PNG를
262,144-byte decoded base RGBA와 349,524-byte mipmap-aware sRGB GPU texture로
산정합니다. 두 fixture의 Browser, staged VS Code와 clean-installed local VSIX,
합계 6개 Apple M2 Metal 표면은 각각 86,486 pixels와 350,516-byte total GPU
allocation을 만들고 texture/image bitmap을 포함한 모든 resource를
회수했습니다. material semantics, image storage/fetch와 BIM authority는
renderer가 소유하지 않습니다.

point range는 source semantic identity를 만들지 않습니다. renderer는 exact
source revision과 root range SHA-256 안의 배열 순서에서만 `point:n`을 파생하고,
32-bit Pick ID pass로 선택한 좌표 하나를 GPU buffer에서 읽습니다. 이 identity는
다른 revision/range와 합치지 않으며 E57 invalid record 제거 전의 원본 record
index도 아닙니다. cache-only LAS/LAZ와 E57을 actual Chrome, staged VS Code 및
clean-installed VSIX에서 qualification했습니다. five-scan E57은 51개 파생
octree leaf chunk와 31,971→242,821→1,213,990-point LOD, 단계별 identity-map/GPU
release와 최종 hierarchy cleanup도 통과했습니다. renderer 자체에는 CRS/datum,
source-native hierarchy 또는 source-declared point semantics가 없습니다. 따라서
파생 selection/LOD만으로 format admission이나 federation 지원을 주장할 수
없습니다.

renderer 단독 사용 시 session/source lifecycle은 호출자가 소유합니다.
host adapter를 사용하면 active range session과 Worker lease를 소스 교체와
editor 종료 시 함께 정리합니다. source object 자체와 Spatial authority는
host나 renderer가 소유하지 않습니다.
