---
type: architecture
status: accepted
authority:
  - system-components
  - adapter-process-boundary
  - host-runtime-boundary
  - data-lifecycle
last_reviewed: 2026-08-11
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
  -> host-neutral BIM Surface
     - generic 3D presentation + BIM semantic explorer
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

## Host-neutral BIM Surface

[`bim-surface/0.1`](../specs/bim-surface-v0.1.md)은 한 source session의
bounded 3D host, semantic explorer, initial selection과 cleanup을 합성하는
재사용 경계입니다. DOM, file chooser와 network를 소유하지 않으므로 Browser,
VS Code Webview 또는 외부 product shell이 같은 source identity와 lifecycle을
사용할 수 있습니다. Browser와 VS Code shared app의 IFC 경로가 이 surface를
실제로 사용합니다.

`@bim-explorer/bim-surface@0.1.0`은 source, mesh renderer,
semantic explorer와 optional Spatial provider contract를 하나의 zero-runtime-
dependency ESM으로 묶습니다. repository manifest는 우발적 publication을 막기
위해 private로 유지합니다. 별도 stage가 MPL-2.0, NOTICE와 SOURCE_OFFER를
포함해 두 번 byte-identical pack하고 offline clean consumer에서 source open,
selection, search와 exact cleanup을 재현했습니다. 이 exact package는
`bim-surface-v0.1.0` immutable GitHub prerelease에서 checksum, SPDX, macOS/Linux
byte identity, release attestation과 workflow build provenance를 통과했습니다.
public registry와 실제 Spatial consumer conformance는 아닙니다.

E57/LAS/LAZ point reference runtime은 experimental source-neutral 경계로
남겨 이 package entrypoint에 포함하지 않습니다. Surface의 authority record는
Workspace, Canonical Entity ID, mutation, accept, publish와 export를 모두
거부합니다.

차기 [`bim-surface/0.2`](../specs/bim-surface-v0.2.md)는 v0.1을 덮어쓰지 않고
federation source slot을 합성합니다.

```text
immutable semantic/reference sources
  -> bim-federation/0.1
  -> source-scoped renderer projection
  -> bim-surface/0.2
     - per-source visibility/query/selection
     - reference-anchor/0.1 receipt
     - transferred/borrowed resource cleanup
  -> consumer-owned Workspace/authoring bridge
```

source role은 caller-provided display metadata이며 capability나 authority가
아닙니다. surface는 source-local point·normal을 반환할 수 있지만 이를
Spatial placement/constraint로 저장하거나 source refresh 뒤 자동 재부착하지
않습니다. Browser/VS Code product entrypoint와 private 0.2.0
zero-runtime-dependency package candidate는 검증됐고, Spatial actual headless
consumer는 이전 candidate와 exact 97,623-byte release-ready tgz에서 composition과
anchor lifecycle을 통과했습니다. 동일 tgz는 immutable package-only v0.2
prerelease로 공개됐고 public asset의 Spatial Phase B exact-pin도 통과했습니다.
Explorer의 generated 3-source Browser와 VS Code staged/clean-installed local VSIX는
별도 post-release Gate에서 Apple M2 Metal physical GPU를 통과했습니다. Spatial
VSIX BIM runtime과 Spatial 실제 UI/GPU, reconcile, Linux/Windows hardware와
production은 별도 Gate입니다.

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
재현했습니다. bounded glTF/GLB는 같은 Host lifecycle에서 reference source와
source-native explorer로 분기하며 IFC semantic authority를 사용하지
않습니다.

공개 `@menaje/viewer-core`와
`@menaje/viewer-render-protocol` package 0.1.2 prerelease를 immutable release
asset으로 고정했습니다. 실제 `BimModelSource` 3D projection과 bounded
renderer를 upstream runtime에 연결해 Browser/VS Code host lifecycle,
wire protocol 0.1.0 identity, stale 거부와 disposal을 통과했습니다.
compatibility 상태는
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
`ArrayBuffer`, normalized `ifc`/`gltf`/`glb`/`e57`/`las`/`laz` format,
generation과 bounded setting만 전달하며 report는
fingerprint와 수치 allowlist로 다시 투영합니다. source path를 message나
diagnostic에 넣지 않습니다.

