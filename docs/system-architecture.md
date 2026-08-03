---
type: architecture
status: accepted
authority:
  - system-components
  - adapter-process-boundary
  - host-runtime-boundary
  - data-lifecycle
last_reviewed: 2026-08-04
---

# 시스템 아키텍처

## 전체 구조

```text
local BIM source
  -> source admission
     - file capability
     - source fingerprint
     - size/profile limits
  -> isolated format adapter
     - Native process or WASM Worker
  -> immutable BIM source snapshot
     - bounded metadata/index
     - binary geometry ranges
     - source-local identity map
  -> BimModelSource
  -> versioned Viewer Core/render protocol
  -> generic 3D presentation
  -> Browser Host or VS Code Host
```

Viewer Core, product DOM과 Host는 source file이나 engine object를 직접
해석하지 않습니다.

## Source admission

Host는 사용자가 명시적으로 선택한 source를 opaque capability로 adapter에
전달합니다. adapter는 읽기 전에 다음을 고정합니다.

- exact source fingerprint
- byte size와 configured resource budget
- claimed format과 detected schema/profile
- adapter engine/version/backend identity
- cancellation과 cleanup scope

source가 읽는 동안 바뀌거나 symlink/path policy를 벗어나면 snapshot을
공개하지 않습니다. 실제 path는 diagnostic의 public field가 아닙니다.

## Native와 WASM adapter

Native와 WASM은 같은 adapter contract를 구현하는 backend 선택입니다.

### Native process

- 별도 process와 bounded IPC를 사용합니다.
- crash, timeout, cancellation과 exit receipt를 구분합니다.
- native pointer와 engine object는 process 밖으로 전달하지 않습니다.
- output range와 cache는 source/engine/options fingerprint에 묶습니다.

### WASM Worker

- Browser/Worker memory와 execution budget을 명시합니다.
- 전체 model object graph를 main thread로 structured clone하지 않습니다.
- immutable metadata page와 binary geometry range를 전달합니다.
- WASM linear-memory capacity와 phase별 시간을 관찰하되 live bytes, process
  peak RSS나 GPU memory로 오해하지 않습니다.
- adapter phase checkpoint에서 `continue`/`cancel`을 handshake하고, 취소 시
  model close와 engine dispose를 cleanup receipt로 검증합니다.
- bounded grace 안에 취소 영수증이 없으면 Worker 강제 종료로 승격합니다.

두 backend의 지원 여부는 같은 public IFC fixture와 semantic/geometry
conformance로 비교합니다. WASM을 위해 source identity나 geometry 의미를
낮은 공통분모로 축소하지 않습니다. checkpoint cooperative cleanup은
실행 중인 동기 engine 호출을 선점한다는 의미가 아닙니다.

현재 공통 report와 capability vocabulary는
[IFC engine adapter v0.2 draft](../specs/ifc-engine-adapter-v0.2.md)가
정의합니다. 두 후보 모두 작은 IFC4 fixture를 통과했지만 selection과
production admission은
[qualification Gate](ifc-engine-qualification.md)에 따라 보류합니다.

## BIM source snapshot

snapshot은 다음 논리 계층을 가집니다.

| 계층 | 예시 | 수명 |
| --- | --- | --- |
| Source descriptor | fingerprint, schema/profile, engine | immutable snapshot |
| Semantic index | class, type, containment, property keys | paged/bounded |
| Relation index | decomposition, assignment, connection | paged/bounded |
| Spatial index | bounds, storey, placement | paged/bounded |
| Geometry ranges | mesh/edge/material chunks | range handle |
| Identity map | GlobalId/Express ID ↔ Render/Pick ID | exact snapshot |

snapshot은 Spatial Revision이 아닙니다. source bytes가 달라지면 새 snapshot과
identity reconciliation 결과가 필요합니다.

현재 내부 draft
[`bim-source-artifact/0.1`](../specs/bim-source-artifact-v0.1.md)은 generated
mapped IFC에서 raw source SHA-256, 7-node spatial/product tree, 두 Wall의
property/type/containment와 한 shared geometry payload를 같은 immutable
snapshot에 묶습니다. range digest, 최대 단일 read와 session 누적 budget,
stale context, 중복 identity와 cleanup을 강제합니다. 고정된 공개 IFC2X3의
3,569 products는 3개 bounded geometry range로 나뉘며 첫 range만 읽고
나머지를 미읽기로 유지하는 source 단계도 통과했습니다. 비어 있는
tessellation은 semantic identity와 diagnostic만 유지합니다. renderer
first-frame, deferred property range와 Viewer Core conformance는 아직
보류합니다.

## Viewer Core와 3D presentation

공용 Viewer Core가 제공해야 하는 최소 계약은 다음입니다.

- source/session/snapshot lifecycle
- 2D/3D layer descriptor
- bounded range handle
- Render/Pick/external identity
- ordered delta와 stale/out-of-order 거부
- ViewerHost event와 deterministic disposal

generic 3D package는 camera, fit, picking, section, isolate, measurement와 GPU
resource를 소유합니다. IFC parsing, product DOM, Spatial Workspace와
accept/publish capability는 소유하지 않습니다.

현재 내부
[`bim-renderer-3d/0.1`](../specs/bim-renderer-3d-v0.1.md)은 geometry range를
독립적으로 재검사하고 첫 range만 bounded read해 primitive/record와
Render/Pick revision identity를 mount plan으로 묶습니다. 공개 fixture의
2,458 geometry records·3,182 instances를 headless backend에 올리고
allocation을 회수했습니다. headless receipt는 GPU upload나 rendered frame이
아니며 camera, picking, section과 실제 Browser backend는 계속 보류합니다.

현재 upstream package는 workspace-only이므로 compatibility 상태는
[`unresolved`](../compatibility/viewer-core.json)입니다. 코드를 복사하거나
상대 checkout에 대한 `file:` dependency로 이 상태를 우회하지 않습니다.

## Browser와 VS Code Host

Browser Host와 VS Code Host는 같은 product lifecycle을 구현합니다.

| Host 책임 | Browser | VS Code |
| --- | --- | --- |
| source capability | File/Blob picker | Custom Editor document |
| adapter backend | Worker/WASM 우선 | Worker 또는 isolated native process |
| binary range | Blob/OPFS/HTTP opt-in | extension-managed local range |
| resource reveal | explicit download/view | bounded editor/reveal intent |
| lifecycle | page/worker disposal | document/webview disposal |

Host private transport는 public Viewer or Agent protocol이 아닙니다. VS Code
message나 Browser DOM event를 cross-product API로 안정화하지 않습니다.

## Spatial integration

Spatial integration package는 optional client입니다.

```text
BIM source snapshot
 + Spatial Revision identity map
 + Spatial live/diff layers
 -> compatible 3D surface
 -> selection
 -> Spatial Service가 Context Reference 생성
```

Explorer는 Context Reference를 직접 발급하지 않고 요청 intent만 전달합니다.
Spatial Service가 Workspace, revision, source와 capability를 다시 검증합니다.
