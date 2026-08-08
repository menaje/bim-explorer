---
type: architecture
status: accepted
authority:
  - federation-source-identity
  - coordinate-alignment-boundary
  - reference-format-admission
  - federation-refresh-lifecycle
last_reviewed: 2026-08-08
---

# Federation과 reference format 경계

## 현재 결정

BIM Explorer는 여러 raw source를 하나의 read-only 탐색 context에 배치할
수 있지만 source document identity와 ownership을 합치지 않습니다.
`federationSourceId`는 stable slot이고 실제 fingerprint/revision은 그
아래에서 교체됩니다.

현재 통과한 foundation은 generated IFC4 source 두 개와 bounded GLB
reference source 하나를 동시에 등록하고 다음을 재현합니다.

- architecture/MEP source별 identity, owner, visibility
- 두 source에 같은 GlobalId가 있어도 서로 다른 selection key
- EPSG:32652 MapConversion의 same-CRS Float64 alignment
- explicit control-point matrix의 provenance
- `partial`과 `stale` source 상태
- MEP source만 새 revision으로 교체하는 incremental refresh
- architecture revision 보존과 이전 MEP selection/saved view 거부
- GLB source-native ID 선택, `globalId: null`, semantic authority 부재
- unaligned GLB의 shared-coordinate projection 거부
- federation descriptor와 네 source session의 deterministic cleanup

고정 결과는
[`bim-federation.json`](../compatibility/bim-federation.json)과
[`synthetic evidence`](../compatibility/evidence/bim-federation-synthetic-2026-08-04.json)가
소유합니다.

제품 규모 Gate는 aligned source snapshot의 range handle, native identity와
transform을 source slot별로 namespacing한 derived renderer projection을
사용합니다. generated architecture/MEP IFC 두 개와 on-demand CC BY 4.0
`A Beautiful Game` GLB를 동시에 올려 다음 결과를 고정했습니다.

- 3 source, 53 entities/instances, 3 first-frame ranges
- 573,976 unique triangles와 1,499,120 instanced triangles
- 19회·16,898,404-byte source read와 16,902,256-byte GPU allocation
- headless와 실제 Chrome SwiftShader WebGL2 first frame/highlight
- renderer, projection, source session과 allocation의 deterministic cleanup

근거는
[`product-scale federation evidence`](../compatibility/evidence/bim-federation-product-scale-2026-08-08.json)와
[`macOS/Linux platform matrix`](../compatibility/evidence/bim-federation-product-scale-platform-matrix-2026-08-08.json)가
소유합니다. matrix의 portable projection은 geometry, range,
render/highlight와 cleanup을 동일성 해시로 고정하고, runner별 memory/time은
예산 내 개별 관측치로 남깁니다. 두 IFC는 generated qualification fixture이고
GLB는 reference geometry이므로 실제 사용자 모델, Spatial consumer, 측량
datum 또는 production federation을 증명하지 않습니다.

## Identity와 Spatial 경계

```text
federation source slot
  -> exact native source fingerprint/revision
  -> source-scoped GlobalId/Express ID 또는 source-native ID
  -> source-scoped Render/Pick projection
  -> optional Spatial service mapping
```

federation은 GlobalId를 source 사이에서 deduplicate하지 않습니다.
Canonical Entity ID, Workspace ownership, revision reconcile, accept/publish는
계속 Coni Spatial authority입니다.

source refresh는 새 immutable source snapshot을 stable slot에 교체할 뿐,
native file을 patch하거나 이전 identity를 자동 reconcile하지 않습니다.

## Coordinate와 precision 경계

same-CRS alignment는 IFC MapConversion의 Float64 matrix에서 federation
origin을 빼 large coordinate를 bounded local context로 옮깁니다.

CRS 이름이 다르면 자동 변환하지 않습니다. 별도 geospatial engine이나
측량 workflow가 만든 matrix도 source/target coordinate system과 path-free
provenance가 있어야 `explicit`로 받을 수 있습니다. 현재 계약은
`datumTransformation: not-performed`만 허용합니다.

이 matrix는 display projection metadata입니다. fingerprinted native
document가 source authority이고, renderer의 Float32 mesh는 계속 lossy
cache입니다.

## Format admission

“registry에 이름이 있다”와 “제품에서 열 수 있다”를 분리합니다.

| 후보 | 현재 역할 | 현재 admission |
| --- | --- | --- |
| IFC4 ReferenceView | semantic BIM source | 기존 bounded read-only profile |
| glTF/GLB | derived/reference mesh | bounded read-only reference admission |
| LAS/LAZ/E57 | point-cloud/survey reference | held |
| 3D Tiles/GIS | site context reference | held |
| RVT/DGN | native SDK reference | held |

glTF/GLB admission은 embedded buffer, bounded node/mesh profile과
source-native identity에 한정됩니다. 비 IFC reference source는 semantic
BIM authority가 아닙니다. 모든 후보의 write와 round-trip은 별도
Gate입니다.

다음 실제 format은 사용자 과업, redistribution 가능한 fixture, exact
parser/SDK license, coordinate profile, first-frame/memory/cleanup evidence가
함께 생긴 뒤 선택합니다. 후보 제안은
[`reference format evidence intake`](reference-format-intake.md)의 공개 issue
form과 fail-closed triage receipt를 사용하며 고객 모델·credential·absolute
path를 받지 않습니다. intake가 완전해도 별도 codec/SDK conformance 전에는
format을 admission하지 않습니다. glTF external resource와 required extension,
product-scale 제품 file-open은 호스트별 Gate입니다. bounded local Browser/VS
Code 제품 file-open은 Khronos Box로 macOS arm64와 Linux x64 product-shell
evidence에서 통과했습니다. 42.98MB `A Beautiful Game`은 on-demand CC BY
4.0 product-scale reference source와 실제 Chrome SwiftShader first-frame,
16.9MB allocation cleanup에 이어 Browser product shell의 local file input,
검색·3D pick과 close cleanup을 통과했습니다. staged VS Code와 빈 profile에
clean-installed VSIX도 동일한 49개 source-native entity·573,952 unique
triangles, 16.9MB upload와 editor cleanup을 재현했습니다. physical GPU는
승인하지 않습니다.
RVT/DGN은 SDK 권리와 platform packaging, reopen qualification까지
요구합니다.

## 제품과 release 상태

이 foundation과 glTF/GLB admission은 `v0.1.0` immutable Community asset
이후 main에 추가된 experimental 계약입니다. 따라서 v0.1.0에서
multi-model 또는 비 IFC format이 지원된다고 표현하지 않습니다. 현재
main에서는 federation admission과 독립된 product Gate로 bounded glTF/GLB
Browser, staged VS Code와 clean-installed VSIX file-open을 통과했습니다.
두 CI 플랫폼은 동일한 model/resource/render projection과 cleanup을
재현했습니다. 별도 product-scale source/renderer probe와 Browser, staged
VS Code, clean-installed VSIX 제품 file-open도 통과했습니다. multi-source
composite first-frame·memory·cleanup도 generated IFC 두 개와 제품 규모 GLB
조합으로 통과했습니다. physical GPU와 실제 사용자/Spatial/survey evidence는
계속 held입니다. 이 결과는 v0.1.0 asset이나 broader glTF profile을 소급
승인하지 않습니다.

실제 Spatial consumer와 standalone Spatial bundle은 Explorer 저장소가
완료로 만들 수 없는 consumer-owned Gate입니다. 관련 진행은 Explorer
#9/#12와 Coni Spatial #13에 evidence URL과 exact contract로만 게시합니다.
