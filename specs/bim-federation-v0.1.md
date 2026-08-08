# BIM Federation Contract v0.1

Status: draft

License: [Apache License 2.0](LICENSE)

## Scope

이 계약은 여러 immutable BIM source snapshot을 하나의 read-only 탐색
context에 배치할 때 필요한 source identity, coordinate alignment,
visibility, refresh, selection과 saved view 경계를 정의합니다.

parser, native SDK, Spatial Workspace, Canonical Entity ID, model mutation,
datum transformation 또는 format round-trip을 정의하지 않습니다.

## Contract identifiers

```text
bim-explorer-federation/0.1
bim-explorer-federation-source/0.1
bim-explorer-federation-alignment/0.1
bim-explorer-federation-selection/0.1
bim-explorer-federation-saved-view/0.1
bim-explorer-reference-format-registry/0.1
bim-explorer-reference-format-intake/0.1
bim-explorer-reference-format-triage/0.1
bim-explorer-federated-renderer-projection/0.1
```

모든 consumer는 지원하지 않는 major identifier를 거부해야 합니다.

## Source slot과 native identity

`federationSourceId`는 federation 안에서 document 역할을 식별하는 stable
slot입니다. active native document는 별도로 다음 값을 가집니다.

```text
federationSourceId
nativeDocument.sourceId
nativeDocument.fingerprint
nativeDocument.revisionId
nativeDocument.schema
nativeDocument.profile
```

refresh가 native fingerprint와 revision을 바꿔도 stable slot은 유지할 수
있습니다. 그러나 이전 revision의 Express ID, GlobalId 또는 source-native
ID projection, Render/Pick ID, selection과 saved view는 자동 이월하지
않습니다.

서로 다른 slot에 같은 IFC GlobalId가 있어도 identity를 합치지 않습니다.
federated selection key는 최소한 다음 tuple에 묶입니다.

```text
(federationSourceId, native revision, native identity)
```

ownership, semantic authority나 Canonical Entity ID는 federation이
발급하지 않습니다.

## Per-source state

각 source는 독립적으로 다음 상태와 visibility를 가집니다.

- `ready`: admitted snapshot을 탐색할 수 있음
- `partial`: bounded range나 projection 일부만 준비됨
- `stale`: 더 새로운 외부 document가 관찰됐거나 active revision이 만료됨

`partial`과 `stale`은 bounded path-free reason을 요구합니다. 상태는 source
identity를 바꾸지 않으며 invisible source도 active identity를 유지합니다.

## Coordinate alignment

alignment metadata는 16개 finite number의 column-major
`sourceToFederation` matrix를 사용합니다. numeric precision은 Float64
metadata입니다.

v0.1이 허용하는 방법은 두 가지입니다.

1. `projected-same-crs`: IFC `IfcMapConversion`의 target CRS가 federation
   CRS와 exact string identity로 같을 때 local origin을 뺀 matrix
2. `explicit`: 사용자가 확인한 control point 또는 별도 workflow의
   provenance reference와 함께 전달된 matrix

두 방법 모두 `datumTransformation: not-performed`를 명시합니다. CRS 이름이
다르거나 datum 변환이 필요한 source를 암묵적으로 맞추지 않습니다.
alignment evidence가 없으면 source는 `unaligned` 상태로 유지할 수 있지만
shared-coordinate projection은 거부합니다.

Float64 alignment metadata는 source-precision geometry authority가
아닙니다. renderer의 Float32 tessellation은 계속 lossy display cache입니다.

## Cross-source selection과 saved view

selection item은 stable source slot, exact native revision과 native identity를
함께 보존합니다. 다른 source의 같은 GlobalId를 중복으로 제거하지
않습니다.

saved view는 다음을 함께 저장합니다.

- camera와 최대 6개 section plane
- 모든 active source의 exact revision과 visibility
- source-bound cross-source selection
- `mergeAcrossSources: false`와 stale revision rejection policy

source 하나가 refresh되면 이전 revision을 가리키는 saved view 전체를
fail closed 처리합니다. consumer가 새 revision의 identity를 다시
resolve한 뒤 새 view를 저장해야 합니다.

## Incremental refresh

