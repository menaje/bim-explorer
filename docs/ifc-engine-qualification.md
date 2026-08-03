---
type: qualification
status: active
authority:
  - ifc-engine-candidate-evidence
  - draft-ifc-implementation-profile
  - engine-selection-gates
last_reviewed: 2026-08-04
---

# IFC engine qualification

## 결론

`web-ifc@0.0.77`과 `ifcopenshell@0.8.4.post1`은 같은 repository-authored
IFC4 base와 mapped/shared synthetic fixture에서 semantic, GlobalId–Express
ID identity, relation, quantity, classification, extrusion geometry와 IFC
world bounds assertion을 통과했습니다. 그러나 첫 engine 선정과 production
go/no-go는 보류합니다.

`web-ifc`는 local Chromium module Worker에서 single-thread WASM으로 base
fixture를 읽는 첫 smoke와 실제 file chooser를 통한 bounded local-file
lifecycle, 유효한 IFC가 열린 뒤 checkpoint 취소·정리 prototype을
통과했습니다. 1,024-Wall generated fixture의 bounded Browser 시간·WASM
heap-capacity budget도 통과했습니다. 이어서 CC BY 4.0 Schependomlaan
IFC2X3 46.77MB를 고정 digest로 검증하고 Node CPU/RSS와 실제 Chromium
Worker parse/geometry budget을 통과했습니다. JavaScript/WASM 경로를
Browser와 VS Code surface에서 공유할 가능성을 확인한 것이며 선정 결정이나
IFC2X3 profile 승격은 아닙니다. Browser WebGL2 first-frame prototype도
통과했지만 Browser packaging, visibility·interaction, 실행 중 동기 engine
호출의 취소와 negative-input cleanup을 통과하지 못하면 IfcOpenShell
native process를 desktop fallback으로 재평가합니다.

같은 공개 fixture를 별도 `BimModelSource` artifact로 투영한 결과는
[`public source evidence`](../compatibility/evidence/bim-model-source-public-representative-2026-08-04.json)가
소유합니다. 이 결과도 engine selection이 아니라 bounded read-only source
단계의 입력 증거입니다.

이 source의 첫 geometry range를 headless와 실제 Browser WebGL2 backend에
연결한 결과는
[`headless renderer evidence`](../compatibility/evidence/bim-renderer-3d-public-headless-2026-08-04.json)와
[`Browser WebGL2 evidence`](../compatibility/evidence/bim-renderer-3d-public-browser-webgl2-2026-08-04.json)가
소유합니다. WebGL2 GPU API upload·rasterized first frame·dispose Gate는
통과했지만 physical GPU·memory나 engine/profile 선정을 의미하지 않습니다.

지원 상태의 authority는
[`compatibility/ifc-engines.json`](../compatibility/ifc-engines.json),
실행 관찰값은
[`base evidence`](../compatibility/evidence/ifc-engine-synthetic-small-2026-08-03.json)와
[`mapped evidence`](../compatibility/evidence/ifc-engine-synthetic-mapped-2026-08-03.json),
Browser 관찰값은
[`Worker smoke`](../compatibility/evidence/web-ifc-browser-worker-smoke-2026-08-03.json)와
[`local-file lifecycle`](../compatibility/evidence/web-ifc-browser-local-file-2026-08-03.json),
[`checkpoint cancellation`](../compatibility/evidence/web-ifc-browser-checkpoint-cancellation-2026-08-03.json),
[`bounded performance`](../compatibility/evidence/web-ifc-browser-bounded-performance-2026-08-03.json),
[`public Node performance`](../compatibility/evidence/web-ifc-public-representative-node-performance-2026-08-03.json)와
[`public Browser performance`](../compatibility/evidence/web-ifc-browser-public-representative-performance-2026-08-03.json)가
소유합니다.

## 동일 fixture 관찰

2026-08-03 macOS arm64에서 두 engine을 각각 새 child process로 두 번
실행했습니다.

| 항목 | web-ifc | IfcOpenShell | 공통 판정 |
| --- | --- | --- | --- |
| Engine/backend | 0.0.77, Node WASM process | 0.8.4.post1, Python native process | exact version 기록 |
| Schema/view | IFC4 / ReferenceView_V1.2 | IFC4 / ReferenceView_V1.2 | 일치 |
| 공간 계층 | Project→Site→Building→Storey | 동일 | 일치 |
| Wall 의미 | type, occurrence/type Pset, Concrete | 동일 | 일치 |
| GlobalId | 17, duplicate 0, missing 0 | 동일 | 일치 |
| GlobalId–Express ID | 17-entry map digest | 동일 | 반복·engine 간 일치 |
| Geometry | 1 product, 12 triangles | 동일 | 일치 |
| IFC world bounds | `[0,0.9,0]`–`[4,1.1,3]` | 동일 | 일치 |
| Engine vertex records | 34 | 8 | 비교 기준에서 제외 |
| 반복 fingerprint | 동일 | 동일 | engine별 deterministic |
| explicit engine cleanup | close/dispose 확인 | process exit가 cleanup 경계 | 추가 검증 필요 |

