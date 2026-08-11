---
type: product
status: accepted
authority:
  - product-definition
  - product-responsibility
  - source-identity-boundary
  - standalone-product-invariants
last_reviewed: 2026-08-11
---

# 제품과 저장소 경계

## 제품 정의

BIM Explorer는 raw BIM 모델을 local-first로 읽고 3D 형상, 공간 구조,
속성과 관계를 탐색하는 독립 제품입니다. 첫 semantic vertical slice는
read-only IFC이며, bounded glTF/GLB를 BIM authority 없는 reference mesh로
추가했습니다. `.gltf`의 JSON-declared 동일 폴더 `.bin`과 `.png`도 명시적 local
bundle로 열 수 있지만 최대 16개·합산 64MiB이고 임의 URI·network fetch는
허용하지 않습니다. 외부 PNG는 OPAQUE `baseColorTexture`, `TEXCOORD_0`과 표준
sampler만 허용하며 JPEG·비-OPAQUE alpha material mode·다른 material texture role은 거부합니다.
required extension은 코덱 없는 `KHR_mesh_quantization`과
exact meshoptimizer 1.2.0을 쓰는 `EXT_meshopt_compression` `FILTER_NONE`만 bounded
display decode하고 Draco·다른 meshopt filter·그 밖의 extension은 거부합니다. bounded
E57/LAS/LAZ는 Browser와 VS Code에서 열 수 있는
experimental point reference입니다. exact source revision과 root range digest
안의 파생 point selection, octree leaf chunk와 coarse-to-full LOD는 통과했지만
CRS/surveyed datum, source-native hierarchy·point semantics와 format/federation
admission은 아직 보류합니다.

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
| source-local identity | DWG handle | IFC GlobalId·Express ID, reference native ID 또는 revision/root-range-scoped derived point ID | native reference mapping |
| Canonical Entity ID | 없음 | 없음 | authority |
| Agent change | 없음 | 없음 | query/proposal/build/check |
| revision/diff | 없음 | source snapshot만 | authority |
| 3D reference | 없음 | source-scoped anchor receipt | authored placement·constraint와 reconcile |
| accept/publish/export | 없음 | 없음 | human-only authority |

Viewer Core와 render protocol은 공개 `@menaje/*` 0.1 contract를 exact
artifact로 공유합니다. 상대 제품의 설치된 extension, process 또는 private
message를 기본 integration으로 사용하지 않습니다. prerelease 소비와 각
제품 entrypoint 채택은 저장소별 compatibility Gate로 분리합니다. Explorer의
IFC/glTF/GLB Browser·VS Code entrypoint Gate는 통과했지만 Spatial consumer,
stable/production과 Marketplace Gate를 대신하지 않습니다.

local `.gltf + .bin/.png` bundle의 source fingerprint는 document SHA-256과 정렬된
sidecar name·byte length·SHA-256 descriptor를 함께 묶습니다. Browser의 명시적
다중 파일 선택과 VS Code의 sibling resolution은 같은 fingerprint를 만들지만,
경로나 파일 이름을 public Viewer/Spatial identity로 승격하지 않습니다.
공개된 federated BIM Surface v0.2와 `.bimfed.json`은 exact runtime/API를
유지하므로 이 single-source bundle, PNG texture, `KHR_mesh_quantization` 또는 meshopt 기능을
포함한다고 주장하지 않습니다. federation에 포함하려면 새 semver contract와 Explorer package
qualification, Spatial consumer admission이 필요합니다.

## Identity 경계

```text
source bytes
-> source fingerprint
-> source-local or derived identity
   - IFC GlobalId: profile이 허용하는 durable source identity
   - Express ID: exact source snapshot 안에서만 유효
   - glTF/GLB native ID: exact reference snapshot 안에서만 유효
   - E57/LAS/LAZ `point:n`: exact source revision과 root range digest 안의 파생 range-order identity
-> Render/Pick ID: exact snapshot/layer에 묶인 projection
-> optional Spatial mapping
   -> Workspace + Spatial Revision + Canonical Entity ID
```

BIM Explorer는 source fingerprint에서 Render/Pick ID까지 소유합니다.
GlobalId가 존재하더라도 source fingerprint 없이 전역 identity로
사용하지 않습니다. Express ID는 rewrite·reopen 뒤 안정적이라고 가정하지
않습니다.
파생 `point:n`도 다른 revision/range와 합치거나 source-declared record ID로
해석하지 않습니다. E57 invalid record가 제거된 경우에는 원본 record index를
보존하지 않습니다.

