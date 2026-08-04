---
type: qualification
status: active
authority:
  - ifc-engine-candidate-evidence
  - experimental-ifc-implementation-profile
  - engine-selection-gates
last_reviewed: 2026-08-04
---

# IFC engine qualification

## 결론

`web-ifc@0.0.77`과 `ifcopenshell@0.8.4.post1`은 같은 repository-authored
IFC4 base와 mapped/shared synthetic fixture에서 semantic, GlobalId–Express
ID identity, relation, quantity, classification, extrusion geometry와 IFC
world bounds assertion을 통과했습니다. 이 근거와 실제 Browser/VS Code
JavaScript/WASM 제품 경로를 기준으로 첫 engine은 exact
`web-ifc@0.0.77`, 첫 implementation profile은 IFC4
`ReferenceView_V1.2`의 local read-only semantic/extruded-geometry
exploration으로 experimental admission합니다.

production go/no-go는 **no-go**입니다. exact npm tarball/integrity,
installed content, MPL-2.0 full text, npm `gitHead` source commit과 세 notice를
기술적으로 고정했지만 BIM Explorer 자체 license, 외부 배포본에 포함될
source-access notice, SBOM, signing, Browser/VS Code public package와 법률
검토는 아직 통과하지 않았습니다. IfcOpenShell은 bundle하거나 fallback으로
자동 실행하지 않고 cross-engine qualification reference oracle로 유지합니다.

`web-ifc`는 local Chromium module Worker에서 single-thread WASM으로 base
fixture를 읽는 첫 smoke와 실제 file chooser를 통한 bounded local-file
lifecycle, 유효한 IFC가 열린 뒤 checkpoint 취소·정리 prototype을
통과했습니다. 1,024-Wall generated fixture의 bounded Browser 시간·WASM
heap-capacity budget도 통과했습니다. 이어서 CC BY 4.0 Schependomlaan
IFC2X3 46.77MB를 고정 digest로 검증하고 Node CPU/RSS와 실제 Chromium
Worker parse/geometry budget을 통과했습니다. JavaScript/WASM 경로를
Browser와 VS Code surface에서 공유할 수 있음을 확인했으며 IFC2X3 profile
승격은 아닙니다. Browser WebGL2 first-frame prototype도
통과했습니다. 세 가지 generated malformed/truncated source는 web-ifc와
IfcOpenShell 격리 process에서 각각 두 번 거부·정리하고 정상 source recovery를
재현했으며, web-ifc는 실제 Chromium Worker에서도 explicit dispose와
recovery를 통과했습니다. 공개 IFC call-start checkpoint 뒤에는 두 후보를
각각 두 번 강제 process 종료하고 새 process에서 정상 IFC를 복구했습니다.
web-ifc는 실제 Chromium에서도 50ms grace의 강제 Worker 종료와 새 Worker
복구를 통과했습니다. 두 후보의 sampled 256MiB process RSS 상한과
fresh-process recovery도 통과했습니다. 다만 engine-cooperative cancellation,
강제 종료된 runtime 내부의 explicit cleanup, production packaging,
Browser/native allocator exhaustion과 법률 Gate가 남아 있으므로
IfcOpenShell은 unbundled qualification reference oracle로 유지합니다.

같은 공개 fixture를 별도 `BimModelSource` artifact로 투영한 결과는
[`public source evidence`](../compatibility/evidence/bim-model-source-public-representative-2026-08-04.json)가
소유합니다. 이 결과는 engine 선정 근거 중 bounded read-only source
단계이며 IFC2X3 profile admission은 아닙니다.

