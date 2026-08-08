---
type: adr
status: accepted
authority:
  - reusable-bim-surface
  - package-consumer-boundary
  - product-composition
last_reviewed: 2026-08-09
decision_id: ADR-0003
---

# ADR-0003: BIM Explorer를 host-neutral BIM Surface로 재사용한다

## Context

BIM Explorer Browser와 VS Code 제품은 `BimModelSource`, bounded 3D host와
semantic explorer를 같은 순서로 합성하지만, 이 수명주기는 제품 UI에 직접
묶여 있었습니다. Coni Spatial이 immutable IFC base와 Spatial live/diff
layer를 같은 source identity로 구성하려면 설치된 Explorer extension이나
상대 저장소 source path가 아니라 exact-pin 가능한 공개 경계가 필요합니다.

제품 이름은 BIM Explorer가 적절하지만, 외부 제품이 재사용하는 것은 파일
선택과 전체 탐색 UI가 아니라 한 BIM source의 표시·탐색 수명주기입니다.

## 비교한 대안

1. Coni Spatial이 설치된 BIM Explorer extension 또는 private message를
   호출한다.
2. 소비자가 `bim-model-source`, `bim-renderer-3d`,
   `bim-semantic-explorer`를 각각 조합한다.
3. Browser 제품 bundle 전체를 iframe 또는 Webview로 삽입한다.
4. 단일 host-neutral `@bim-explorer/bim-surface` entrypoint를 제공한다.

## Decision

대안 4를 선택합니다. `bim-surface/0.1`은 source session, bounded 3D host,
semantic explorer의 open·initial selection·dispose를 하나의 read-only
수명주기로 소유합니다. Browser와 VS Code 제품은 이 entrypoint를 실제로
사용합니다.

패키지는 DOM, file chooser, network, Spatial private package와 Workspace
capability를 포함하지 않습니다. Canonical Entity ID, revision mutation,
accept, publish와 export authority는 모두 `false`입니다. optional Spatial
integration factory는 public provider contract로만 포함하며 실제 bridge와
authority는 소비자가 명시적으로 제공합니다.

저장소 manifest는 `private: true`를 유지합니다. 별도 release-candidate
stage만 publish 가능한 manifest로 바꾸고 MPL-2.0, NOTICE와 SOURCE_OFFER를
포함해 두 번 패킹합니다. byte parity와 offline clean install은 package
Gate지만 public release asset 또는 registry publication 주장은 아닙니다.

experimental point reference renderer는 이 BIM surface entrypoint에
포함하지 않습니다. 제품은 필요한 point runtime을 별도 source-neutral
경계로 계속 조합합니다.

## 거부 이유

대안 1은 제품 설치 상태와 private runtime을 결합하고 독립 release 원칙을
위반합니다. 대안 2는 각 소비자가 lifecycle 순서, source identity와 cleanup을
다시 구현하게 해 drift 가능성을 높입니다. 대안 3은 UI와 DOM ownership을
강제해 Spatial의 자체 product shell 및 service-owned authority와 충돌합니다.

## 영향 범위

- BIM Explorer Browser와 VS Code shared app은 IFC 경로에서 `bim-surface`
  수명주기를 사용합니다.
- glTF/GLB reference mesh와 E57/LAS/LAZ point reference는 기존의 명시적
  source-role 분기를 유지합니다.
- 외부 소비자는 하나의 zero-runtime-dependency ESM artifact를 exact pin할
  수 있습니다.
- 실제 Coni Spatial checkout, issue와 bundle은 이 결정만으로 변경하지
  않습니다. consumer conformance는 Spatial 저장소가 소유합니다.

## Rollback과 revisit

surface가 둘 이상의 실제 host에서 공통 lifecycle을 유지하지 못하거나 public
consumer가 더 작은 protocol-only 경계를 요구하면 package export와 contract
version을 재검토합니다. 실제 Spatial consumer가 새 요구를 증명하기 전에는
Workspace authority나 Spatial private implementation을 surface에 추가하지
않습니다. public publication은 immutable release asset과 consumer admission
Gate가 별도로 승인할 때만 진행합니다.
