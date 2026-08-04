---
type: specification
status: draft
authority:
  - bim-spatial-bridge-contract
  - optional-product-handoff
  - source-canonical-selection-sync
  - bim-base-spatial-review-composition
last_reviewed: 2026-08-04
---

# BIM Spatial integration v0.1

## 범위

`bim-explorer-spatial-integration/0.1`은 BIM Explorer의 read-only source
snapshot을 Coni Spatial의 service-owned identity, Context Reference와
revision review에 연결하는 optional bridge draft입니다.

이 계약은 Spatial package나 설치된 extension을 import하지 않습니다.
Explorer는 bridge 부재에도 로컬 IFC open, tree/property/3D와 authority-free
handoff 생성을 유지합니다.

## Exact compatibility

첫 contract pin은 다음과 같습니다.

```text
@menaje/viewer-core package 0.1.2
@menaje/viewer-render-protocol package 0.1.2
menaje-viewer-render-protocol/0.1.0
Spatial bridge protocol 0.1.0
BimModelSource protocol 0.2
```

package semver와 wire protocol identity를 혼동하지 않습니다. bridge
descriptor가 exact pin, Workspace revision, Render Map 또는 필수 capability
중 하나라도 다르면 연결을 만들지 않습니다.

## Source identity mapping

Explorer가 제출하는 native identity는 다음 source-bound field만 가집니다.

- raw IFC source fingerprint와 source revision
- source document ID
- GlobalId
- exact snapshot Express ID
- source-local external identity token
- source-bound viewpoint

Spatial bridge는 이 값을 Workspace/Spatial Revision의 Identity Map으로
검증하고 `exact` Canonical mapping과 2D/3D Render/Pick reference를
반환합니다. Explorer는 Canonical Entity ID를 만들거나 GlobalId에서
추측하지 않습니다.

mapping response는 BIM source fingerprint/revision, external identity,
Workspace revision과 Render Map을 모두 echo해야 합니다. stale source,
revision이나 누락된 2D/3D mapping은 fail closed입니다.

## Context Reference

`context.create` bridge request에는 Spatial bridge가 반환한 다음 값만
전달합니다.

- exact Workspace revision과 Render Map
- 2D/3D layer, Render ID와 Pick ID
- bounded viewport

요청에 Canonical ID, 실제 path, credential, Workspace capability,
acceptance token이나 source mutation grant를 넣지 않습니다. Spatial
Service가 자신의 Identity Map으로 다시 resolve하고
`cadctx://local/{opaque-token}`을 반환합니다. Explorer는 URI payload를
해석하지 않습니다.

## BIM base와 Spatial review

composition은 layer owner와 revision을 유지합니다.

```text
BIM Explorer
└─ immutable IFC base · source revision · 3D

Coni Spatial Service
├─ live · Spatial revision · 2D/3D
├─ added/modified/removed · Spatial revision · 2D/3D
└─ diagnostic/selection/annotation
```

BIM range는 Spatial range로 복사하거나 재라벨링하지 않습니다. review
descriptor는 `semantic`, `geometry`, `representation`, `render`,
`requirement` category의 digest와 changed entity count를 항상 포함합니다.
시각 변화가 없더라도 semantic/requirement category를 생략하지 않습니다.

## Optional handoff

`bim-explorer-spatial-handoff/0.1`은 최대 32 KiB이며 다음만 포함합니다.

- target product와 minimum protocol
- source fingerprint/revision/schema/profile
- bounded GlobalId/Express/Render/Pick identity
- source-bound viewpoint와 최대 6개 section plane
- optional opaque Context Reference
- requested capability 이름
- 모든 authority grant가 false인 명시적 envelope

수신 Spatial product가 source와 revision을 다시 검증합니다. payload는
Workspace authority, accept/publish 또는 source mutation evidence가
아닙니다.

## 현재 evidence와 보류

generated IFC4와 deterministic synthetic Spatial bridge에서 source mapping,
2D/3D sync, opaque Context Reference, BIM base + Spatial live/modified layer,
다섯 diff category, stale source/revision 거부와 cleanup을 통과했습니다.

다음은 consumer-owned Gate입니다.

- 실제 Coni Spatial service bridge conformance
- BIM Explorer 설치가 없는 Spatial bundle qualification
- Community release의 public BIM integration package

이 Gate가 없으면 `experimental` provider contract 이상을 주장하지
않습니다.