이 source의 첫 geometry range를 headless와 실제 Browser WebGL2 backend에
연결한 결과는
[`headless renderer evidence`](../compatibility/evidence/bim-renderer-3d-public-headless-2026-08-04.json)와
[`Browser WebGL2 evidence`](../compatibility/evidence/bim-renderer-3d-public-browser-webgl2-2026-08-04.json)가
소유합니다. WebGL2 GPU API upload·rasterized first frame·dispose Gate는
통과했지만 physical GPU·memory나 IFC2X3 profile admission을 의미하지
않습니다.

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
[`public Browser performance`](../compatibility/evidence/web-ifc-browser-public-representative-performance-2026-08-03.json),
[`negative process corpus`](../compatibility/evidence/ifc-engine-negative-corpus-2026-08-04.json)와
[`negative Browser corpus`](../compatibility/evidence/web-ifc-browser-negative-corpus-2026-08-04.json),
[`in-call process isolation`](../compatibility/evidence/ifc-engine-in-call-cancellation-2026-08-04.json)과
[`in-call Browser isolation`](../compatibility/evidence/web-ifc-browser-in-call-cancellation-2026-08-04.json),
[`process RSS limit`](../compatibility/evidence/ifc-engine-resource-exhaustion-2026-08-04.json),
[`platform package matrix`](../compatibility/evidence/web-ifc-platform-package-matrix-2026-08-04.json)가
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

취소 probe는 `engine-initialized`, `model-open-call-starting`,
`model-opened`, `inspection-complete` checkpoint마다 main thread의
`continue`를 기다립니다.
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
않습니다. model-opened checkpoint cleanup만으로는 실행 중인 synchronous
`web-ifc` 호출의 선점을 증명하지 않습니다. 아래 forced-isolation
evidence가 이 경계를 별도로 다룹니다. 별도 WebGL2 renderer evidence가 GPU API
first-frame을 검증했지만 physical GPU memory, clean-install engine
packaging, Linux Browser CI와 VS Code engine isolation은 별도 Gate입니다.

## Negative corpus cleanup과 recovery

repository-authored generator는 artifact를 추적하지 않고 다음 세 case를
결정적으로 만듭니다.

| Case | Bytes | Node/process 결과 | Browser Worker 결과 |
| --- | ---: | --- | --- |
| invalid STEP preamble | 89 | 두 후보 모두 2회 거부 | init 뒤 envelope 거부·dispose |
| truncated DATA section | 1,781 | 두 후보 모두 2회 거부 | init 뒤 envelope 거부·dispose |
| missing Project root | 2,817 | 두 후보 모두 2회 거부 | model open 뒤 close·dispose |

web-ifc Node adapter는 세 case 모두 model을 닫고 engine을 dispose했습니다.
IfcOpenShell은 명시적 close API 대신 열린 model reference를 release한 뒤
child process exit를 cleanup 경계로 사용했습니다. 각 negative run 뒤 새
process에서 2,855-byte 정상 IFC4의 1 Project, 1 Wall과 12 triangles를 다시
확인했습니다.

실제 local Chromium에서도 세 source를 각각 새 Worker에 전달했습니다.
envelope 두 case는 `engine-initialized`, missing Project case는
`model-opened`까지 ordered progress를 관찰한 뒤 path-free rejection
receipt를 반환했습니다. 열린 model close, engine dispose, Worker 종료 뒤
새 Worker의 정상 IFC recovery가 통과했고 console warning/error는
관찰되지 않았습니다.

따라서 adapter-boundary `corruptInputCleanup`은 두 후보 모두 `mapped`로
승격합니다. 이는 세 개의 작은 rejection corpus에 한정됩니다.
resource-exhaustion, parser memory safety, 실행 중 동기 호출의 선점,
same-process engine reuse와 production package는 승인하지 않습니다.

## In-call forced isolation cancellation

공개 Schependomlaan IFC2X3의 46,766,968 bytes를 사용해 `OpenModel` 또는
`ifcopenshell.open` 직전 `model-open-call-starting` checkpoint를 stdout으로
내보냈습니다. checkpoint를 받은 25ms 뒤 취소를 요청했으며 web-ifc와
IfcOpenShell process는 각각 두 번 모두 `SIGTERM`으로 종료됐습니다. 종료된
process를 재사용하지 않고 새 process에서 2,855-byte 정상 IFC4의 1 Project,
1 Wall과 12 triangles를 다시 확인했습니다.

