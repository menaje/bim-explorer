---
type: adr
status: accepted
authority:
  - federated-reference-bim-surface
  - spatial-reference-anchor-boundary
  - external-design-base-consumer-contract
last_reviewed: 2026-08-09
decision_id: ADR-0004
---

# ADR-0004: 외부 3D 기반 설계를 위한 federated BIM Surface를 제공한다

## Context

공개된 `bim-surface/0.1`은 하나의 immutable BIM source, 하나의 renderer와
하나의 semantic explorer를 안전하게 합성한다. 이 경계는 standalone BIM
Explorer와 단일 IFC 소비자에는 충분하지만, 외부 건축·대지 모형을 먼저
등록하고 그 위에 Coni Spatial의 3D 설계를 진행하는 과업에는 다음 계약이
부족하다.

- 여러 IFC·GLB reference source와 Spatial-authored overlay의 source slot
- source별 좌표 정렬과 revision을 보존하는 합성 lifecycle
- 화면 pick을 source-local point·normal·native identity로 반환하는 reference
  anchor
- 외부 source가 갱신됐을 때 이전 anchor를 자동 이월하지 않는 stale 경계

이 요구는 Explorer에 authoring kernel이나 Workspace authority를 넣으라는
의미가 아니다. BIM Explorer는 외부 source의 read/index/render/explore를,
Spatial은 Canonical identity, authored geometry, constraint, revision과
accept/publish를 계속 소유해야 한다.

## 비교한 대안

1. `bim-surface/0.1`의 단일 source 의미를 같은 version 안에서 변경한다.
2. Spatial이 Explorer package를 사용하지 않고 별도 3D renderer와 pick 계약을
   구현한다.
3. Explorer가 Spatial의 authored object와 constraint를 직접 저장·수정한다.
4. `bim-surface/0.1`을 보존하고 federated surface v0.2와 additive reference
   anchor 계약을 추가한다.

## Decision

대안 4를 선택한다.

`bim-surface/0.1`과 `bim-surface-v0.1.0` release evidence는 변경하지 않는다.
차기 `bim-explorer-bim-surface/0.2` draft는 기존
`bim-explorer-federation/0.1` 위에서 복수 source slot, source별 visibility,
alignment, lifecycle과 source-scoped semantic exploration을 합성한다.

surface가 사용하는 `sourceRole`은 `semantic-base`, `geometric-reference`,
`observation-reference`, `consumer-overlay`를 구분하는 caller-provided
composition metadata다. 이 값은 source의 semantic, geometry 또는 authoring
authority를 새로 만들지 않는다. 실제 capability는 admitted source/profile과
원래 snapshot contract만 결정한다.

`bim-explorer-reference-anchor/0.1`은 exact federation source slot, native
revision과 native identity에 source-local hit point·normal을 묶는 read-only
receipt다. 가능한 source는 occurrence path와 triangle/barycentric locator를
추가할 수 있지만 이를 source-precision topology나 장기 안정성으로 과장하지
않는다. source revision, alignment 또는 renderer projection이 바뀌면 이전
anchor는 stale이며 consumer가 다시 resolve해야 한다.

Explorer는 anchor를 Spatial constraint, Canonical Entity ID 또는 acceptance로
해석하지 않는다. Spatial Service가 현재 Workspace와 Spatial Revision 안에서
anchor를 등록하고 authored object와의 관계·offset·constraint를 소유한다.

내부 v0.2 entrypoint와 private 0.2.0 package candidate의 reproducible pack,
offline clean install은 actual Browser와 VS Code Webview와 독립 검증할 수 있다.
candidate qualification은 public tag, release asset 또는 Spatial compatibility를
발급하지 않는다. public v0.2 release는 actual Spatial consumer가 exact pin, external
base + authored overlay composition, anchor invalidation과 cleanup을 재현한
뒤에만 qualification한다. Explorer 제품 evidence만으로 Spatial 지원·배포를
주장하지 않는다.

## 거부 이유

대안 1은 이미 공개된 immutable v0.1 contract와 consumer 기대를 깨뜨린다.

대안 2는 source identity, alignment, GPU pick과 cleanup을 Spatial에서 다시
구현하게 해 두 제품의 계약 drift와 유지비를 높인다.

대안 3은 공개 read-only Explorer와 유료 Spatial authoring의 제품·권한 경계를
무너뜨리고 Viewer event를 설계 authority로 오해하게 한다.

## 영향 범위

- `bim-surface/0.2`, `bim-spatial-integration/0.2`와
  `bim-reference-anchor/0.1`을 draft로 추가한다.
- `bim-federation/0.1`의 source-scoped identity와 alignment 원칙은 그대로
  재사용한다. 이 ADR만으로 federation v0.2를 만들지 않는다.
- 내부 package/제품 implementation과 private candidate compatibility evidence는
  Explorer가 독립 검증하되 public v0.2 tag와 release asset은 실제 consumer
  evidence 전까지 만들지 않는다.
- Coni Spatial은 standalone BIM Explorer 설치 없이 차기 public package를
  bundle하고, 자체 Workspace에서 external base와 authored 3D를 합성한다.
- Explorer의 MPL-2.0 공개 가치와 Spatial의 상용 authoring/revision 가치를
  분리한다.

## Rollback과 revisit

실제 consumer가 source별 surface를 독립적으로 여는 편이 더 단순하거나
federation lifecycle이 package 크기·성능·cleanup을 충족하지 못하면 v0.2
surface 대신 더 작은 protocol-only anchor boundary를 검토한다. reference
source의 stable face/topology identity가 실제 format에서 검증되면 anchor의
`derived` 안정성 범위를 새 version으로 확장한다. Explorer가 authoring
authority를 가져야 한다는 요구는 이 ADR을 수정하지 않고 별도 제품 ADR로
재검토한다.
