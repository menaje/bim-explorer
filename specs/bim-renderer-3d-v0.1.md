---
type: specification
status: draft
authority:
  - internal-bim-renderer-3d
  - geometry-staging-limits
  - renderer-resource-receipt
last_reviewed: 2026-08-04
---

# BIM renderer 3D v0.1

## 상태와 범위

`bim-explorer-bim-renderer-3d/0.1`은 source-neutral 3D snapshot을 bounded
geometry staging과 backend lifecycle에 연결하는 내부 draft입니다. 공용
Viewer Core protocol이나 production renderer가 아닙니다. 실제 Browser
WebGL2 backend는 experimental qualification surface에서만 검증했습니다.

첫 vertical slice는 다음 입력만 소비합니다.

- immutable source fingerprint, revision, snapshot과 3D layer identity
- digest와 byte/request limit이 있는 geometry range handle
- 초기 range와 deferred range의 명시적 목록
- geometry slice/count, occurrence transform와 color
- source revision에 묶인 Render/Pick ID

IFC class, property와 Spatial authority는 renderer plan에 포함하지 않습니다.

## Geometry consumer

현재 geometry media type은 다음입니다.

```text
application/vnd.bim-explorer.geometry-range.v1
```

renderer는 adapter/source validator와 별도로 magic, version, record count,
payload length, finite vertex, index bounds, duplicate geometry Express ID와
trailing bytes를 다시 검사합니다. primitive의 range ID, slice, vertex/index와
triangle count가 decoded record와 정확히 일치하지 않으면 backend를
호출하지 않습니다.

range는 handle의 `maximumRequestBytes`와 renderer의 `maximumReadBytes` 중
작은 크기로만 읽습니다. range별 digest를 확인한 뒤에만 mount plan을
만듭니다. range count, encoded bytes, decoded payload, geometry record,
instance, triangle, draw-call과 CPU staging limit은 backend 호출 전에
적용합니다.

## Mount plan과 identity

초기 plan은 `firstFrameRangeIds`로 명시된 range만 포함합니다. 현재
Express ID 순서의 첫 range이며 camera visibility 기반 first-frame plan은
아닙니다.

각 draw instance는 다음 source-local identity를 유지합니다.

- source fingerprint, revision, snapshot과 layer
- GlobalId/Express ID
- Render/Pick ID
- geometry Express ID와 range ID
- 4x4 occurrence transform과 RGBA

non-renderable product는 geometry instance를 만들지 않습니다. semantic
identity와 diagnostic은 source/tree/property 계층에 남습니다.

## Backend lifecycle

backend는 `mount(plan)`, `unmount(handleId)`, `dispose()`를 구현합니다.
`mount`는 await가 완료되기 전에 필요한 bytes를 upload 또는 복사해야 하며
그 뒤 renderer는 임시 range staging을 지웁니다.

mount receipt는 다음을 구분합니다.

- geometry payload bytes
- instance buffer bytes
- uploaded bytes와 draw calls
- 실제 rendered frame 여부

source switch는 이전 backend handle을 먼저 unmount합니다. invalid backend
receipt도 handle이 반환됐다면 unmount로 정리합니다. AbortSignal은 range
chunk와 backend mount 경계에서 확인합니다. session과 source의 dispose는
호출자가 소유하고 renderer는 자신의 backend allocation만 소유합니다.

WebGL2 context loss를 관찰하면 해당 mount의 resource object를
`contextInvalidated`로 표시합니다. restore event 뒤에도 이 mount로
render/pick하지 않으며, 같은 source revision의 range를 다시 읽어 새
program/buffer로 remount해야 합니다. context가 파기한 resource는
중복 delete하지 않고 logical released bytes에만 반영합니다.

## Headless backend

`headless` backend는 geometry/instance byte와 draw-call accounting을
검증하는 deterministic fake backend입니다.

```text
actualGpu: false
rendered: false
```

`headless` mount 시간, frame ID 또는 uploaded byte receipt를 GPU upload,
shader compilation, rasterization이나 first-frame 시간으로 해석하지
않습니다.

## Browser WebGL2 backend

`webgl2` backend는 decoded vertex/index payload와 occurrence
transform·color instance buffer를 실제 WebGL2 context에 upload합니다.
source 좌표계 변환과 camera view-projection matrix를 적용하고
`drawElementsInstanced` frame을 그린 뒤 다음을 영수증으로 남깁니다.

- geometry, instance와 전체 uploaded bytes
- draw-call과 GPU buffer 수
- frame 크기, WebGL version과 GL error
- non-background pixel, upload와 first-frame 시간
- unmount의 released bytes와 terminal dispose 상태