실제 local Chromium Worker도 `model-open-call-starting`에서 `continue`한
25ms 뒤 취소를 요청했습니다. 동기 호출 중 Worker가 취소 메시지에 응답하지
않아 50ms grace 뒤 `cancelled-forced`로 종료됐고, 관찰 cancellation wait는
53ms였습니다. 이어서 새 Worker가 정상 IFC4를 열고 model close·engine
dispose까지 완료했습니다. console warning/error는 없었습니다.

따라서 공통 `cancellation` capability는 **forced process/Worker isolation
전략**에 한해 두 후보 모두 `mapped`입니다. 이는 engine이 협력적으로
호출을 중단했다는 뜻이 아닙니다. pre-call checkpoint 뒤 어느 engine
instruction에서 종료됐는지는 callback으로 확인하지 못했고, 강제 종료된
runtime은 model close·engine dispose 영수증을 반환할 수 없습니다.
same-runtime reuse, resource exhaustion과 parser memory safety도 승인하지
않습니다.

## Process RSS limit과 recovery

같은 공개 IFC를 처리하는 두 후보 process에 268,435,456-byte RSS 상한과
10ms parent sampler를 적용했습니다. web-ifc는 269,615,104와 270,008,320
bytes, IfcOpenShell은 270,090,240과 270,172,160 bytes가 관찰된 시점에
각각 `SIGKILL`됐습니다. 네 실행 모두 call-start checkpoint 이후였고 timeout
또는 output-limit과 구분된 `rss-limit` 영수증을 반환했습니다. 이어서 새
process에서 정상 IFC4의 1 Project, 1 Wall과 12 triangles를 복구했습니다.

따라서 `processRssLimitRecovery` Gate는 통과합니다. 샘플 사이 overshoot가
가능하고 어느 engine allocation이 상한을 넘겼는지는 식별하지 못합니다.
`SIGKILL`된 runtime 내부의 close/dispose, Browser heap exhaustion, native
allocator/OOM behavior, adversarial parser memory safety와 same-process
reuse를 증명하지 않으므로 전체 `resourceExhaustion` Gate는 계속
`blocked`입니다.

## macOS/Linux clean-install stage

exact web-ifc Node API/WASM, inspect adapter, engine report contract와
MPL-2.0 license text만 포함한 private qualification package를 만들었습니다.
GitHub Actions CI 30875603346의 macOS arm64와 Linux x64 runner는 각각
tgz를 만든 뒤 네트워크 없이 깨끗한 임시 host에 설치했습니다. package
디렉터리 밖의 별도 cwd/source에서 IFC4 1 Project, 1 Wall과 12 triangles를
재현하고 model close·engine dispose까지 통과했습니다.

두 runner의 stage는 10 files, 7,273,290 bytes와 SHA-256
`84710fde2959eb285042522d1d0fd662661cfde9f352e48f835aab0691e45067`로
일치했습니다. 생성한 989,965-byte tgz도 SHA-256
`b759bbba3daa21c5b241016a9584ce148f2420f1c12df87a7949816819ef1e47`로
byte-identical이었습니다. OS별 report fingerprint는 packaging capability가
달라 서로 다르며, engine/fixture/semantic/geometry/cleanup portable
projection은 동일합니다.

따라서 web-ifc의 `packagingMacos`와 `packagingLinux`는 experimental
Node/WASM stage 범위에서 `native`입니다. 이 historical evidence의 package는
당시 `private: true`, `UNLICENSED`였고 CI artifact retention도 임시였으므로
그 자체가 production release, Browser/VS Code bundle, IfcOpenShell Linux
wheel, SBOM, signing과 redistribution 승인을 뜻하지 않습니다. 현재
first-party source license와 공식 Community artifact는 별도 release Gate가
소유합니다.

## Admitted experimental implementation profile

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
- 공개 IFC call-start 뒤 process/Worker forced-isolation cancellation과
  fresh-runtime recovery prototype
- 공개 IFC 처리 중 sampled process RSS limit과 fresh-process recovery
- macOS/Linux의 private web-ifc Node/WASM clean-install stage
- generated 1,024-Wall fixture의 bounded Browser time/WASM-capacity prototype