refresh request는 stable source slot과 `expectedRevisionId`를 요구합니다.
active revision이 다르면 거부합니다. 성공 시:

- 지정한 slot의 native snapshot과 alignment만 교체
- 다른 slot의 revision과 visibility 유지
- 이전 slot revision의 모든 selection/view를 stale로 처리
- native source mutation이나 identity reconcile은 수행하지 않음

이 계약의 incremental은 federation descriptor 교체 범위이며 native IFC
delta patch나 Spatial reconcile을 의미하지 않습니다.

## Reference format capability registry

format 등록과 실제 source admission을 분리합니다.

| Format | Role | View | Query | Write | Round-trip |
| --- | --- | --- | --- | --- | --- |
| IFC4 ReferenceView | semantic BIM source | qualified bounded profile | qualified bounded semantics | blocked | blocked |
| glTF/GLB | derived/reference mesh | qualified bounded glTF 2.0 reference mesh | qualified bounded node/mesh metadata | blocked | blocked |
| LAS/LAZ/E57 | point observation reference | held codec/scale | held metadata | blocked | blocked |
| 3D Tiles | GIS/site context | held engine/network | held metadata | blocked | blocked |
| RVT/DGN | native SDK reference | held SDK/rights | held SDK/profile | separate Gate | reopen Gate |

glTF/GLB source는 source-native `nativeId`를 사용하고 `globalId: null`,
`semanticAuthority: false`를 유지합니다. mesh, point cloud와 GIS source를
BIM semantic authority로 승격하지 않습니다. RVT/DGN은 SDK 사용권,
platform package, native adapter와 reopen qualification 전에는
admission하지 않습니다.

새 format을 `admitted`로 바꾸려면 format별로 최소 다음 evidence가
필요합니다.

- exact parser/SDK artifact, license와 redistribution rights
- bounded input, chunk/range, cancellation과 cleanup
- coordinate/precision profile
- source role과 semantic authority
- view/query/write/round-trip 각각의 conformance
- representative redistributable fixture와 bounded budget

product-scale budget은 experimental codec admission과 별도의 production
Gate입니다.

후속 format의 실제 사용자 과업과 qualification 준비 상태는
[`reference-format-intake/0.1`](reference-format-intake-v0.1.md) packet으로
접수합니다. 완전한 packet도 별도 codec/SDK compatibility evidence 전에는
registry의 `admitted` 값을 바꾸지 않습니다.

## Derived renderer projection

explicitly aligned source 두 개 이상은 source-neutral geometry range를 한
read-only renderer snapshot으로 투영할 수 있습니다. projection은 다음을
지켜야 합니다.

- range handle, Render/Pick ID와 composite native ID를 source slot별로
  namespacing
- `(federationSourceId, source revision, native identity)` mapping 보존
- storage-to-source와 source-to-federation transform의 명시적 합성
- source별 projected bounds를 합친 federation-local bounds
- source identity를 GlobalId 기준으로 merge하지 않음
- supplied source session의 ownership을 획득하거나 dispose하지 않음

projection fingerprint는 source revision, alignment와 exact derived geometry
projection에 묶여야 합니다. projection은 display cache이며 semantic,
write, round-trip 또는 Spatial authority를 갖지 않습니다.

## Bounds와 lifecycle

기본 구현 상한은 source 32개, selection 512개, section plane 6개입니다.
호출자가 더 작은 상한을 설정할 수 있습니다.
derived renderer projection의 기본 상한은 source 8개, renderable entity와
instance 각각 100,000개이며 호출자가 더 작은 상한을 설정할 수 있습니다.

federation은 supplied source session의 ownership을 획득하지 않습니다.
`dispose`는 federation descriptor와 selection/view state만 회수합니다.
source session, Worker와 GPU lifecycle은 기존 source/renderer owner가
각각 정리해야 합니다.

## Explicitly held

- 실제 Coni Spatial consumer와 standalone Spatial bundle
- 실제 사용자 과업의 두 format 이상 수요
- 측량 control point와 datum transformation
- glTF/GLB external resource bundle와 required extension; bounded 제품
  file-open은 별도 product-shell evidence에서 통과
- LAS/LAZ/E57와 3D Tiles parser/engine
- RVT/DGN native SDK bridge와 reopen qualification