공개 fixture의 첫 range는 local Chromium에서 3,182 draws와 67,153
non-background pixels를 만들고 4,399,252 bytes를 전량 회수했습니다.
이는 실제 Browser GPU API 경로의 증거입니다. masked WebGL context만
관찰했으므로 physical GPU 종류·전용 memory·driver 성능은 주장하지 않습니다.

## Camera와 visibility view state

`bim-explorer-camera-3d/0.1`은 perspective/orthographic projection, target,
yaw/pitch, distance, field-of-view와 near/far frustum을 immutable state로
정의합니다. bounds 기반 fit, orbit, pan과 zoom helper는 매번 전체 camera
state를 검증해 새 값을 반환합니다.

mounted renderer의 `renderView()`는 camera, 숨길 Render ID와 선택할 Pick
ID 목록을 받습니다. ID가 active source revision의 instance에 없거나
중복이면 backend 호출 전에 거부합니다. view receipt는 증가하는 view
revision, camera, hidden/visible/selected/highlighted instance 수,
draw-call, pixel과 frame 시간을 기록합니다. geometry·instance GPU
buffer는 view 사이에 다시 upload하지 않습니다.

공개 fixture에서는 perspective fit, orbit·pan·zoom, 64개 Render ID hide,
orthographic show-all fit을 4 frames로 실행했습니다. hide frame의 draw는
3,182에서 3,118로 줄고 show-all에서 3,182로 복구됐으며 active GPU bytes는
계속 4,399,252였습니다.

## Picking과 selection

`bim-explorer-bim-renderer-3d-pick-receipt/0.1`은 canvas top-left 기준의
정수 화면 좌표를 active source/revision에 묶인 identity로 해결합니다.
WebGL2 backend는 RGBA8 color와 16-bit depth를 가진 transient offscreen
target을 만들고, visible instance마다 24-bit index를 그린 뒤 한 pixel만
읽습니다. target의 3,110,400 bytes는 pick이 끝날 때 즉시 회수하며
geometry·instance allocation에는 포함하지 않습니다.

public fixture의 960x540 orthographic frame 중앙은 Express ID 317690의
Pick ID로 해결됐습니다. 해당 Pick ID를 선택한 다음 frame은 같은
4,399,252-byte persistent allocation에서 한 instance와 7,507 highlight
pixels를 기록했습니다. stale Pick ID와 backend가 반환한 active revision
밖의 identity는 fail closed로 거부합니다.

pick color의 하위 17 bits는 instance index, 상위 15 bits는 normalized
depth입니다. depth와 camera를 이용해 canvas pixel center를 source-world
좌표로 복원합니다. 100,000-instance limit은 17-bit index 범위 안에 있고,
depth quantization은 renderer receipt에 명시합니다.

## Clipping과 measurement

`renderView()`는 최대 6개의 normalized clipping plane을 받습니다.
section box는 안쪽 half-space를 유지하는 6 planes로 변환되며 별도 plane과
합쳐 6개를 넘으면 거부합니다. 화면 shader와 offscreen pick shader는 같은
planes를 적용하므로 잘린 geometry가 pick authority로 다시 나타나지
않습니다.

`bim-explorer-bim-renderer-3d-measurement-receipt/0.1`은 active revision의
hit pick만 받아 source-world distance, planar polygon area와 3-point
angle을 계산합니다. degenerate distance/angle/area와 non-planar polygon은
거부합니다. renderer는 IFC unit을 추론하지 않으며 값의 단위는
`source-coordinate-unit`입니다.

public fixture에서 3개 surface point로 1.523745 distance, 2.292001 triangle
area와 90-degree angle을 재현했습니다. one-plane clip은 64,289 pixels를
37,717로, six-plane section box는 46,932로 줄였고 show-all은 64,289로
복구했습니다.

## Context loss와 source switch

local Chromium의 `WEBGL_lose_context` qualification에서 loss/restore event와
context generation 1→2를 관찰했습니다. invalidated 4,399,252-byte mount는
render를 거부했고, 같은 revision의 첫 range를 다시 4회 읽어 3,182 draws를
복구했습니다. 이어 fingerprint가 다른 synthetic IFC4 source로 전환해
996 source bytes, 1,120 uploaded bytes와 2 draws를 만들었습니다.

첫 public mount, recovered public mount와 IFC4 switch mount의 logical
released bytes 합계는 8,799,624이며 terminal dispose 뒤 active bytes는
0입니다. 이 probe는 precomputed source를 사용하므로 Worker lifecycle은
source/Host 계층의 별도 책임입니다.

## 현재 보류

- camera visibility 기반 초기 range와 progressive detail
- pointer/gesture 기반 camera input과 interaction policy
- physical GPU·driver와 GPU memory qualification
- Browser/VS Code 동일 backend conformance
- 공용 Viewer Core 3D consumer conformance