mapped fixture는 두 Wall occurrence가 하나의 `IfcRepresentationMap`을 두
`IfcMappedItem`으로 재사용합니다.
[buildingSMART의 representation 정의](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcrepresentationresource/lexical/ifcrepresentation.htm)에
따르면 representation map은 하나의 표현을 여러 product가 공유하는
경로입니다. Quantity는
[IfcElementQuantity](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcproductextension/lexical/ifcelementquantity.htm),
classification은
[IfcRelAssociatesClassification](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifckernel/lexical/ifcrelassociatesclassification.htm)
관계로 연결합니다.

| 항목 | web-ifc | IfcOpenShell | 공통 판정 |
| --- | --- | --- | --- |
| Mapping graph | map 1, item 2, product 2, source 1 | 동일 | 공유 관계 보존 |
| Occurrence bounds | Y 0.9–1.1 / 4.9–5.1 | 동일 | 개별 placement 일치 |
| Qto | Length 4, area 12, volume 2.4 | 동일 | 일치 |
| Classification | `BE-WALL` | 동일 | source/name 포함 일치 |
| Identity | 21 GlobalId–Express ID entries | 동일 | digest 일치 |
| Geometry | 2 products, 24 triangles | 동일 | 일치 |
| Engine vertex records | 68 | 16 | 비교 기준에서 제외 |

정점 record 수는 tessellator의 normal/vertex expansion 전략에 따라 달라질 수
있으므로 cross-engine correctness 기준이 아닙니다. 이 단계에서는 semantic
snapshot, triangle count, coordinate basis와 bounds를 비교합니다.

측정된 adapter 내부 total은 web-ifc 약 30–32ms, IfcOpenShell 약 3–5ms였고
child process wall clock은 양쪽 모두 약 192–226ms였습니다. 이는 2.9KB와
4KB synthetic fixture의 개발 장비 관찰값일 뿐입니다. module import/cache
영향과 실제 첫 화면을 대표하지 않으므로 성능 우열이나 production budget
근거로 사용하지 않습니다.

## Browser Worker, local-file, cancellation과 bounded performance

loopback-only 진단 surface는 exact `web-ifc@0.0.77` ESM과
`web-ifc.wasm`을 dedicated module Worker에서 single-thread로
초기화했습니다. generated base fixture는 IFC4, 1 Project, 1 Wall,
1 geometry product와 12 triangles를 반환했고 model close·engine dispose
후 main thread가 Worker 종료를 요청했습니다. 콘솔 warning/error는
관찰되지 않았습니다.

같은 surface에서 실제 file chooser로 repository-generated mapped fixture를
선택했을 때 IFC4, 1 Project, 2 Walls, 2 geometry products와 24 triangles를
재현했습니다. 파일명과 path 없이 safe source descriptor와 bytes만 Worker에
보냈고, 완료 후 base fixture로 전환했을 때 이전 결과가 다시 나타나지
않았습니다. source-session conformance는 64 MiB 초과 source의
size-before-read admission, active source 교체, explicit cancel, stale 억제와
terminal dispose를 검사합니다.

취소 probe는 `engine-initialized`, `model-opened`,
`inspection-complete` checkpoint마다 main thread의 `continue`를 기다립니다.
실제 local Chromium에서 generated base IFC가 열린 직후 취소를 요청했고,
Worker는 model close와 engine dispose를 수행한 뒤
`cancelled-cooperative` 영수증을 반환했습니다. 500ms grace 안에 응답하지
않는 Worker는 강제 종료하며, 취소 뒤 새 Worker로 같은 fixture를 정상
처리했습니다. 두 실행 모두 콘솔 warning/error가 없었습니다.

별도 performance probe는 하나의 representation map을 사용하는 generated
IFC4 1,024 Walls·1,024 products·12,288 triangles를 실제 local Chromium에서
처리했습니다. source는 388,316 bytes였고 Worker 내부 init 12.7ms, open
7.1ms, inspection 27.6ms, total 48.3ms, main-thread 관찰 wall clock 149.7ms를
기록했습니다. WASM linear-memory capacity는 init 뒤 16,777,216 bytes,
open/inspection 뒤 139,788,288 bytes였으며 256 MiB budget 안이었습니다.
model close·engine dispose와 Worker 종료 뒤 새 Worker의 base fixture 처리도
통과했고 console warning/error는 없었습니다.

