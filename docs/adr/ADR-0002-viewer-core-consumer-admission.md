---
type: adr
status: accepted
authority:
  - viewer-core-consumer-admission
  - viewer-namespace-admission
last_reviewed: 2026-08-11
decision_id: ADR-0002
---

# ADR-0002: Viewer Core consumer admission

## Context

`menaje/dwg-viewer`는 source-neutral lifecycle, range, identity, selection과
delta contract의 첫 구현을 갖고 있습니다. 2026-08-03 최초 관찰에서는
`@dwg-viewer/*` private workspace package뿐이어서 외부 소비가 불가능했습니다.

2026-08-04 upstream은 중립 namespace의 `@menaje/viewer-core`와
`@menaje/viewer-render-protocol` package 0.1.2를 immutable GitHub prerelease
asset으로 발행했습니다. 현재 protocol ID는
`menaje-viewer-render-protocol/0.1.0`입니다.

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

대안 4를 선택했고, 2026-08-04 admission 조건을 public preview 범위에서
충족했습니다.

- Viewer Core 구현과 conformance fixture를 복사하지 않습니다.
- root와 package manifest에 sibling checkout `file:`, `link:` 또는
  `workspace:` dependency를 추가하지 않습니다.
- `@menaje/*` package와 protocol ID를 producer가 발행한 exact identity로
  소비합니다.
- `compatibility/viewer-core.json`이 observed upstream 상태, blocker와
  admission Gate를 소유합니다.
- release asset URL, SHA-256, npm integrity와 installed content digest를
  pin합니다.
- upstream conformance runner를 실제 `BimModelSource`, bounded 3D
  renderer와 Browser/VS Code Host에 실행합니다.
- `experimental` compatibility만 주장하며 prerelease를 stable/production
  compatibility로 자동 승격하지 않습니다.
- Coni Spatial은 자신의 저장소에서 같은 artifact를 별도로 pin하고
  consumer conformance를 통과해야 합니다.

2026-08-11 후속 admission에서 실제 IFC와 glTF/GLB Browser·VS Code 제품
entrypoint도 public Viewer Core를 통과했습니다. 내부 source/renderer protocol은
유지하고 얇은 generated adapter가 public RenderSource descriptor와 range,
selection event로 변환합니다. public runtime이 원본 session/Worker를 소유하며
기존 BIM Surface에는 borrowed no-op lease를 제공해 cleanup을 정확히 한 번
수행합니다. Coni Spatial integration과 stable/production 승격은 이 결정만으로
완료되지 않습니다.

## 거부 이유

대안 1은 bug fix와 protocol 의미가 저장소마다 갈라지고 source-neutral
core 원칙을 위반합니다.

대안 2는 개발자 machine의 directory layout에 의존하며 release artifact,
SBOM과 clean install을 재현하지 못합니다.

대안 3은 upstream producer가 발행하지 않은 package/protocol identity를
consumer가 발명해 상호운용성을 거짓으로 주장합니다.

## 영향 범위

- #3은 exact artifact와 3D consumer conformance로 완료할 수 있습니다.
- `BimModelSource`와 renderer의 Viewer Core Gate는 통과합니다.
- Browser/VS Code IFC·glTF·GLB 제품 entrypoint adoption Gate도 통과합니다.
- #4 IFC engine qualification은 Viewer Core source를 import하지 않는
  독립 process/fixture spike로 진행할 수 있습니다.
- BIM Explorer의 internal source protocol과 renderer contract는 그대로
  유지하고 얇은 public Viewer Core adapter에서 변환합니다.
- point-cloud 경로와 Spatial consumer admission은 독립 Gate로 유지합니다.

## Rollback과 revisit

upstream stable release가 나오면 새 asset digest, license/NOTICE와 migration
fixture를 재검증한 뒤 `qualified` 승격을 별도로 결정합니다. prerelease tag
이동이나 semver 범위만으로 자동 승격하지 않습니다.

3D consumer가 current contract의 2D camera/renderer assumption을 발견하면
기존 0.1 의미를 조용히 확장하지 않고 neutral next version과 migration
fixture를 공동 변경합니다.
