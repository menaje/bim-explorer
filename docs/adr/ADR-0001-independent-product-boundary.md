---
type: adr
status: accepted
authority:
  - independent-product-decision
  - repository-release-boundary
last_reviewed: 2026-08-03
decision_id: ADR-0001
---

# ADR-0001: 독립 BIM Explorer 제품·저장소·release

## Context

raw BIM의 구조·속성·관계와 3D 형상을 탐색하는 기능은 Agent authoring,
Spatial Revision, reconcile와 publish 없이도 독립 사용자 가치가 있습니다.
이를 Coni Spatial에만 두면 단순 model inspection도 유료 Spatial 제품과
Workspace authority에 종속됩니다.

동시에 새 저장소가 Viewer Core나 Spatial revision/change authority를
복제하면 같은 source가 제품마다 다른 identity, selection과 변경 의미를
갖게 됩니다.

## 비교한 대안

1. BIM read/explore와 generic 3D surface를 Coni Spatial에만 구현합니다.
2. BIM Explorer를 독립 저장소로 만들되 Viewer Core와 Spatial authority도
   복제합니다.
3. BIM Explorer를 독립 read-only 제품으로 만들고 public Viewer Core를
   소비하며 Spatial authority는 Coni Spatial에 유지합니다.
4. DWG Viewer와 BIM Explorer를 즉시 하나의 universal viewer로 합칩니다.

## Decision

대안 3을 선택합니다.

- repository와 product name은 `bim-explorer`입니다.
- 첫 vertical slice는 local-first read-only IFC입니다.
- Browser와 VS Code shell을 독립적으로 package합니다.
- raw BIM source fingerprint, source-local identity, Render/Pick mapping과
  generic 3D/BIM exploration은 이 저장소가 소유합니다.
- Workspace, Canonical Entity ID, revision/change/reconcile/accept/publish와
  delivery export는 `coni-spatial`이 소유합니다.
- Viewer Core와 render protocol은 durable public artifact만 소비하고
  구현을 복사하지 않습니다.
- 세 제품은 독립 tag/release lifecycle을 갖고 상대 standalone extension
  설치를 요구하지 않습니다.
- optional handoff는 versioned public payload로만 제공합니다.

Viewer event는 intent일 뿐 authority가 아닙니다. Explorer는 Spatial
accept/publish capability, credential와 Context Reference secret을
저장하거나 발급하지 않습니다.

## 거부 이유

대안 1은 공개 BIM 생태계와 standalone model inspection을 Spatial 설치와
상업 경계에 불필요하게 묶습니다.

대안 2는 source lifecycle, renderer와 identity contract를 fork하고
Explorer selection이 Spatial revision authority로 오인될 위험이 있습니다.

대안 4는 2D DWG와 BIM 3D의 engine, UX, performance와 release qualification을
한 제품에 결합해 각 vertical slice의 실패와 성공을 구분하기 어렵습니다.

## 영향 범위

- `docs/`, `specs/`, `packages/`, `apps/`, `adapters/`, `tests/`와
  `compatibility/`를 독립적으로 관리합니다.
- root package는 public release Gate 전 `private`와 `UNLICENSED`를
  유지합니다.
- Viewer Core와 IFC engine은 exact compatibility manifest 없이 dependency로
  추가하지 않습니다.
- Browser/VS Code Host는 source capability만 제공하고 parser/authority를
  소유하지 않습니다.
- Coni Spatial integration은 독립 Explorer 완료조건이 아닌 optional
  후속 package입니다.

## Rollback과 revisit

독립 BIM inspection 수요가 검증되지 않거나 세 제품의 유지비가 shared
core와 사용자 가치를 반복적으로 초과하면 packaging을 재검토합니다.

Viewer Core artifact를 독립적으로 소비할 수 없거나 source-local identity를
Spatial revision identity에 안전하게 연결할 수 없으면 package/protocol
경계를 새 ADR로 개정합니다.

결정을 철회할 때 BE-D-001을 `superseded`하고 README, product boundary,
compatibility manifest와 GitHub roadmap을 같은 변경에서 갱신합니다.
