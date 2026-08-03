---
type: register
status: active
authority:
  - fact-register
  - decision-register
  - open-question-register
last_reviewed: 2026-08-04
---

# 결정 대장

## 확인된 사실

| ID | 사실 | 근거 | 제한 |
| --- | --- | --- | --- |
| BE-F-001 | `bim-explorer`는 `menaje/bim-explorer`의 독립 저장소와 `main` branch를 가진다. | repository remote와 Git history | public release를 의미하지 않음 |
| BE-F-002 | upstream Viewer Core/render protocol은 2026-08-03 기준 `@dwg-viewer/*` 0.1.0, `private`, `workspace-only`, `experimental`이다. | `menaje/dwg-viewer` compatibility manifest와 package metadata | durable external artifact와 3D conformance는 없음 |
| BE-F-003 | upstream render protocol vocabulary에는 `3d` representation, source/session/snapshot, range, identity와 ordered delta 항목이 있다. | `menaje/dwg-viewer` render protocol source | 실제 BIM 3D consumer를 검증한 것은 아님 |
| BE-F-004 | exact upstream commit을 명시한 local probe에서 BIM mock source lifecycle, 3D mount, GlobalId external identity, ordered delta, Browser/VS Code disposal와 stale/out-of-order 거부가 공용 runner를 통과했다. | [Local Viewer Core probe](../compatibility/evidence/viewer-core-local-probe-2026-08-03.json) | sibling checkout을 주입한 결과이며 durable artifact, clean install과 production GPU를 검증하지 않음 |
| BE-F-005 | web-ifc 0.0.77과 IfcOpenShell 0.8.4.post1이 같은 generated IFC4 base fixture의 semantic, GlobalId/Express ID, relation, 12-triangle geometry와 world bounds assertion을 각각 두 번 통과했다. | [IFC base evidence](../compatibility/evidence/ifc-engine-synthetic-small-2026-08-03.json) | 2.9KB synthetic macOS 관찰이며 large/corrupt/Browser/redistribution을 검증하지 않음 |
| BE-F-006 | 두 engine은 두 Wall이 한 representation map을 재사용하는 fixture에서 occurrence별 placement, Qto, classification, 21개 GlobalId–Express ID map과 24-triangle 결과를 각각 두 번 재현했다. | [IFC mapped evidence](../compatibility/evidence/ifc-engine-synthetic-mapped-2026-08-03.json) | 4KB synthetic wall corpus이며 broader relation, GPU instance memory와 large/corrupt model을 검증하지 않음 |
| BE-F-007 | web-ifc 0.0.77 single-thread WASM은 local Chromium module Worker에서 base fixture의 IFC4, 1 Project, 1 Wall과 12 triangles를 재현하고 model close·engine dispose 뒤 Worker 종료를 요청했다. | [Browser Worker smoke](../compatibility/evidence/web-ifc-browser-worker-smoke-2026-08-03.json) | 한 번의 loopback small-fixture 관찰이며 real file lifecycle, large/cancel/negative input, clean package와 VS Code를 검증하지 않음 |
| BE-F-008 | 실제 Browser file chooser로 repository-generated mapped IFC를 선택해 IFC4, 1 Project, 2 Walls와 24 triangles를 재현했다. 64 MiB size-before-read, 파일명 비전송, source 교체·stale 억제·cancel·terminal dispose 계약도 통과했다. | [Browser local-file lifecycle](../compatibility/evidence/web-ifc-browser-local-file-2026-08-03.json) | active 교체와 취소는 client conformance이며 engine-cooperative cancellation, negative/large model과 production package를 검증하지 않음 |
| BE-F-009 | 실제 local Chromium에서 유효한 generated IFC4를 연 뒤 `model-opened` checkpoint 취소가 model close·engine dispose 영수증을 반환했고, 이어진 새 Worker parse도 통과했다. | [Browser checkpoint cancellation](../compatibility/evidence/web-ifc-browser-checkpoint-cancellation-2026-08-03.json) | 2.9KB fixture의 adapter checkpoint 관찰이며 실행 중 동기 engine 호출의 선점, negative/large model과 production package를 검증하지 않음 |
| BE-F-010 | 실제 local Chromium에서 388,316-byte generated IFC4의 1,024 Walls·1,024 products·12,288 triangles를 Worker total 48.3ms, wall clock 149.7ms, 관찰 WASM heap capacity 139,788,288 bytes로 처리하고 cleanup·후속 작은 fixture 복구를 확인했다. | [Browser bounded performance](../compatibility/evidence/web-ifc-browser-bounded-performance-2026-08-03.json) | 한 번의 synthetic scale-step 관찰이며 대표 대형 모델, live/peak process·GPU memory, first frame, redistribution과 package를 검증하지 않음 |
| BE-F-011 | CC BY 4.0 Schependomlaan IFC2X3를 고정 commit과 archive/entry SHA-256으로 검증했다. 46,766,968 bytes, 3,569 geometry products·261,424 triangles를 web-ifc Node에서 두 번 약 0.77–0.78초·peak RSS 312–315MB로, 실제 Chromium Worker에서 0.76초·wall clock 0.86초·WASM capacity 140MB로 처리하고 cleanup·복구를 확인했다. | [public Node](../compatibility/evidence/web-ifc-public-representative-node-performance-2026-08-03.json), [public Browser](../compatibility/evidence/web-ifc-browser-public-representative-performance-2026-08-03.json) | performance-only IFC2X3이며 draft IFC4 profile, GPU upload, render first-frame, bundling과 production package를 승인하지 않음 |
| BE-F-012 | 내부 read-only `BimModelSource`가 4,028-byte generated mapped IFC4의 raw fingerprint, 7-node tree, 두 Wall의 semantic/Render/Pick identity와 996-byte shared binary geometry range를 동일 revision에 묶고 deterministic cache, bounded read, stale·malformed 거부와 cleanup을 통과했다. | [source compatibility](../compatibility/bim-model-source.json), [source evidence](../compatibility/evidence/bim-model-source-synthetic-mapped-2026-08-03.json) | synthetic-only 내부 계약이며 public representative source-artifact, multi-range lazy loading과 Viewer Core conformance는 없음 |
| BE-F-013 | 고정된 46,766,968-byte 공개 IFC2X3를 read-only source artifact로 두 번 투영해 3,569 products·261,424 triangles, 3개 geometry range, 첫 range 단독 bounded read와 동일 cache identity를 재현했다. 65개 empty-tessellation product는 source identity와 diagnostic을 유지하고 Render/Pick ID를 받지 않는다. | [source compatibility](../compatibility/bim-model-source.json), [public source evidence](../compatibility/evidence/bim-model-source-public-representative-2026-08-04.json) | performance-only source 단계이며 rendered first-frame, deferred property range, Viewer Core conformance와 IFC2X3 profile admission을 검증하지 않음 |