webview CSP가 local resource URL의 직접 Worker 생성을 제한하므로 package는
IFC와 glTF/GLB dispatcher를 포함한 source Worker bundle을 고정합니다.
webview가 exact bundle, web-ifc module과 WASM을 bounded read한 뒤 `blob:`
capability로 module Worker에 주입합니다. Browser는 같은 Worker source를
same-origin module로 직접 실행합니다. 두 Host의 IFC와 reference 결과는
[product shell compatibility](../compatibility/bim-product-shells.json)가
각각 같은 fingerprint와 role-specific projection으로 비교합니다.
대표 공개 IFC와 product-scale GLB는 software rasterizer를 끈 Apple M2 Metal
경로에서도 actual Browser, staged VS Code와 clean-installed local VSIX 간
model/render/selection/cleanup parity를 통과했습니다. 이는 두 파일을 각각 연
macOS arm64 제품 qualification이며, 64MiB aggregate bound를 넘는 동시 합성이나
cross-platform·OS-level peak GPU memory·production coverage는 아닙니다.

## openBIM exploration

[`openbim-explorer/0.1`](../specs/openbim-explorer-v0.1.md)은 active
`BimModelSource` snapshot에 BCF XML 3.0, IDS 1.0 result와 bSDD URI를 묶는
read-only boundary입니다.

```text
BCFZIP / IDS XML / IDS result
  -> bounded archive/XML admission
  -> source fingerprint + revision binding
  -> GlobalId resolution
  -> camera/selection or failing-entity projection
  -> explicit diagnostic for missing/stale identity
```

BCFZIP은 inflate 전에 central/local directory와 선언 size를 검사합니다.
BCF viewpoint와 IDS fail result는 active source의 Render/Pick ID로만
projection하며 stale source를 거부합니다. IDS XML import는 requirement
탐색이지 native validator가 아닙니다.

bSDD reference는 import 중 offline 상태로 유지합니다. explicit
`allowNetwork: true` 호출만 credential 없이 official Class/Property API를
조회하고 bounded response/cache를 사용합니다. Spatial
validation-to-revision diagnostic linkage는 Spatial authority이며 Explorer
결과는 source baseline, acceptance나 publish를 변경하지 않습니다.

## BIM federation

[`bim-explorer-federation/0.1`](../specs/bim-federation-v0.1.md)은 여러
immutable source snapshot을 stable source slot 아래 배치합니다.

```text
federationSourceId
  -> exact native fingerprint/revision
  -> per-source visibility + ready/partial/stale
  -> explicit Float64 source-to-federation transform
  -> source-bound selection + saved view
```

서로 다른 source의 같은 GlobalId를 합치지 않습니다. source 하나를
refresh하면 그 slot의 prior selection과 saved view만 stale boundary에
걸리고 다른 source revision은 유지됩니다.

same-CRS IFC MapConversion과 provenance가 있는 explicit matrix만
admission합니다. datum transformation은 수행하지 않습니다. bounded
glTF/GLB reference mesh는 source-native identity와 unaligned 상태로
admission할 수 있지만 IFC semantic authority를 부여하지 않습니다.
LAS/LAZ/E57, 3D Tiles와 RVT/DGN은 capability registry에
view/query/write/round-trip Gate를 분리해 기록하고 제품 codec/SDK,
coordinate와 lifecycle evidence 전에는 source admission을 거부합니다.
cache-only LAS/LAZ probe는 paired LAS 1.2 point record decode에 이어 실제
Chrome Worker의 bounded WASM heap, checkpoint/forced cancellation, timeout,
truncated payload 격리와 fresh-Worker recovery까지 통과했습니다. 같은 exact
parity record의 source-neutral point range도 actual Chrome WebGL2에서 단일
`POINTS` draw, visible pixels와 exact cleanup을 통과했습니다. Browser 제품은
8 MiB source/500,000-point 한도 뒤 전용 Worker에서 LAS record를 읽거나 exact
`laz-perf@0.0.6`으로 LAZ를 해제하고, 하나의 Float64-origin/relative-Float32
range만 main thread로 transfer합니다. 실제 local file input의 LAS/LAZ parity와
source/Worker/CPU/GPU cleanup도 통과했습니다. VS Code Webview는 point Worker,
strict-CSP `laz-perf` glue와 WASM을 bounded read한 뒤 각각 `blob:` capability로
주입합니다. staged Custom Editor와 clean-installed VSIX도 같은 projection과
cleanup을 통과했으며 Webview CSP는 `unsafe-eval`을 허용하지 않습니다. 샘플은
qualification-only입니다. 별도 Browser, staged VS Code와 clean-installed VSIX
Gate는 exact source revision/root range digest에 묶인 32-bit derived point
pick과 선택 좌표 readback을 통과했습니다. 대형 E57은 같은 root range에서
51개 octree leaf-page chunk를 파생하고 31,971→242,821→1,213,990-point LOD로
전환합니다. rendered vertex index는 `Uint32` map으로 root `point:n`에 돌아가며
각 단계의 prior GPU range/map과 full-detail 이후 Worker hierarchy를 exact
회수합니다. 이 파생 display 구조는 source-native hierarchy가 아닙니다. CRS,
source-declared semantics와 format admission은 없으므로 federation source
admission에는 영향을 주지 않습니다. E57도
single-scan Cartesian XYZ/optional RGB default-BitPack profile을 같은 bounded
point Worker와 renderer로 열며, Browser·staged VS Code·clean-installed VSIX에서
7,680-point projection과 cleanup을 통과했습니다. 같은 Worker decoder는 별도
cache-only matrix에서 Float64·ScaledInteger 30,571-point parity, indexless
compressed-vector와 `cartesianInvalidState` direction 필터를 통과했습니다.
추가 cache-only spherical sample은 370,530개 RAE/intensity/RGB record를 해제해
215,329개 invalid record를 제거하고 155,201개 Cartesian display point를
독립 `pye57/libE57Format` nanometer parity로 재현합니다. intensity omission은
lossy로 표시합니다. 같은 point range는 actual Browser, staged VS Code와
clean-installed VSIX에서 155,201 points·20,754 pixels로 재현되고 전량
cleanup됩니다. 별도 32 MiB qualification envelope는 cache-only 공개 E57의 다섯 scan,
1,213,990개 record와 structured row/column stream을 해제하고 네 explicit
quaternion/translation pose 및 한 implicit identity pose를 적용해 독립
`pye57/libE57Format` digest parity를 통과했습니다. 이 경로는 제품 Worker에
명시적으로 연결되어 actual Browser, staged VS Code와 clean-installed VSIX에서
같은 1,213,990-point projection과 cleanup을 재현합니다. local registration을
CRS나 surveyed datum으로 승격하지 않습니다. E57의 CRS/surveyed datum,
extension profile과 format admission은 계속 별도 Gate입니다.

