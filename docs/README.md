---
type: index
status: active
authority:
  - documentation-navigation
  - documentation-governance
last_reviewed: 2026-08-03
---

# BIM Explorer 문서

## Authority

하나의 결정은 한 문서가 소유합니다. 요약 문서가 충돌하면 아래 authority
문서를 우선합니다.

| 문서 | Type·Status | 소유 범위 |
| --- | --- | --- |
| [제품과 저장소 경계](product-boundary.md) | `product` · `accepted` | 제품 정의, 책임, identity와 standalone 원칙 |
| [시스템 아키텍처](system-architecture.md) | `architecture` · `accepted` | source/adapter/runtime/Host 경계 |
| [오픈소스와 유료 Spatial 경계](open-source-commercial-boundary.md) | `strategy` · `accepted` | 공개 Explorer 가치와 Spatial 상품 가치 |
| [IFC engine qualification](ifc-engine-qualification.md) | `qualification` · `active` | 후보 측정, experimental profile과 production Gate |
| [openBIM 탐색 경계](openbim-exploration.md) | `architecture` · `accepted` | BCF·IDS·bSDD profile, source binding과 network 경계 |
| [결정 대장](decision-register.md) | `register` · `active` | 사실, 결정과 열린 질문 |
| [ADR-0001](adr/ADR-0001-independent-product-boundary.md) | `adr` · `accepted` | 독립 제품·저장소·release 결정 |
| [ADR-0002](adr/ADR-0002-viewer-core-consumer-admission.md) | `adr` · `accepted` | 공용 Viewer Core artifact와 3D consumer admission |

## 문서 상태

- `accepted`: 현재 구현과 이슈가 따라야 하는 기준
- `active`: 계속 갱신하는 register 또는 evidence
- `draft`: 비교·검증 중이며 제품 지원을 주장하지 않음
- `superseded`: 새 authority가 대체한 역사 기록

## 변경 규칙

1. 제품·권한 경계 변경은 ADR과 decision ID를 함께 갱신합니다.
2. package, engine과 format 지원은 compatibility evidence 없이
   `qualified`로 표현하지 않습니다.
3. 날짜, version, license와 성능 수치는 evidence와 제한을 함께 기록합니다.
4. GitHub issue는 실행 상태를, 문서는 장기 authority를 소유합니다.
5. 고객 모델, credential, 실제 path와 generated cache를 문서 예제로
   넣지 않습니다.
