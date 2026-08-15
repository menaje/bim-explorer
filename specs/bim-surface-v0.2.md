---
type: specification
status: draft
authority:
  - federated-bim-surface-contract
  - multi-source-surface-lifecycle
  - source-role-composition
last_reviewed: 2026-08-15
---

# BIM Surface v0.2

## 상태와 목적

`bim-explorer-bim-surface/0.2`는 여러 immutable source를 하나의 bounded 3D
context에서 탐색하고 외부 설계 소비자에게 source-scoped selection과 reference
anchor를 제공하는 host-neutral draft다.

v0.2는 단일 source인 [`bim-surface/0.1`](bim-surface-v0.1.md)의 의미를
바꾸지 않는다. private 0.2.0 package candidate, 실제 Spatial headless consumer
composition과 release-ready tgz의 exact-byte 재검증은 통과했다. 동일 tgz는
immutable public package prerelease로 공개됐다. 그 artifact의 Spatial Phase B
exact-pin admission도 통과했으며 production support만 별도 Gate로 유지한다.

## Contract pin

첫 draft는 다음 public/internal contract를 명시적으로 협상한다.

```text
bim-explorer-bim-surface/0.2
bim-explorer-bim-surface-hit/0.1
bim-explorer-federation/0.1
bim-explorer-reference-anchor/0.1
bim-explorer-bim-source/0.2
bim-explorer-gltf-reference-source/0.1
menaje-viewer-render-protocol/0.1.0
```

지원하지 않는 major identifier, source profile 또는 renderer projection은
fail closed한다.

## Source slot input

`open`은 1–8개의 source slot과 하나의 renderer host를 받는다. 각 slot은
다음을 가진다.

- stable `federationSourceId`
- exact native fingerprint/revision/schema/profile
- admitted source session과 snapshot 또는 source-neutral render projection
- `semantic-base`, `geometric-reference`, `observation-reference`,
  `consumer-overlay` 중 caller-provided `sourceRole`
- source별 visibility와 `ready`/`partial`/`stale` state
- optional explicit `sourceToFederation` alignment
- `transferred` 또는 `borrowed` lifecycle ownership

`sourceRole`은 composition과 UI 설명을 위한 metadata다. format/profile이
제공하지 않는 semantic, geometry, write 또는 round-trip capability를 만들지
않는다. `consumer-overlay`도 Explorer의 authored source가 아니며 원래
consumer revision과 identity를 그대로 유지한다.

서로 다른 source slot의 GlobalId, native ID, Render/Pick ID와 range handle은
항상 namespacing한다. 같은 GlobalId를 source 사이에서 merge하지 않는다.

## v0.3 retained overlay extension

개발선의 additive
[`bim-explorer-federated-retained-overlay/0.1`](bim-retained-overlay-v0.1.md)은
`consumer-overlay` slot만 native source range 재읽기 없이 geometry delta로
갱신한다. packet digest, source/layer/revision/sequence와 operation을 exact
binding하고 별도 CPU/GPU staging을 마친 뒤 geometry, visibility, Pick map과
Surface revision을 synchronous commit 하나로 전환한다. stale, cancellation,
allocation 또는 digest 실패는 current surface를 보존한다.

checkpoint는 native range read/upload를 수행하지 않으며 retained geometry에는
source-local triangle locator가 없으므로 object selection을 유지하되 anchor는
unavailable이다. 이 extension은 immutable public v0.2.0 runtime과 tgz에 포함되지
않으며 artifact-only conformance를 통과한 새 v0.3.0 package candidate에만
포함된다.

## Semantic exploration과 selection

semantic query는 capability가 있는 source slot을 명시해야 한다. mesh 또는
observation reference를 IFC tree/property source로 승격하지 않는다.

selection key는 최소 다음에 묶인다.

```text
(federationSourceId, native revision, native identity, occurrence path)
```

surface는 cross-source selection을 반환할 수 있지만 Canonical Entity ID를
만들거나 여러 source identity를 한 객체로 reconcile하지 않는다.

depth-backed pick이 hit를 만들면 surface는
[`bim-explorer-reference-anchor/0.1`](bim-reference-anchor-v0.1.md) receipt를
요청할 수 있다. anchor가 unavailable인 source/profile은 object selection은
유지하되 명시적인 unsupported diagnostic을 반환한다.