현재 generated IFC4 두 source와 GLB reference source 하나의 synthetic
foundation을 통과했습니다. derived renderer projection은 generated IFC
두 source와 제품 규모 GLB 하나의 동시 first frame, aggregate memory와
cleanup도 통과했습니다. 실제 측량 coordinate, 실제 사용자 수요와 Spatial
consumer는 별도 Gate입니다.

## Spatial integration

[`bim-spatial-integration/0.1`](../specs/bim-spatial-integration-v0.1.md)은
Spatial private package를 import하지 않는 host-neutral optional
boundary입니다.

```text
BIM source snapshot + source-bound selection
  -> Spatial bridge descriptor 0.1.0
  -> service-owned GlobalId/Canonical mapping
  -> synchronized Spatial 2D/3D Render/Pick identity
  -> opaque Context Reference
  -> BIM base + Spatial live/diff review descriptor
```

bridge descriptor는 Viewer Core/Render Protocol package 0.1.2와 wire
protocol 0.1.0을 exact pin합니다. Context request에는 Canonical ID를
제출하지 않으며 Spatial Service가 현재 revision의 Identity Map으로
Render/Pick ID를 다시 resolve합니다. BIM base layer와 Spatial layer는
source/revision/owner를 합치지 않습니다.

현재 generated IFC4와 synthetic bridge provider conformance, Explorer 소유
`bim-surface-v0.1.0` public immutable package의 offline clean install,
macOS/Linux byte identity와 attestations까지 통과했습니다. federated Surface
0.2의 actual Spatial headless consumer는 이전 private candidate와 release-ready
tgz를 exact-pin해 composition을 통과했습니다. 동일 tgz의 immutable public
artifact가 발급됐으며 Phase B exact-pin과 standalone Spatial product admission은
Spatial #22에서 통과했습니다. standalone Spatial product integration과 production
admission은 계속 consumer-owned Gate가 소유합니다.

외부 3D 기반 설계의 차기 경계는
[`bim-spatial-integration/0.2`](../specs/bim-spatial-integration-v0.2.md)가
소유합니다. IFC 전용 GlobalId handoff를 format-neutral source slot/native
identity/occurrence path로 확장하고, `reference-anchor/0.1`을 Spatial의 opaque
registered reference로 전달합니다. Explorer는 authored 3D와 constraint를
저장하지 않고 Spatial은 native base range를 자신의 revision으로 재라벨링하지
않습니다. source refresh 뒤 mapping/anchor impact와 human acceptance는 전부
Spatial consumer Gate입니다.
