---
type: qualification
status: active
authority:
  - ifc-engine-candidate-evidence
  - draft-ifc-implementation-profile
  - engine-selection-gates
last_reviewed: 2026-08-03
---

# IFC engine qualification

## 결론

`web-ifc@0.0.77`과 `ifcopenshell@0.8.4.post1`은 같은 repository-authored
IFC4 synthetic fixture에서 semantic, identity, relation, extrusion geometry와
IFC world bounds assertion을 통과했습니다. 그러나 첫 engine 선정과
production go/no-go는 보류합니다.

다음 Browser/VS Code vertical slice는 `web-ifc` Browser Worker를 우선
prototype으로 삼는 것이 적절합니다. JavaScript/WASM 경로를 두 surface에서
공유할 가능성이 있기 때문입니다. 이는 선정 결정이 아닙니다. Browser
packaging, large model memory, cancellation과 cleanup을 통과하지 못하면
IfcOpenShell native process를 desktop fallback으로 재평가합니다.

지원 상태의 authority는
[`compatibility/ifc-engines.json`](../compatibility/ifc-engines.json),
실행 관찰값은
[`ifc-engine-synthetic-small-2026-08-03.json`](../compatibility/evidence/ifc-engine-synthetic-small-2026-08-03.json)이
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
| Geometry | 1 product, 12 triangles | 동일 | 일치 |
| IFC world bounds | `[0,0.9,0]`–`[4,1.1,3]` | 동일 | 일치 |
| Engine vertex records | 34 | 8 | 비교 기준에서 제외 |
| 반복 fingerprint | 동일 | 동일 | engine별 deterministic |
| explicit engine cleanup | close/dispose 확인 | process exit가 cleanup 경계 | 추가 검증 필요 |

정점 record 수는 tessellator의 normal/vertex expansion 전략에 따라 달라질 수
있으므로 cross-engine correctness 기준이 아닙니다. 이 단계에서는 semantic
snapshot, triangle count, coordinate basis와 bounds를 비교합니다.

측정된 adapter 내부 total은 web-ifc 약 22ms, IfcOpenShell 약 3ms였고 child
process wall clock은 양쪽 모두 약 190–215ms였습니다. 이는 2.9KB synthetic
fixture의 개발 장비 관찰값일 뿐입니다. module import/cache 영향과 실제 첫
화면을 대표하지 않으므로 성능 우열이나 production budget 근거로 사용하지
않습니다.

## Draft implementation profile

현재 profile은 다음만 `experimental`입니다.

- STEP serialization의 IFC4 `ReferenceView_V1.2`
- Project/Site/Building/BuildingStorey/Space와 aggregation/containment
- IfcWall occurrence, IfcWallType, occurrence/type property set와 material
- GlobalId completeness/duplicate diagnostic와 source digest
- IfcExtrudedAreaSolid tessellation과 IFC world Z-up placement bounds
- local read-only parse/index/geometry report

다음은 `blocked`입니다.

- IFC2X3, IFC4.3와 그 외 exchange scenario
- mapped representation와 shared geometry instance
- Qto, classification, connection과 broader relation corpus
- corrupt/truncated input, cancellation과 resource exhaustion cleanup
- large model first-frame/index/RSS budget
- Browser Worker, Linux와 VS Code packaging
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
| mapped/shared/Qto/classification | blocked | blocked |
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

- [web-ifc upstream](https://github.com/ThatOpen/engine_web-ifc)
- [web-ifc license](https://github.com/ThatOpen/engine_web-ifc/blob/master/LICENSE.md)
- [IfcOpenShell upstream](https://github.com/IfcOpenShell/IfcOpenShell)
- [IfcOpenShell Python installation](https://docs.ifcopenshell.org/ifcopenshell-python/installation.html)

법률 검토와 public release Gate 전에는 어느 후보도 production
redistribution 가능하다고 주장하지 않습니다.

## 재현

web-ifc는 repository lockfile만 사용합니다.

```sh
npm ci
npm run qualify:ifc:web
```

두 후보 비교에는 별도 Python environment를 주입합니다.

```sh
python3.12 -m venv .qualification-venv
.qualification-venv/bin/python -m pip install ifcopenshell==0.8.4.post1
node scripts/qualify-ifc-engine.mjs \
  --engine all \
  --python .qualification-venv/bin/python
```

command는 매번 임시 `.ifc`를 생성하고 종료 시 제거합니다. 고객 또는
third-party IFC는 저장소와 evidence에 포함하지 않습니다.

## 다음 Gate

1. mapped/shared geometry와 Qto/classification을 포함한 작은 fixture를 추가
2. redistribution 가능한 large performance fixture와 resource budget 고정
3. timeout/cancel/corrupt fixture에서 process/Worker cleanup 검증
4. web-ifc Browser Worker prototype과 Linux CI evidence
5. VS Code isolation/package proof
6. dependency 결합·NOTICE·source 제공·artifact integrity 법률 검토
7. 결과를 근거로 engine/profile go/no-go 결정
