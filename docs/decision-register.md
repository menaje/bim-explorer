---
type: register
status: active
authority:
  - fact-register
  - decision-register
  - open-question-register
last_reviewed: 2026-08-03
---

# 결정 대장

## 확인된 사실

| ID | 사실 | 근거 | 제한 |
| --- | --- | --- | --- |
| BE-F-001 | `bim-explorer`는 `menaje/bim-explorer`의 독립 저장소와 `main` branch를 가진다. | repository remote와 Git history | public release를 의미하지 않음 |
| BE-F-002 | upstream Viewer Core/render protocol은 2026-08-03 기준 `@dwg-viewer/*` 0.1.0, `private`, `workspace-only`, `experimental`이다. | `menaje/dwg-viewer` compatibility manifest와 package metadata | durable external artifact와 3D conformance는 없음 |
| BE-F-003 | upstream render protocol vocabulary에는 `3d` representation, source/session/snapshot, range, identity와 ordered delta 항목이 있다. | `menaje/dwg-viewer` render protocol source | 실제 BIM 3D consumer를 검증한 것은 아님 |
| BE-F-004 | exact upstream commit을 명시한 local probe에서 BIM mock source lifecycle, 3D mount, GlobalId external identity, ordered delta, Browser/VS Code disposal와 stale/out-of-order 거부가 공용 runner를 통과했다. | [Local Viewer Core probe](../compatibility/evidence/viewer-core-local-probe-2026-08-03.json) | sibling checkout을 주입한 결과이며 durable artifact, clean install과 production GPU를 검증하지 않음 |

## 적용 결정

| ID | 상태 | 결정 | Authority | Revisit |
| --- | --- | --- | --- | --- |
| BE-D-001 | accepted | BIM Explorer를 raw BIM read/index/render와 generic 3D exploration을 소유하는 독립 제품·저장소·release로 유지한다. | [ADR-0001](adr/ADR-0001-independent-product-boundary.md) | 독립 수요와 유지비가 제품 가치를 반복적으로 부정할 때 |
| BE-D-002 | accepted | 첫 vertical slice는 local-first read-only IFC이며 production mutation을 주장하지 않는다. | [제품 경계](product-boundary.md) | qualified user task와 writer evidence가 생길 때 |
| BE-D-003 | accepted | Viewer/Host event는 Spatial authority를 발급하지 않고 accept/publish/export를 수행하지 않는다. | [제품 경계](product-boundary.md#identity-경계) | Spatial security ADR가 새 public authority contract를 제공할 때 |
| BE-D-004 | accepted | Viewer Core를 복사하거나 상대 checkout `file:` dependency로 사용하지 않고 durable artifact와 conformance를 admission Gate로 둔다. | [ADR-0002](adr/ADR-0002-viewer-core-consumer-admission.md) | upstream distribution과 neutral version이 준비될 때 |

## 열린 질문

| ID | 상태 | 질문 | 현재 처리 | 결정 Gate |
| --- | --- | --- | --- | --- |
| BE-Q-001 | held | 첫 public Viewer Core package와 neutral namespace는 무엇인가 | upstream `@dwg-viewer/*`를 external compatibility로 주장하지 않음 | durable artifact, 3D consumer와 cross-repository CI |
| BE-Q-002 | held | 첫 IFC engine과 implementation profile은 무엇인가 | IfcOpenShell/web-ifc 후보만 유지 | #4 license·geometry·identity·performance qualification |
| BE-Q-003 | held | BIM Explorer와 public protocol의 최종 라이선스는 무엇인가 | MPL-2.0/Apache-2.0 후보, root는 UNLICENSED | dependency 결합·redistribution·법률 검토 |
| BE-Q-004 | held | Browser와 Desktop의 첫 3D GPU backend는 무엇인가 | renderer contract와 task corpus를 먼저 고정 | #6 prototype과 memory/disposal benchmark |
| BE-Q-005 | held | optional Spatial handoff payload의 first version은 무엇인가 | source fingerprint/native identity/viewpoint 최소 원칙만 유지 | #9 threat model과 end-to-end fixture |
