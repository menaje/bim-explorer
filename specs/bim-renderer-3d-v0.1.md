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
Viewer Core protocol, 실제 GPU backend나 production renderer가 아닙니다.

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

## 현재 보류

- camera visibility 기반 초기 range와 progressive detail
- 실제 Browser GPU upload와 rendered first frame
- camera/orbit/pan/zoom/fit
- backend picking, selection과 highlight
- clipping, section과 measurement
- GPU context loss와 source-switch recovery
- Browser/VS Code 동일 backend conformance
- 공용 Viewer Core 3D consumer conformance
