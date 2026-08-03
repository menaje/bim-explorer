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

mounted renderer의 `renderView()`는 camera와 숨길 Render ID 목록만
받습니다. Render ID가 active source revision의 instance에 없거나 중복이면
backend 호출 전에 거부합니다. view receipt는 증가하는 view revision,
camera, hidden/visible instance 수, draw-call, pixel과 frame 시간을
기록합니다. geometry·instance GPU buffer는 view 사이에 다시 upload하지
않습니다.

공개 fixture에서는 perspective fit, orbit·pan·zoom, 64개 Render ID hide,
orthographic show-all fit을 4 frames로 실행했습니다. hide frame의 draw는
3,182에서 3,118로 줄고 show-all에서 3,182로 복구됐으며 active GPU bytes는
계속 4,399,252였습니다.

## 현재 보류

- camera visibility 기반 초기 range와 progressive detail
- pointer/gesture 기반 camera input과 interaction policy
- backend picking, selection과 highlight
- clipping, section과 measurement
- physical GPU·driver와 GPU memory qualification
- GPU context loss와 source-switch recovery
- Browser/VS Code 동일 backend conformance
- 공용 Viewer Core 3D consumer conformance
