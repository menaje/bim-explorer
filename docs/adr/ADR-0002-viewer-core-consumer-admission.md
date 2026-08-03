---
type: adr
status: accepted
authority:
  - viewer-core-consumer-admission
  - viewer-namespace-hold
last_reviewed: 2026-08-03
decision_id: ADR-0002
---

# ADR-0002: Viewer Core consumer admission과 namespace 보류

## Context

`menaje/dwg-viewer`는 source-neutral lifecycle, range, identity, selection과
delta contract의 첫 구현을 갖고 있습니다. 그러나 2026-08-03 관찰한
package는 `@dwg-viewer/viewer-core`와 `@dwg-viewer/render-protocol` 0.1.0,
`private`, `workspace-only`, `experimental`입니다. protocol ID도
`dwg-viewer-render-protocol/0.1.0`입니다.

BIM Explorer가 이를 상대 checkout의 `file:`/`workspace:` dependency로
사용하면 standalone clean install과 durable compatibility를 증명하지
못합니다. 반대로 conformance code를 복사하면 같은 이름의 서로 다른
protocol이 생깁니다.

## 비교한 대안

1. 현재 upstream package source와 conformance를 이 저장소에 복사합니다.
2. sibling checkout에 대한 relative `file:` dependency를 사용합니다.
3. package 이름과 protocol ID를 이 저장소에서 임의로 중립 이름으로
   재정의합니다.
4. upstream durable artifact, coordinated namespace decision과 3D
   conformance가 준비될 때까지 compatibility를 `unresolved`로 유지합니다.

## Decision

대안 4를 선택합니다.

- Viewer Core 구현과 conformance fixture를 복사하지 않습니다.
- root와 package manifest에 sibling checkout `file:`, `link:` 또는
  `workspace:` dependency를 추가하지 않습니다.
- current `@dwg-viewer/*` 이름과 protocol ID를 BIM Explorer의 public
  compatibility로 주장하지 않습니다.
- `compatibility/viewer-core.json`이 observed upstream 상태, blocker와
  admission Gate를 소유합니다.
- durable artifact가 준비되면 exact artifact digest/version을 pin하고
  upstream conformance runner를 실제 `BimModelSource`와 3D Host에
  실행합니다.
- neutral namespace는 DWG Viewer, BIM Explorer와 Coni Spatial이 같은
  breaking release/migration fixture에 합의한 뒤 확정합니다.

현재 상태 검증은 성공적인 호환성 주장이 아니라 과장된 pin과 relative
checkout 결합을 막는 repository Gate입니다.

## 거부 이유

대안 1은 bug fix와 protocol 의미가 저장소마다 갈라지고 source-neutral
core 원칙을 위반합니다.

대안 2는 개발자 machine의 directory layout에 의존하며 release artifact,
SBOM과 clean install을 재현하지 못합니다.

대안 3은 upstream producer가 발행하지 않은 package/protocol identity를
consumer가 발명해 상호운용성을 거짓으로 주장합니다.

## 영향 범위

- #3은 compatibility manifest와 admission checker부터 진행합니다.
- `BimModelSource` conformance, renderer contract와 cross-repository CI는
  durable upstream artifact 전까지 미완료로 남습니다.
- #4 IFC engine qualification은 Viewer Core source를 import하지 않는
  독립 process/fixture spike로 진행할 수 있습니다.
- public package가 나오기 전 BIM Explorer source/renderer 구현은 internal
  interface일 수 있지만 Viewer Core 호환을 표시하지 않습니다.

## Rollback과 revisit

upstream이 public package 또는 immutable GitHub Release artifact, exact
protocol version, license metadata와 reusable conformance runner를 제공하면
manifest를 `experimental`로 올리고 실제 3D consumer test를 실행합니다.

3D consumer가 current contract의 2D camera/renderer assumption을 발견하면
기존 0.1 의미를 조용히 확장하지 않고 neutral next version과 migration
fixture를 공동 변경합니다.