공개 IFC2X3 관찰은 engine의 대표 parse/geometry 성능을 재기 위한
performance-only Gate입니다. 아래 admitted IFC4 profile의 schema나 exchange
scenario에 포함하지 않습니다.

다음은 `blocked`입니다.

- IFC2X3, IFC4.3와 그 외 exchange scenario
- connection, system, opening과 broader object/relation corpus
- engine-cooperative in-call cancellation과 강제 종료 뒤 explicit cleanup
- Browser/native resource exhaustion, parser memory safety와 same-runtime
  recovery
- visibility 기반 first frame, physical GPU memory와 context-loss recovery
- production Browser/VS Code packaging과 IfcOpenShell Linux packaging
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
| corrupt-input adapter cleanup | mapped | mapped |
| forced-isolation cancellation | mapped | mapped |
| sampled process RSS-limit recovery | mapped | mapped |
| engine-cooperative cancellation | blocked | blocked |
| write/round-trip | blocked | blocked |
| verified packaging | macOS/Linux private Node stage | macOS Python wheel only |

전체 machine-readable matrix는 compatibility manifest를 따릅니다.

## License와 packaging

web-ifc upstream은 Node와 Browser용 WASM engine이며 저장소 license를
MPL-2.0으로 공개합니다. 현재 npm dependency는 exact version과 integrity로
고정했습니다. npm tarball은 3,088,753 bytes, SHA-256
`d9f88c96bde26a2b1e317458f8fa38ac46f18f1f688f2cb1a7f8e97890f2f341`,
registry SHA-512 integrity와 npm `gitHead`
`f26c4beef0a668ebdb180d2b95a94097a1e21cef`를 기록했습니다. 설치본은
14 files, 23,995,895 bytes이고 content digest는
`d7d35cd72317078b0bd191670a601bea61dc216852943d378f2a088a310434ef`입니다.
MPL-2.0 full text와 Browser/Node JS·WASM file digest도
[`license profile evidence`](../compatibility/evidence/ifc-license-profile-2026-08-04.json)가
검증합니다.