공개 대표 성능 fixture는 buildingSMART Community Sample Test Files의
Schependomlaan `ROOT-Compleet.ifczip`입니다. 고정 commit의 8,873,221-byte
archive와 내부 단일 46,766,968-byte IFC를 각각 SHA-256으로 검증하며,
archive는 보관하지 않고 추출 파일은 ignored local cache에만 둡니다.
upstream license는 CC BY 4.0이고 attribution은 `(C) original authors`입니다.

web-ifc Node 격리 process 두 번은 IFC2X3, 1 Project, 652 Walls, 3,708
IfcProduct-derived entities, 3,569 geometry products·6,105 geometries·261,424
triangles를 동일하게 반환했습니다. adapter total은 약 0.77–0.78초, child
wall clock은 약 0.98–1.03초, peak RSS는 약 312–315MB였습니다. 실제 local
Chromium Worker는 같은 source를 init 12.3ms, open 421.8ms, inspection
297.4ms, total 761.1ms와 wall clock 857.3ms로 처리했습니다. WASM
linear-memory capacity는 139,788,288 bytes였고 model/engine cleanup,
Worker 종료와 후속 작은 fixture 복구도 통과했습니다. console
warning/error는 없었습니다.

공개 대표 source의 Node CPU/RSS와 Browser parse/geometry Gate만
통과했습니다. 64 MiB admission과 WASM capacity는 Browser live process나
GPU memory가 아니며 Worker는 mesh를 renderer에 upload하거나 frame을 그리지
않습니다. checkpoint cleanup도 실행 중인 synchronous `web-ifc` 호출을
선점하는 증거가 아닙니다. 별도 WebGL2 renderer evidence가 GPU API
first-frame을 검증했지만 physical GPU memory, visibility·interaction,
negative model, clean-install bundle, Linux Browser CI와 VS Code isolation을
검증하지 않았으므로 `largeModelPerformance`, candidate operation matrix의
`cancellation`, `corruptInputCleanup`과 `packagingBrowser`는 계속
`blocked`입니다.

## Draft implementation profile

현재 profile은 다음만 `experimental`입니다.

- STEP serialization의 IFC4 `ReferenceView_V1.2`
- Project/Site/Building/BuildingStorey/Space와 aggregation/containment
- IfcWall occurrence, IfcWallType, occurrence/type property set와 material
- GlobalId completeness/duplicate diagnostic, Express ID map과 source digest
- IfcExtrudedAreaSolid tessellation과 IFC world Z-up placement bounds
- IfcRepresentationMap/IfcMappedItem 기반 두 occurrence의 shared definition
- IfcElementQuantity의 length/area/volume과 classification reference
- local read-only parse/index/geometry report
- local Chromium module Worker의 small-fixture ESM/WASM smoke
- bounded local-file admission과 source-session lifecycle prototype
- 유효한 IFC의 model-opened checkpoint cooperative cleanup prototype
- generated 1,024-Wall fixture의 bounded Browser time/WASM-capacity prototype

공개 IFC2X3 관찰은 engine의 대표 parse/geometry 성능을 재기 위한
performance-only Gate입니다. 아래 draft IFC4 profile의 schema나 exchange
scenario에 포함하지 않습니다.

다음은 `blocked`입니다.

- IFC2X3, IFC4.3와 그 외 exchange scenario
- connection, system, opening과 broader object/relation corpus
- corrupt/truncated input과 resource exhaustion cleanup
- 실행 중 동기 engine 호출의 취소와 candidate-level cancellation 승인
- visibility 기반 first frame, physical GPU memory와 context-loss recovery
- production Browser, Linux와 VS Code packaging
- IFC write, mutation과 round-trip

따라서 “IFC 지원”이나 “BIM 전체 지원”이라고 표현하지 않습니다. 해당
profile을 통과한 read-only exploration만 단계적으로 지원 대상으로 올립니다.

## Operation matrix

`native`, `mapped`, `opaque`, `lossy`, `blocked`의 의미는
[IFC engine contract](../packages/ifc-engine-contract/README.md)가 정의합니다.

| Operation | web-ifc | IfcOpenShell |
| --- | --- | --- |
| parse / geometry / identity | native | native |
| semantic index | mapped | native |
| placement | mapped | mapped |
| type/Pset/material | mapped | mapped |
| relations | mapped | native |
| mapped/shared/Qto/classification | mapped | mapped |
| cancellation/corrupt cleanup | blocked | blocked |
| write/round-trip | blocked | blocked |
| verified packaging | macOS Node only | macOS Python wheel only |

전체 machine-readable matrix는 compatibility manifest를 따릅니다.

