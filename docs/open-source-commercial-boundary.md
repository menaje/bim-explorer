---
type: strategy
status: accepted
authority:
  - open-source-product-boundary
  - spatial-commercial-boundary
  - license-decision-gates
last_reviewed: 2026-08-04
---

# 오픈소스 Explorer와 유료 Spatial 경계

## 원칙

BIM Explorer의 공개 가치는 원본 BIM 모델을 계정 없이 안전하게 읽고
이해하는 데 있습니다. Coni Spatial의 상품 가치는 여러 source와 Agent
변경을 하나의 revision workflow로 결합하고 검토·reconcile·승인·납품하는
데 있습니다.

무료 Viewer를 기능적으로 무력화해 Spatial 구매를 강제하지 않습니다.
대신 서로 다른 문제와 authority를 소유합니다.

| Open-source BIM Explorer | Coni Spatial |
| --- | --- |
| raw BIM read/index/render | multi-source Workspace |
| generic 3D exploration | Canonical Entity ID와 Spatial Revision |
| tree/property/relation/search | Agent query/change/build/check |
| section/isolate/measure | semantic/geometry/render/export diff |
| source-local viewpoint | refresh/reconcile/conflict |
| BCF·IDS·bSDD read-only exploration | validation-to-revision diagnostics |
| public source/renderer conformance | human accept/publish |
| local Browser/VS Code shell | verified native delivery와 support |

## 라이선스 검토안

- BIM Explorer 구현: MPL-2.0 후보
- public protocol/schema/examples: Apache-2.0 후보
- synthetic conformance fixture: 공개 후보
- third-party native/commercial adapter: 별도 package와 해당 권리
- 고객 BIM/corpus: 비공개·접근 통제

현재 root package는 `private: true`, `UNLICENSED`입니다. 이는 제품의
오픈소스 방향을 철회한 것이 아니라 dependency 결합, redistribution과 법률
검토 전에 라이선스를 확정한 것처럼 보이지 않기 위한 release Gate입니다.

## 공개 전 Gate

- exact Viewer Core dependency 고정
  (`@menaje/*` 0.1.2 prerelease Gate 통과)
- exact IFC engine dependency와 production package 고정
- static/dynamic/WASM/process 결합 방식 기록
- LICENSE, NOTICE와 source 제공 의무 검토
- synthetic fixture redistribution 확인
- SBOM과 artifact provenance
- macOS/Linux/Browser package 검증
  (`web-ifc` private Node/WASM macOS/Linux stage만 통과)
- security/privacy review
- standalone clean install과 uninstall/cleanup

저장소 visibility 변경은 위 Gate와
[Release issue #11](https://github.com/menaje/bim-explorer/issues/11)의
명시적 승인 뒤 수행합니다.
