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
     - binary geometry/detail/property ranges
     - georeferencing + precision authority
     - source-local identity map
  -> BimModelSource
  -> versioned Viewer Core/render protocol
  -> generic 3D presentation + BIM semantic explorer
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
- parent가 configured interval로 RSS를 관찰하고 상한 초과를 별도
  `rss-limit` outcome으로 강제 종료합니다.
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
- synchronous engine call 직전 checkpoint 뒤 제어권이 반환되지 않으면
  process/Worker 전체를 강제 종료하고 fresh runtime으로 복구합니다.
  이 경계에서는 종료된 runtime 내부의 close/dispose를 주장하지 않습니다.
- malformed/truncated input은 path-free rejection receipt만 반환하고, 열린
  model을 닫은 뒤 engine dispose와 Worker 종료를 확인합니다.
- negative source 뒤 정상 source는 새 Worker에서 동일 identity/geometry
  assertion을 다시 통과해야 합니다.

두 backend의 지원 여부는 같은 public IFC fixture와 semantic/geometry
conformance로 비교합니다. WASM을 위해 source identity나 geometry 의미를
낮은 공통분모로 축소하지 않습니다. forced isolation은 동기 호출 중
process/Worker를 회수하는 전략이며 engine-cooperative cancellation,
강제 종료 뒤 explicit cleanup 또는 resource-exhaustion 복구를 의미하지
않습니다. sampled process RSS 상한은 별도 통과했지만 Browser/native
allocator exhaustion과 parser memory safety는 계속 별도 Gate입니다.

현재 공통 report와 capability vocabulary는
[IFC engine adapter v0.2 draft](../specs/ifc-engine-adapter-v0.2.md)가
정의합니다. 두 후보 모두 작은 IFC4 fixture를 통과했고,
`web-ifc@0.0.77`을 IFC4 `ReferenceView_V1.2` local read-only exploration의
첫 experimental engine으로 선정했습니다. IfcOpenShell은 unbundled
qualification oracle입니다. production package와 redistribution admission은
[qualification Gate](ifc-engine-qualification.md)에 따라 계속 막습니다.

## BIM source snapshot

snapshot은 다음 논리 계층을 가집니다.

| 계층 | 예시 | 수명 |
| --- | --- | --- |
| Source descriptor | fingerprint, schema/profile, engine | immutable snapshot |
| Semantic index | class, type, containment, property keys | paged/bounded |
| Property detail | primitive occurrence/type values | lazy bounded range |
| Relation index | decomposition, assignment, connection | paged/bounded |
| Spatial index | bounds, storey, placement | paged/bounded |
| Georeferencing | projected CRS, MapConversion, explicit absence | immutable snapshot |
| Geometry ranges | mesh/edge/material chunks | range handle |
| Identity map | GlobalId/Express ID ↔ Render/Pick ID | exact snapshot |

snapshot은 Spatial Revision이 아닙니다. source bytes가 달라지면 새 snapshot과
identity reconciliation 결과가 필요합니다.

현재 내부 draft
[`bim-source-artifact/0.2`](../specs/bim-source-artifact-v0.2.md)은 generated
mapped IFC에서 raw source SHA-256, 7-node spatial/product tree, 두 Wall의
property/type/containment와 한 shared geometry payload를 같은 immutable
snapshot에 묶습니다. range digest, 최대 단일 read와 session 누적 budget,
stale context, 중복 identity와 cleanup을 강제합니다. 고정된 공개 IFC2X3의
3,569 products는 3개 bounded geometry range로 나뉘며 첫 range만 읽고
나머지를 미읽기로 유지합니다. 5,490,130-byte semantic detail은 6개
range로 분리되고 first-frame에서는 읽지 않으며 선택 entity의 exact JSON
slice만 읽습니다. 별도 property directory는 primitive occurrence/type
value를 선택 시에만 읽습니다. IFC4 projected CRS/MapConversion은
`mapped`·`absent`·`invalid`로 구분하고 Float64 metadata로 유지합니다.
source precision authority는 fingerprinted external IFC document이고,
geometry range는 lossy Float32 display tessellation임을 명시합니다. 비어
있는 tessellation은 semantic identity와 diagnostic만 유지합니다. renderer
first-frame, Browser/VS Code Worker packaging과 Viewer Core conformance는
별도 evidence에서 검증했습니다.

`BimModelSource`는 exact snapshot context를 요구하는 bounded
`queryTree`, `searchEntities`, `queryRelations`, `getEntityDetails`,
`getPropertySetValues`를 제공합니다. page는 최대
100 items이며 cursor는 revision과 query에 결합됩니다. decomposition과
spatial containment, occurrence/type, Pset/Qto, direct material과
classification을 구분하고, 제공하지 않는 relation은 opaque coverage로
반환합니다.

## BIM semantic explorer

내부
[`bim-semantic-explorer/0.1`](../specs/bim-semantic-explorer-v0.1.md)은
source query를 tree, search, inspector, relation navigation과 selection
state로 투영합니다. DOM이나 renderer resource는 소유하지 않고, tree,
search, relation 또는 renderer pick에서 시작한 selection을 같은 source
fingerprint/revision에 묶습니다.