Coni Spatial만 native identity를 Canonical Entity ID에 연결합니다. 이
mapping은 Workspace와 Spatial Revision에 묶이며 Explorer cache나 Viewer
selection이 authority가 되지 않습니다.

## Runtime과 release 독립성

- BIM Explorer는 자체 Browser/VS Code shell과 version을 가집니다.
- 공개된 `bim-surface/0.1`은 제품 이름을 대체하지 않고 한 BIM source의
  host-neutral 표시·semantic 탐색 lifecycle만 재사용합니다.
- 차기 `bim-surface/0.2` draft는 federation과 source-local reference anchor를
  합성하지만 authored object, constraint와 Workspace authority는 포함하지
  않습니다. 내부 Browser와 path-free `.bimfed.json` VS Code entrypoint는
  private 0.2.0 candidate runtime을 사용해 검증됐고 byte-identical pack과
  offline clean install도 통과했습니다. Spatial actual headless consumer는 이전
  candidate와 exact 97,623-byte release-ready tgz를 모두 검증했습니다. 동일 tgz는
  immutable public v0.2 package prerelease로 공개됐고 그 asset의 Spatial Phase B
  exact-pin admission도 통과했습니다. 별도 post-release 검증에서 generated
  3-source Browser와 VS Code staged/clean-installed local VSIX는 Apple M2 Metal
  physical GPU를 통과했습니다. 같은 hardware profile에서 공개 46.77MB IFC와
  42.98MB GLB도 actual Browser, staged VS Code와 clean-installed local VSIX의
  개별 제품 세션으로 통과했습니다. LAS·LAZ·E57·다중 스캔 E57도 같은 세
  제품 경로의 12개 표면에서 Apple M2 Metal을 통과했지만 CRS와 format
  admission은 held입니다. 대표 sample의 동시 합성, Spatial VSIX BIM
  runtime, Spatial 실제 BIM UI, Linux/Windows hardware, OS-level peak GPU
  memory와 production support는 별도 Gate입니다.
- Coni Spatial 설치, 계정, service와 license를 기본 실행에 요구하지
  않습니다.
- Coni Spatial도 설치된 BIM Explorer extension을 호출하지 않고 호환되는
  public package를 bundle합니다.
- 세 저장소는 독립 tag와 release cadence를 사용합니다.
- cross-product compatibility는 exact artifact, version과 conformance
  result로만 주장합니다.

현재 `@bim-explorer/bim-surface@0.1.0`은 Browser/VS Code 제품이 사용하는
zero-runtime-dependency package로 검증했고 `bim-surface-v0.1.0` immutable
GitHub prerelease, checksum, SPDX, release/build attestation을 공개했습니다.
저장소 manifest는 `private: true`로 유지하고 registry에는 게시하지 않습니다.
따라서 public artifact 존재는 주장하지만 Coni Spatial의 실제 bundle dependency나
consumer conformance는 Spatial-owned exact-pin 검증 전까지 주장하지 않습니다.

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

개발 기준선의 product-scale federation qualification은 두 generated IFC source와
제품 규모 GLB reference를 한 derived renderer projection으로 동시에
검증하고, macOS arm64와 Linux x64 CI의 동일한 portable projection을 별도
matrix로 비교합니다. 이는 Explorer의 bounded composition 성능 근거일 뿐
실제 Spatial bundle, Canonical mapping, customer-model 수요나 surveyed
alignment를 승인하지 않습니다.

외부 모형을 먼저 배치하고 Spatial에서 내부·부가 3D 설계를 진행하는 경우에도
경계는 같습니다. Explorer는 exact source slot/revision/native identity,
source-local hit point·normal과 alignment/projection fingerprint를
[`reference-anchor/0.1`](../specs/bim-reference-anchor-v0.1.md) receipt로
제공할 수 있습니다. Spatial만 이 receipt를 Workspace reference로 등록하고
authored object의 placement, offset, host 관계와 constraint를 관리합니다.
source refresh 뒤 anchor를 새 revision으로 자동 이월하지 않습니다.

## 비목표

- production IFC/RVT write를 첫 제품 범위로 주장하지 않습니다.
- 모든 BIM format을 하나의 in-memory object graph로 정규화하지 않습니다.
- 범용 solid/CAD authoring kernel을 구현하지 않습니다.
- Viewer UI와 event로 Spatial authority를 판정하지 않습니다.
- Viewer Core, parser 또는 Spatial service 구현을 이 저장소에 복사하지
  않습니다.