Mozilla의 MPL 2.0 license와 FAQ를 release-engineering 기준으로 적용하면
외부에 executable/minified JavaScript/WASM을 전달할 때 포함된 MPL code의
source를 받을 수 있는 합리적인 경로를 알리고, MPL file 수정분은 해당
source에 포함해야 합니다. 별도 BIM Explorer/Spatial 파일은 분리된 Larger
Work 경계를 유지할 수 있습니다. 현재 npm artifact는 수정하지 않았고 exact
source commit을 세 notice에 기록했습니다. 이 기술 체크리스트는 법률
자문이 아닙니다. BIM Explorer 자체 MPL-2.0, 실제 배포본의 source 제공,
SBOM, provenance와 Community redistribution 승인은
[Community release](community-release.md)가 별도로 검증합니다.

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
- [web-ifc exact source](https://github.com/ThatOpen/engine_web-ifc/tree/f26c4beef0a668ebdb180d2b95a94097a1e21cef)
- [web-ifc exact license](https://github.com/ThatOpen/engine_web-ifc/blob/f26c4beef0a668ebdb180d2b95a94097a1e21cef/LICENSE.md)
- [Mozilla MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/)
- [Mozilla MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
- [IfcOpenShell upstream](https://github.com/IfcOpenShell/IfcOpenShell)
- [IfcOpenShell Python installation](https://docs.ifcopenshell.org/ifcopenshell-python/installation.html)
- [Community Sample Test Files](https://github.com/buildingsmart-community/Community-Sample-Test-Files)
- [Public fixture license](https://github.com/buildingsmart-community/Community-Sample-Test-Files/blob/7ddf57a201f88a0c213d5322b02ed15e94a60a40/LICENSE)

engine/profile 선정과 Community read-only redistribution은 분리합니다.
Community release는 exact Browser JS/WASM만 승인하며 production write,
IfcOpenShell bundle, broader profile이나 법률 자문을 주장하지 않습니다.

## 재현

web-ifc는 repository lockfile만 사용합니다.

```sh
npm ci
npm run qualify:ifc:web
npm run qualify:ifc:mapped
npm run qualify:ifc:negative
npm run fetch:ifc:public
npm run qualify:ifc:cancel-in-call
npm run qualify:ifc:rss-limit
npm run qualify:ifc:platform-package
npm run qualify:ifc:license-profile
npm run qualify:ifc:public
npm run qualify:bim-source:public
npm run qualify:renderer:public
npm run probe:browser-worker
```

Browser probe에서는 **Run cancellation probe**로 model-opened checkpoint
cleanup을, **Run in-call isolation probe**로 공개 IFC의 50ms forced
Worker isolation과 fresh-Worker recovery를 확인합니다.
**Run negative corpus probe**로 세 source의
dispose/recovery를 확인합니다. **Run performance probe**로 1,024-Wall
budget을 검사합니다. **Run public representative probe**로 고정 digest의
46.77MB IFC2X3 parse/geometry budget을 검사하고, 이어서 **Run synthetic
IFC probe**로 새 Worker의 정상 복구를 확인합니다.

두 후보 비교에는 별도 Python environment를 주입합니다.

```sh
python3.12 -m venv .qualification-venv
.qualification-venv/bin/python -m pip install ifcopenshell==0.8.4.post1
node scripts/qualify-ifc-engine.mjs \
  --engine all \
  --fixture mapped \
  --python .qualification-venv/bin/python
node scripts/qualify-ifc-in-call-cancellation.mjs \
  --engine all \
  --python .qualification-venv/bin/python
node scripts/qualify-ifc-resource-exhaustion.mjs \
  --engine all \
  --python .qualification-venv/bin/python
```

synthetic qualification command는 매번 임시 `.ifc`를 생성하고 종료 시
제거합니다. public performance command는 검증한 IFC만 ignored
`.ifc-cache/public-ifc`에 두며 archive를 보관하지 않습니다. 고객 또는
third-party IFC bytes는 저장소와 evidence에 포함하지 않습니다.

qualification harness는 공통 process supervisor를 사용해 최소 환경,
stdout/stderr byte budget, timeout과 AbortSignal cancellation을 적용합니다.
일반 Node stub으로 redaction과 종료 승격을 검증하고, 별도 negative
qualification은 두 engine의 반복 rejection·cleanup·recovery를 검증합니다.
in-call qualification은 공개 IFC call-start checkpoint 뒤 두 engine
process를 반복 강제 종료하고 fresh-process recovery를 검증합니다.
RSS qualification은 같은 process의 256MiB sampled 상한을 강제하고
fresh-process recovery를 검증합니다.
platform package qualification은 exact Node/WASM stage를 tgz로 만들고
offline clean install 뒤 package 밖에서 adapter를 실행합니다. CI는
macOS arm64와 Linux x64 artifact를 별도로 보존하며 committed matrix가
두 SHA-256의 일치를 고정합니다.
Browser Worker는 유효한 IFC의 model-opened checkpoint 취소와 cleanup을
별도 actual-browser evidence로 검증했고, 1,024-Wall bounded fixture의
time/WASM-capacity budget과 negative corpus disposal도 통과했습니다. 공개
대표 fixture의 Node CPU/RSS와 Browser parse/geometry도 분리해
통과했습니다. forced-isolation cancellation Gate는 `mapped`로
통과했고 process RSS-limit recovery도 통과했습니다. engine-cooperative
cancellation, 강제 종료 뒤 내부 cleanup, Browser/native allocator
exhaustion safety, physical GPU memory와 cross-Host engine budget은 계속
`blocked`입니다.

## 다음 Gate

1. Browser/native allocator exhaustion과 필요 시 cooperative cancellation
2. connection/system/opening을 포함한 broader semantic corpus
3. production Browser/VS Code engine package와 shipped notice/source link
4. BIM Explorer own license, SBOM, signing과 external redistribution 법률 검토
5. IfcOpenShell을 실제 fallback으로 요구할 때만 wheel/relink 범위 재검토