generated semantic IFC의 실제 Chromium probe에서
Project→Site→Building→Storey→Space→Wall hierarchy,
decomposition/containment, Wall→Type→Occurrence 왕복,
Pset/Qto/material/classification panel, paged search와 explicit omission,
WebGL2 pick, result isolate, source-local saved view, keyboard tree와 ARIA
role을 검증했습니다. loaded tree, search aggregate, relation page와 DOM row
상한을 각각 강제하며 dispose 뒤 query/GPU/session resource를 회수합니다.
source가 `getPropertySetValues`를 제공하면 선택 entity의 primitive value를
별도 bounded range에서 읽고, 구형 source는 name-only `lossy`를 유지합니다.
host/void/fill과 connection은 `opaque`입니다.
quantity/material/classification detail도 선택 시 deferred range에서
읽습니다. generated fixture의 기존 semantic conformance와 46.77MB 공개
fixture의 Browser/clean-installed VSIX product scale은 통과했지만,
value-level public Browser semantic conformance는 보류합니다.

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
allocation을 회수했습니다. 이어 실제 Chromium WebGL2 API에 같은
4,399,252-byte geometry·instance payload를 올려 3,182 draws와 rasterized
first frame을 확인하고 active allocation을 0으로 회수했습니다.
perspective/orthographic fit, orbit·pan·zoom camera state와 active revision의
Render ID hide/show는 같은 GPU allocation에서 view revision으로
검증했습니다. offscreen WebGL2 pick pass는 화면 좌표를 active revision의
Pick ID로 해결하고, 같은 allocation의 selection/highlight frame까지
검증했습니다. 실제 context loss 뒤 같은 revision을 remount하고 별도
IFC4 source로 교체해 이전 allocation과 session도 회수했습니다. DOM
pointer/wheel input은 camera update를 직렬화합니다. single
plane·six-plane section box와 GPU
depth-backed source-world distance·area·angle도 같은 allocation에서
검증했지만, source unit 해석은 renderer가 소유하지 않습니다.

deferred range는 bounded append/cache/eviction으로 관리하고 isolate/show-all
사이에서 GPU allocation을 재사용합니다. camera target과 entity bounds로
기존 source plan과 다른 first range를 선택할 수 있습니다. 10억 단위 world
coordinate는 camera-relative origin으로 GPU에 투영하고, presentation delta는
affected bounds만 scissor redraw한 뒤 atomic commit합니다.

내부 3D host contract는 Browser와 `vscode-webview` kind에 같은 renderer
경로를 제공합니다. 실제 Chromium에서 양쪽 모두 mount, view, pick, source
switch와 editor-exit cleanup의 normalized 결과가 같았고 GPU, range session,
Worker lease가 정리됐습니다. 실제 staged VS Code Custom Editor에서도 같은
generated source fingerprint, model/renderer projection과 WebGL2 frame을
재현했습니다.

공개 `@menaje/viewer-core`와
`@menaje/viewer-render-protocol` 0.1.0 prerelease를 immutable release
asset으로 고정했습니다. 실제 `BimModelSource` 3D projection과 bounded
renderer를 upstream runtime에 연결해 Browser/VS Code host lifecycle,
identity, stale 거부와 disposal을 통과했습니다. compatibility 상태는
[`experimental`](../compatibility/viewer-core.json)이며 제품 entrypoint
채택, stable upstream release와 production 주장은 별도 Gate입니다.

## Browser와 VS Code Host

Browser Host와 VS Code Host는 같은 product lifecycle을 구현합니다.

| Host 책임 | Browser | VS Code |
| --- | --- | --- |
| source capability | File/Blob picker | Custom Editor document |
| adapter backend | module Worker + WASM | bundled module Worker + WASM |
| binary range | Worker-owned immutable range | webview Worker-owned range |
| resource reveal | explicit download/view | bounded editor/reveal intent |
| lifecycle | page/worker disposal | document/webview disposal |

Host private transport는 public Viewer or Agent protocol이 아닙니다. VS Code
message나 Browser DOM event를 cross-product API로 안정화하지 않습니다.

VS Code extension host는 exact local `file:` URI를 regular non-symlink로
검사하고 읽기 전후 size/mtime을 확인합니다. webview에는 transferable
`ArrayBuffer`, generation과 bounded setting만 전달하며 report는
fingerprint와 수치 allowlist로 다시 투영합니다. source path를 message나
diagnostic에 넣지 않습니다.

webview CSP가 local resource URL의 직접 Worker 생성을 제한하므로 package는
source Worker bundle을 고정합니다. webview가 exact bundle, web-ifc module과
WASM을 bounded read한 뒤 `blob:` capability로 module Worker에 주입합니다.
Browser는 같은 Worker source를 same-origin module로 직접 실행합니다. 두
Host의 결과는
[product shell compatibility](../compatibility/bim-product-shells.json)가
같은 fingerprint와 projection으로 비교합니다.

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