## License와 packaging

web-ifc upstream은 Node와 Browser용 WASM engine이며 저장소 license를
MPL-2.0으로 공개합니다. 현재 npm dependency는 exact version과 integrity로
고정했습니다.

IfcOpenShell은 공식 설치 문서가 Python package 설치를 안내하고, upstream
repository는 library와 executable의 license 범위를 구분합니다. 이번
evidence는 ephemeral Python 3.12 environment에서 library를 동적으로 호출한
결과입니다. wheel hash, bundle 방식과 source/notice 의무는 확정하지
않았습니다.

Schependomlaan performance source는
buildingSMART Community Sample Test Files의 고정 commit에서 내려받습니다.
저장소 `LICENSE`는 원저작자 표시와 CC BY 4.0을 명시합니다. 현재 command는
source를 재배포하지 않고 on-demand local cache만 만들며, product bundle
포함은 별도 release/legal Gate로 유지합니다.

- [web-ifc upstream](https://github.com/ThatOpen/engine_web-ifc)
- [web-ifc license](https://github.com/ThatOpen/engine_web-ifc/blob/master/LICENSE.md)
- [IfcOpenShell upstream](https://github.com/IfcOpenShell/IfcOpenShell)
- [IfcOpenShell Python installation](https://docs.ifcopenshell.org/ifcopenshell-python/installation.html)
- [Community Sample Test Files](https://github.com/buildingsmart-community/Community-Sample-Test-Files)
- [Public fixture license](https://github.com/buildingsmart-community/Community-Sample-Test-Files/blob/7ddf57a201f88a0c213d5322b02ed15e94a60a40/LICENSE)

법률 검토와 public release Gate 전에는 어느 후보도 production
redistribution 가능하다고 주장하지 않습니다.

## 재현

web-ifc는 repository lockfile만 사용합니다.

```sh
npm ci
npm run qualify:ifc:web
npm run qualify:ifc:mapped
npm run fetch:ifc:public
npm run qualify:ifc:public
npm run qualify:bim-source:public
npm run qualify:renderer:public
npm run probe:browser-worker
```

Browser probe에서는 **Run cancellation probe**로 model-opened checkpoint
cleanup을 확인합니다. **Run performance probe**로 1,024-Wall budget을
검사합니다. **Run public representative probe**로 고정 digest의 46.77MB
IFC2X3 parse/geometry budget을 검사하고, 이어서 **Run synthetic IFC
probe**로 새 Worker의 정상 복구를 확인합니다.

두 후보 비교에는 별도 Python environment를 주입합니다.

```sh
python3.12 -m venv .qualification-venv
.qualification-venv/bin/python -m pip install ifcopenshell==0.8.4.post1
node scripts/qualify-ifc-engine.mjs \
  --engine all \
  --fixture mapped \
  --python .qualification-venv/bin/python
```

synthetic qualification command는 매번 임시 `.ifc`를 생성하고 종료 시
제거합니다. public performance command는 검증한 IFC만 ignored
`.ifc-cache/public-ifc`에 두며 archive를 보관하지 않습니다. 고객 또는
third-party IFC bytes는 저장소와 evidence에 포함하지 않습니다.

qualification harness는 공통 process supervisor를 사용해 최소 환경,
stdout/stderr byte budget, timeout과 AbortSignal cancellation을 적용합니다.
일반 Node stub으로 redaction과 종료 승격을 검증했지만 이는 engine별
corrupt-input cleanup이나 cooperative cancellation을 검증한 것이 아닙니다.
Browser Worker는 유효한 IFC의 model-opened checkpoint 취소와 cleanup을
별도 actual-browser evidence로 검증했고, 1,024-Wall bounded fixture의
time/WASM-capacity budget도 통과했습니다. 공개 대표 fixture의 Node
CPU/RSS와 Browser parse/geometry도 분리해 통과했습니다. 다만 동기 engine
호출 중 선점, 승인된 negative corpus cleanup, visibility·physical GPU
memory와 cross-Host budget을 검증하지 않았으므로 compatibility matrix의
cancellation/corrupt cleanup과 large-model Gate는 계속 `blocked`입니다.

## 다음 Gate

1. #6 generic 3D renderer의 visibility, camera와 picking vertical slice
2. 각 engine의 in-call cancel과 승인된 negative corpus에서 cleanup 검증
3. connection/system/opening을 포함한 broader semantic corpus
4. Browser in-call engine cancellation, approved negative cleanup과 Linux CI
5. VS Code isolation/package와 WebGL2 cross-Host proof
6. dependency 결합·NOTICE·source 제공·artifact integrity 법률 검토
7. 결과를 근거로 engine/profile go/no-go 결정
