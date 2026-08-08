---
type: product
status: accepted
authority:
  - product-definition
  - product-responsibility
  - source-identity-boundary
  - standalone-product-invariants
last_reviewed: 2026-08-08
---

# 제품과 저장소 경계

## 제품 정의

BIM Explorer는 raw BIM 모델을 local-first로 읽고 3D 형상, 공간 구조,
속성과 관계를 탐색하는 독립 제품입니다. 첫 semantic vertical slice는
read-only IFC이며, bounded glTF/GLB를 BIM authority 없는 reference mesh로
추가했습니다. bounded E57/LAS/LAZ는 Browser와 VS Code에서 열 수 있는
experimental point reference이며 CRS, point identity와 format admission은
아직 보류합니다.

제품 성공의 최소 기준은 다음과 같습니다.

- 계정과 Coni Spatial 없이 qualified local IFC 또는 reference source를
  연다.
- model tree와 3D selection이 같은 immutable source snapshot을 가리킨다.
- 선택한 객체의 property, type, containment와 relation을 bounded query로
  탐색한다.
- section, isolate와 measure가 parser 내부 object를 직접 다루지 않는다.
- source 전환이나 종료 후 Worker, range와 GPU resource가 정리된다.
- 지원하지 않는 schema, operation과 stale identity를 명시적으로 거부한다.

## 세 제품의 책임

| 책임 | DWG Viewer | BIM Explorer | Coni Spatial |
| --- | --- | --- | --- |
| raw source | DWG | IFC + qualified mesh reference + experimental E57/LAS/LAZ | registered multi-source |
| 기본 표현 | 2D drawing review | generic 3D/BIM exploration | 2D/3D revision review |
| source adapter | DWG Scene Cache | semantic/reference source snapshot | native change/reconcile adapter |
| source-local identity | DWG handle | IFC GlobalId·Express ID 또는 reference native ID | native reference mapping |
| Canonical Entity ID | 없음 | 없음 | authority |
| Agent change | 없음 | 없음 | query/proposal/build/check |
| revision/diff | 없음 | source snapshot만 | authority |
| accept/publish/export | 없음 | 없음 | human-only authority |

Viewer Core와 render protocol은 공개 `@menaje/*` 0.1 contract를 exact
artifact로 공유합니다. 상대 제품의 설치된 extension, process 또는 private
message를 기본 integration으로 사용하지 않습니다. prerelease 소비와 각
제품 entrypoint 채택은 저장소별 compatibility Gate로 분리합니다.

## Identity 경계

```text
source bytes
-> source fingerprint
-> native identity
   - IFC GlobalId: profile이 허용하는 durable source identity
   - Express ID: exact source snapshot 안에서만 유효
   - glTF/GLB native ID: exact reference snapshot 안에서만 유효
   - E57/LAS/LAZ: 현재 range identity만 있고 개별 point identity는 없음
-> Render/Pick ID: exact snapshot/layer에 묶인 projection
-> optional Spatial mapping
   -> Workspace + Spatial Revision + Canonical Entity ID
```

BIM Explorer는 source fingerprint에서 Render/Pick ID까지 소유합니다.
GlobalId가 존재하더라도 source fingerprint 없이 전역 identity로
사용하지 않습니다. Express ID는 rewrite·reopen 뒤 안정적이라고 가정하지
않습니다.

Coni Spatial만 native identity를 Canonical Entity ID에 연결합니다. 이
mapping은 Workspace와 Spatial Revision에 묶이며 Explorer cache나 Viewer
selection이 authority가 되지 않습니다.

## Runtime과 release 독립성

- BIM Explorer는 자체 Browser/VS Code shell과 version을 가집니다.
- Coni Spatial 설치, 계정, service와 license를 기본 실행에 요구하지
  않습니다.
- Coni Spatial도 설치된 BIM Explorer extension을 호출하지 않고 호환되는
  public package를 bundle합니다.
- 세 저장소는 독립 tag와 release cadence를 사용합니다.
- cross-product compatibility는 exact artifact, version과 conformance
  result로만 주장합니다.

## Optional handoff

제품이 함께 설치된 경우 public payload로 다음 편의를 제공할 수 있습니다.

```text
BIM Explorer selection
-> Open in Spatial Workspace
-> protocol version
 + source fingerprint
 + native identity
 + bounded selection
 + viewpoint
```

payload에 credential, parser pointer, arbitrary local path, Workspace
capability 또는 acceptance token을 넣지 않습니다. 수신 제품이 source,
version과 identity를 다시 검증하며 stale/unsupported payload는
fail-closed합니다.

현재
[`bim-explorer-spatial-integration/0.1`](../specs/bim-spatial-integration-v0.1.md)은
Explorer provider 경계를 구현합니다. Spatial bridge만 GlobalId를
Canonical Entity ID와 2D/3D Render/Pick reference로 resolve하며, Context
Reference 요청에는 bridge가 반환한 Render/Pick ID와 viewport만 넣습니다.
BIM base와 Spatial live/diff layer는 owner와 revision을 유지한 채
composition하고 accept/publish authority는 발급하지 않습니다.

BCF/IDS도 같은 원칙을 따릅니다.
[`openbim-explorer/0.1`](../specs/openbim-explorer-v0.1.md)은 viewpoint와
validation result를 active source fingerprint/revision에 묶어 탐색하지만
source baseline을 바꾸지 않습니다. `spatial` provenance가 있는 IDS
result도 Spatial Revision reference일 뿐 acceptance capability가 아닙니다.

multi-source 탐색도 같은 identity 경계를 유지합니다.
[`bim-explorer-federation/0.1`](../specs/bim-federation-v0.1.md)은 stable
source slot 아래 exact native fingerprint/revision을 보존하고, 서로 다른
source의 같은 GlobalId를 합치지 않습니다. source별 visibility,
partial/stale와 saved view는 Explorer read-only state지만 Workspace
registration, identity reconcile과 Canonical mapping은 Spatial
authority입니다.

main의 product-scale federation qualification은 두 generated IFC source와
제품 규모 GLB reference를 한 derived renderer projection으로 동시에
검증하고, macOS arm64와 Linux x64 CI의 동일한 portable projection을 별도
matrix로 비교합니다. 이는 Explorer의 bounded composition 성능 근거일 뿐
실제 Spatial bundle, Canonical mapping, customer-model 수요나 surveyed
alignment를 승인하지 않습니다.

## 비목표

- production IFC/RVT write를 첫 제품 범위로 주장하지 않습니다.
- 모든 BIM format을 하나의 in-memory object graph로 정규화하지 않습니다.
- 범용 solid/CAD authoring kernel을 구현하지 않습니다.
- Viewer UI와 event로 Spatial authority를 판정하지 않습니다.
- Viewer Core, parser 또는 Spatial service 구현을 이 저장소에 복사하지
  않습니다.
