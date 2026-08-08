---
type: specification
status: draft
authority:
  - multi-source-spatial-bridge-contract
  - generic-source-canonical-handoff
  - reference-first-spatial-review-composition
last_reviewed: 2026-08-09
---

# BIM Spatial integration v0.2

## 상태와 범위

`bim-explorer-spatial-integration/0.2`는 federated Explorer context를 Coni
Spatial의 external base registration, Canonical mapping, reference anchor와
revision review에 연결하는 optional provider draft다.

v0.1의 IFC 단일 source handoff를 변경하지 않는다. Explorer package는 Spatial
private package, Workspace storage, authoring operation 또는 authority
implementation을 import하지 않는다.

## Exact compatibility

provider descriptor는 최소 다음을 exact pin한다.

```text
bim-explorer-bim-surface/0.2
bim-explorer-federation/0.1
bim-explorer-reference-anchor/0.1
bim-explorer-spatial-integration/0.2
Spatial reference source protocol version
Spatial Design protocol version
Viewer/render package semver와 wire protocol identity
```

required feature나 exact version 교집합이 없으면 bridge를 만들지 않는다.

## Generic source identity

Explorer가 제출하는 identity는 format 중립적인 source-scoped envelope다.

```text
federation source slot
format/schema/profile
native fingerprint/revision
native identity kind/value
optional IFC GlobalId/Express ID
occurrence path
alignment fingerprint
projection fingerprint
source-bound viewpoint
```

Spatial은 현재 Workspace의 registered reference source와 exact revision을
검증한 뒤에만 Canonical mapping을 반환한다. IFC GlobalId, glTF native ID와
다른 format ID를 서로 추측하거나 source 사이에서 merge하지 않는다.

mapping 결과는 `exact`, `remapped`, `ambiguous`, `missing`, `conflict` 중 하나와
입력 source/revision/transform을 echo한다. Explorer는 `exact`가 아닌 결과를
Canonical selection으로 자동 승격하지 않는다.

## Reference anchor handoff

Explorer는 `bim-explorer-reference-anchor/0.1` receipt를 그대로 제출한다.
Spatial provider는 다음을 추가할 수 있다.

- exact Workspace와 Spatial Revision
- registered reference source ID
- resolved Canonical external-base mapping 또는 `null`
- opaque Spatial anchor ID
- stale/reconcile status

Explorer는 Spatial anchor ID의 payload를 해석하지 않는다. Spatial이 authored
object의 `aligned-to`, `offset-from`, `hosted-by` 또는 clearance constraint를
소유하며 Explorer receipt는 그 관계의 승인이나 만족 여부를 판정하지 않는다.

## Revision composition

한 review context는 source owner와 revision을 유지한다.

```text
BIM Explorer surface
├─ external semantic/reference base · native revisions
└─ source-scoped selection/anchor

Coni Spatial Service
├─ authored 3D live · Spatial Revision
├─ added/modified/removed · Spatial Revision
└─ constraint/requirement/anchor-impact diagnostics
```

external range를 Spatial-owned range로 복사·재라벨링하지 않는다. Spatial
overlay도 native base revision으로 표시하지 않는다. property-only,
relationship-only와 anchor-invalidated change는 geometry pixel 변화가 없어도
review에서 생략하지 않는다.

## Refresh와 reconcile

external source refresh 뒤 provider는 이전 anchor와 mapping을 stale로
표시한다. 자동 nearest-point 재부착은 허용하지 않는다. Spatial이 새 source
revision에서 identity/locator를 resolve하고 mapping/anchor impact를 제시한 뒤
사람의 source acceptance workflow가 baseline을 전진시킨다.

Explorer는 refresh observation이나 mapping 결과로 source.accept,
revision.accept, publish 또는 delivery를 호출하지 않는다.

## Optional handoff

`bim-explorer-spatial-handoff/0.2`는 최대 64 KiB이며 다음만 포함한다.

- target product와 required contract versions
- bounded source slot/revision/identity 목록
- source-bound viewpoint, selection과 section plane
- optional reference anchor receipt
- optional opaque Context Reference
- requested capability 이름
- 모든 authority grant가 false인 envelope

path, credential, raw geometry, Workspace capability와 acceptance token은
포함하지 않는다.

## Consumer-owned Gate

실제 Coni Spatial checkout에서 다음을 검증하기 전에는 이 contract를
experimental provider 이상으로 표현하지 않는다.

- Explorer package의 standalone exact pin
- IFC 또는 GLB external base 등록과 동일 좌표 overlay
- selection/anchor → Spatial reference 등록
- external refresh → stale → reconcile → human accept 흐름
- package/source/renderer/Service cleanup