actual WebGL2 경로는 GPU depth와 Pick ID를 exact revision의 resident geometry
range에 다시 대조한다. SHA-256이 일치하고 가장 가까운 단일 triangle이 GPU
depth quantization 범위 안에서 재현될 때만 projection-local point, winding
normal과 triangle-barycentric locator를 만든다. 이 값은 exact display geometry의
derived locator이며 native source face 또는 source-precision geometry가 아니다.
임시 range bytes는 해석 뒤 지우고 CPU geometry cache로 보존하지 않는다.

## Coordinate alignment

shared projection은 `bim-explorer-federation/0.1`의 same-CRS MapConversion
또는 provenance가 있는 explicit matrix만 사용한다. unaligned source는 독립
local view로 탐색할 수 있지만 shared-coordinate measurement, anchor 또는
overlay composition에는 사용하지 않는다.

alignment metadata는 Float64이고 renderer tessellation은 lossy display
projection이다. surface는 datum transformation이나 source-precision geometry를
주장하지 않는다.

## Lifecycle

surface state는 `idle`, `opening`, `ready`, `refreshing`, `disposing`,
`disposed`, `failed`다.

- open 성공 전에 모든 source identity, alignment와 projection을 검증한다.
- `transferred` session/Worker/range/GPU ownership은 open 실패와 dispose에서
  surface가 역순으로 회수한다.
- `borrowed` resource는 surface가 dispose하지 않으며 receipt에 남긴다.
- source 하나의 refresh는 expected revision을 요구하고 해당 slot의 prior
  selection, saved view와 anchor만 stale로 만든다.
- 반복 dispose는 `false`이며 disposed/failed surface는 다시 열 수 없다.

cleanup receipt는 source slot별 transferred/borrowed resource, renderer
allocation, active selection/anchor count와 terminal state를 기록한다.

## Authority

v0.1과 같이 Workspace, Canonical Entity ID, source/geometry/revision mutation,
constraint, accept, publish와 export authority는 모두 `false`다. Surface event,
selection과 anchor는 consumer product의 authorization 또는 human approval가
아니다.

## Package와 conformance Gate

generated GLB–IFC–GLB 세 source의 actual Chrome WebGL2 composition,
source-scoped semantic/selection, 세 개의 derived source-local anchor와 exact
cleanup은 Browser와 VS Code Gate를 통과했다. private
`@bim-explorer/federated-bim-surface@0.2.0` candidate도 두 번의 byte-identical
pack, offline clean install과 같은 3-source lifecycle을 통과했다. actual Spatial
headless consumer는 이전 exact candidate에서 다음 consumer 범위를 재현했다.

- IFC semantic base + GLB reference + consumer overlay 동시 projection
- source별 tree/query/visibility/selection identity
- source-local anchor와 alignment/projection fingerprint
- source refresh 뒤 stale anchor 거부
- open failure, source 교체와 terminal dispose의 exact cleanup
- standalone Spatial bundle의 exact package pin과 authority-free composition

release-ready package는 같은 461,431-byte runtime과 contract를 유지하고
README·source offer가 포함된 97,623-byte tgz가 됐다. Spatial은 SHA-256
`3bdb747d…c63cb`의 최종 private candidate bytes를 다시 검증했다. 이 bytes는
`prerelease` branch의 exact annotated tag와 package-only
`bim-surface-v0.2.0` immutable GitHub prerelease로 공개됐다. Spatial은 그 public
asset을 Explorer checkout 없이 anonymous download해 offline clean install하고
Phase B exact-pin도 통과했다. npm registry와 새 VSIX Marketplace/Open VSX
publication, stable production support는 승인하지 않는다.

post-release 개발 기준선은 software rasterizer를 끄고 ANGLE Metal을 강제한
actual Chrome 151 Browser 2회와 VS Code 1.132 staged/clean-installed local VSIX에서
같은 generated GLB–IFC–GLB composition을 Apple M2 physical GPU로 재현했다.
세 경로는 8,286 non-background pixels, 1,608-byte upload, surface hit/anchor
3개와 exact cleanup을 공유한다. 이 Gate는 `darwin-arm64` 단일 hardware와
generated fixture에 한정하며 Linux/Windows, 실제 고객 모델, OS-level peak GPU
memory, Spatial VSIX BIM runtime이나 production support를 승인하지 않는다.
