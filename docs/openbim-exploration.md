---
type: architecture
status: accepted
authority:
  - openbim-exploration-profile
  - bcf-ids-bsdd-boundary
  - openbim-network-policy
last_reviewed: 2026-08-04
---

# openBIM 탐색 경계

## 결정

BIM Explorer의 첫 openBIM surface는 BCF XML 3.0 local archive, IDS 1.0
document/external result와 bSDD URI reference를 같은 `BimModelSource`
snapshot에 묶어 read-only로 탐색합니다.

```text
active BIM source fingerprint + revision
  ├─ BCF topic/viewpoint
  │    └─ GlobalId -> Render/Pick identity + missing diagnostic
  ├─ IDS document + provenance-bearing result
  │    └─ failing GlobalId -> selection/highlight + missing diagnostic
  └─ bSDD URI
       ├─ default: offline-missing
       └─ explicit action: bounded HTTPS lookup + local cache
```

구현 계약과 정확한 limit은
[openBIM Explorer v0.1](../specs/openbim-explorer-v0.1.md)이 소유합니다.
현재 통과/보류 상태는
[openBIM compatibility](../compatibility/openbim-explorer.json)가
소유합니다.

## BCF

BCF는 단순 카메라 preset이 아니라 검토 issue와 component reference를 함께
탐색합니다. camera, clipping, visibility, coloring, selection과 topic
metadata를 유지합니다. viewpoint 적용 전 source fingerprint/revision을
exact 비교하고 missing GlobalId를 조용히 버리지 않습니다.

BCFZIP은 central/local directory를 inflate 전에 검사하며 archive,
uncompressed size, entry/topic/viewpoint/component 수를 제한합니다. export는
한 topic/한 viewpoint의 deterministic local BCF XML 3.0 artifact입니다.
BCF API, 로그인, comment mutation과 서버 동기화는 이 경계 밖입니다.

## IDS

IDS XML 자체와 validation result를 구분합니다. document import는
applicability/requirement를 보여주지만 IFC를 검증했다고 주장하지 않습니다.
result는 `pass`·`fail`·`not-evaluated`, producer와
`explorer`·`external`·`spatial` provenance를 명시합니다.

fail 결과의 GlobalId만 현재 source에서 selection/highlight로 projection하고,
IDS document digest 또는 source revision이 다르면 적용을 거부합니다.
Spatial provenance에 revision ID가 있어도 reference일 뿐 acceptance 권한은
아닙니다. IDS를 actual Spatial Revision과 diagnostic에 결합하는 책임은
Coni Spatial에 남습니다.

## bSDD와 네트워크

classification/property URI와 dictionary version은 offline에서도
표시합니다. import 중 network request는 0이어야 합니다. 사용자가 lookup을
명시한 호출만 buildingSMART bSDD HTTPS API로 나가며 credential을 보내지
않고 response/cache를 제한합니다.

identifier URI를 system-to-system endpoint로 호출하지 않고 URI를 query
parameter로 전달하는 Class/Property API v1을 사용합니다. 외부 vocabulary,
HTTP URI, offline cache miss, 404와 service unavailable을 다른 상태로
표시합니다.

## 보류

- complete BCF XSD validation
- IFC에 대한 native IDS requirement evaluation
- live bSDD service를 CI/제품 가용성 전제에 포함
- Spatial validation-to-revision diagnostic linkage
- BCF API collaboration과 mutation
- Community public package
