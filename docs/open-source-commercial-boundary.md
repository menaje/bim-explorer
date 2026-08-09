---
type: strategy
status: accepted
authority:
  - open-source-product-boundary
  - spatial-commercial-boundary
  - license-decision-gates
last_reviewed: 2026-08-09
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
| source-scoped reference anchor receipt | authored 3D operation·constraint·dependency |
| BCF·IDS·bSDD read-only exploration | validation-to-revision diagnostics |
| public source/renderer conformance | human accept/publish |
| local Browser/VS Code shell | verified native delivery와 support |
| host-neutral read-only BIM Surface | product-owned 2D/3D revision composition |

## 라이선스 결정

- BIM Explorer 구현: MPL-2.0
- `specs/`의 public protocol/schema/normative example: Apache-2.0
- synthetic conformance fixture generator와 manifest: MPL-2.0
- third-party native/commercial adapter: 별도 package와 해당 권리
- 고객 BIM/corpus: 비공개·접근 통제

root와 first-party package의 npm publish는 `private: true`로 차단하지만
source license는 MPL-2.0입니다. `private`는 공개 소스 권리를 제한하지
않으며 실수로 npm registry에 게시하지 않기 위한 공급망 통제입니다.

`@bim-explorer/bim-surface`는 공개 Explorer 가치인 source read, bounded 3D와
semantic exploration을 외부 host가 재사용할 수 있게 합성합니다. 이 package가
Workspace, Canonical ID, Agent change, accept/publish 또는 verified delivery를
포함하지 않으므로 Spatial의 유료 상품 경계를 약화시키지 않습니다. 현재는
deterministic pack과 offline clean install을 통과했고
`bim-surface-v0.1.0` immutable GitHub prerelease로 공개했습니다. public artifact
publication과 실제 Spatial 소비·Workspace authority는 계속 독립 Gate입니다.

차기 federated Surface와 reference anchor도 Explorer의 공개 read/explore
가치에 포함할 수 있습니다. 유료 경계는 파일을 볼 수 있는지 여부가 아니라
external base를 Workspace에 등록하고, 의미 있는 3D 객체와 placement·constraint를
작성하며, source refresh 영향을 reconcile하고 revision을 승인·납품하는
workflow입니다. anchor receipt 자체를 유료 authority 또는 Spatial 설계
데이터로 취급하지 않습니다.

현재 private `@bim-explorer/federated-bim-surface@0.2.0` candidate는
zero-runtime-dependency pack과 offline clean install까지만 검증했습니다.
repository/staged manifest는 `private: true`이고 public tag나 release asset은
없습니다. 이 준비 상태도 Workspace authoring이나 Spatial consumer 지원을
발급하지 않습니다.

## Community 공개 Gate

- exact Viewer Core `@menaje/*@0.1.2` release asset 고정
- exact `web-ifc@0.0.77`와 브라우저 Worker/WASM 결합 방식 기록
- MPL-2.0 `LICENSE`, `NOTICE`, exact corresponding source 제공
- public fixture는 on-demand cache로만 사용하고 제품 bundle에서 제외
- source/runtime SPDX SBOM, SHA-256 manifest와 GitHub build provenance
- macOS/Linux clean CI와 Browser/clean-installed VSIX qualification
- 전체 Git 이력의 고객 format·credential pattern 검사
- standalone 계정 없는 흐름과 source/Worker/GPU cleanup

상세 산출물과 재현 명령은 [Community release](community-release.md)와
[Release issue #11](https://github.com/menaje/bim-explorer/issues/11)이
소유합니다. 이 기술·공급망 검토는 법률 자문이나 유료 지원 보장이
아닙니다.

v0.1.0은 위 Gate를 통과해 공개됐습니다. macOS/Linux build, release
integrity, checksum과 signed provenance의 고정 결과는
[release evidence](../compatibility/evidence/community-release-v0.1.0-2026-08-04.json)에
기록합니다. 이 승격은 native write, Spatial authority, SLA나 유료 지원을
추가하지 않습니다.