## 적용 결정

| ID | 상태 | 결정 | Authority | Revisit |
| --- | --- | --- | --- | --- |
| BE-D-001 | accepted | BIM Explorer를 raw BIM read/index/render와 generic 3D exploration을 소유하는 독립 제품·저장소·release로 유지한다. | [ADR-0001](adr/ADR-0001-independent-product-boundary.md) | 독립 수요와 유지비가 제품 가치를 반복적으로 부정할 때 |
| BE-D-002 | accepted | 첫 vertical slice는 local-first read-only IFC이며 production mutation을 주장하지 않는다. | [제품 경계](product-boundary.md) | qualified user task와 writer evidence가 생길 때 |
| BE-D-003 | accepted | Viewer/Host event는 Spatial authority를 발급하지 않고 accept/publish/export를 수행하지 않는다. | [제품 경계](product-boundary.md#identity-경계) | Spatial security ADR가 새 public authority contract를 제공할 때 |
| BE-D-004 | accepted | Viewer Core를 복사하거나 상대 checkout `file:` dependency로 사용하지 않고 durable artifact와 conformance를 admission Gate로 둔다. | [ADR-0002](adr/ADR-0002-viewer-core-consumer-admission.md) | upstream distribution과 neutral version이 준비될 때 |
| BE-D-005 | accepted | IFC engine은 같은 report contract와 fixture로 비교하고 read/render와 write/round-trip admission을 분리한다. | [IFC qualification](ifc-engine-qualification.md) | engine/profile selection이 승인될 때 |

## 열린 질문

| ID | 상태 | 질문 | 현재 처리 | 결정 Gate |
| --- | --- | --- | --- | --- |
| BE-Q-001 | held | 첫 public Viewer Core package와 neutral namespace는 무엇인가 | upstream `@dwg-viewer/*`를 external compatibility로 주장하지 않음 | durable artifact, 3D consumer와 cross-repository CI |
| BE-Q-002 | held | 첫 IFC engine과 implementation profile은 무엇인가 | 두 후보의 base/mapped fixture와 web-ifc Browser lifecycle·checkpoint cancellation·공개 대표 모델 Node/Browser parse prototype은 통과했지만 선정은 보류 | #4 negative corpus, in-call cancellation, renderer first-frame/GPU, Browser package와 license qualification |
| BE-Q-003 | held | BIM Explorer와 public protocol의 최종 라이선스는 무엇인가 | MPL-2.0/Apache-2.0 후보, root는 UNLICENSED | dependency 결합·redistribution·법률 검토 |
| BE-Q-004 | held | Browser와 Desktop의 첫 3D GPU backend는 무엇인가 | renderer contract와 task corpus를 먼저 고정 | #6 prototype과 memory/disposal benchmark |
| BE-Q-005 | held | optional Spatial handoff payload의 first version은 무엇인가 | source fingerprint/native identity/viewpoint 최소 원칙만 유지 | #9 threat model과 end-to-end fixture |
