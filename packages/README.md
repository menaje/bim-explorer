# Packages

BIM Explorer가 소유할 source와 product-neutral integration package를
둡니다.

예정 경계:

- `bim-model-source`: bounded source snapshot, range와 source-local identity
- `bim-renderer-3d`: bounded geometry staging과 generic 3D backend lifecycle
- `bim-semantic-explorer`: model tree, property/relation/search composition
- `host-contracts`: Browser/VS Code Host adapter contract
- `spatial-integration`: optional public handoff와 Spatial overlay bridge
- `openbim-explorer`: source-bound BCF·IDS·bSDD read-only exploration
- `bim-federation`: multi-source identity·alignment·reference-format Gate
- `gltf-reference-source`: bounded glTF/GLB read-only reference mesh
- `las-laz-point-source`: bounded LAS/LAZ read-only point-range projection
- `e57-point-source`: bounded E57 read-only point-range projection

공용 Viewer Core/render protocol은 이 저장소에 복사하지 않습니다.
[`viewer-core-consumer`](viewer-core-consumer/README.md)는
`@menaje/viewer-core`와 `@menaje/viewer-render-protocol` package 0.1.2의 immutable
GitHub Release asset을 exact URL, SHA-256과 lock integrity로 소비합니다.
실제 `BimModelSource`와 3D renderer를 upstream conformance/runtime에 연결한
결과는 `compatibility/viewer-core.json`의 `experimental` admission이
소유합니다.

[`bim-model-source`](bim-model-source/README.md)는 web-ifc adapter artifact를
raw source fingerprint, immutable tree/entity identity와 bounded binary
range directory로 투영하는 내부 read-only draft입니다. 공개 대표 IFC의
multi-range source artifact, rendered first-frame과 공용 Viewer Core
RenderSource conformance를 통과했습니다.

[`bim-renderer-3d`](bim-renderer-3d/README.md)는 source-neutral geometry
range decoder, bounded initial-range plan과 headless resource receipt를
구현합니다. 공개 모델 첫 range의 headless mount와 실제 Chromium WebGL2
upload·rasterized first frame·dispose를 통과했습니다. visibility 기반
range loading, pointer/picking/section, Browser/VS Code Webview host와
Viewer Core 3D mount도 검증했습니다. physical GPU qualification과 실제
제품 entrypoint의 Viewer Core 채택은 별도 Gate입니다.

[`bim-semantic-explorer`](bim-semantic-explorer/README.md)는 bounded source
query를 spatial/product tree, search, inspector, relation navigation,
revision-bound 3D selection, isolate와 source-local saved view로 투영합니다.
generated semantic IFC의 실제 Chromium DOM/WebGL2 probe를 통과했지만
호환 source의 bounded primitive property value도 선택 시 lazy load합니다.
public representative semantic scale, value-level Browser evidence와 advanced
relation graph는 보류합니다.

[`ifc-engine-contract`](ifc-engine-contract/README.md)는 candidate adapter의
동일 fixture 비교에 사용하는 experimental report validator입니다. public
package나 accepted IFC profile은 아닙니다.

[`spatial-integration`](spatial-integration/README.md)은 source-bound IFC
selection을 service-owned Canonical mapping, synchronized 2D/3D identity,
opaque Context Reference와 BIM base + Spatial diff review로 연결하는 optional
bridge입니다. Spatial private package나 설치된 extension에 의존하지
않습니다.

[`openbim-explorer`](openbim-explorer/README.md)는 bounded BCF XML 3.0
local import/export, IDS 1.0 document/result와 explicit bSDD lookup을 같은
source fingerprint/revision에 묶습니다. full IDS validator, 자동 network,
Spatial Revision이나 acceptance authority는 소유하지 않습니다.

[`bim-federation`](bim-federation/README.md)은 stable source slot 아래
서로 다른 native revision/identity를 유지하고, source별 visibility와
partial/stale 상태, Float64 alignment, cross-source saved view를 제공합니다.
IFC semantic source와 bounded glTF/GLB reference mesh를 admission하며
source-native identity를 IFC GlobalId와 합치지 않습니다. 나머지 format은
view/query/write/round-trip Gate만 등록하며 codec이 없는 format을 지원
대상으로 표현하지 않습니다. aligned source의 geometry range를 하나의
source-neutral renderer projection으로 namespacing하는 adapter도 제공하며,
제품 규모 GLB 한 개와 generated IFC 두 개의 동시 first frame과 cleanup을
검증했습니다.

[`gltf-reference-source`](gltf-reference-source/README.md)는 glTF 2.0/GLB의
embedded geometry를 bounded generic 3D range로 투영합니다. 이 source는
mesh reference일 뿐 BIM semantics, write 또는 round-trip authority가
아닙니다.

[`las-laz-point-source`](las-laz-point-source/README.md)는 LAS 1.0–1.3의
point-format 2/3과 LASzip LAZ를 bounded Float64-origin/relative-Float32/RGBA8
range로 투영합니다. exact `laz-perf@0.0.6`은 Browser 전용 Worker에서
실행하며 CRS, source-declared point identity·LOD, semantics, write 또는
round-trip authority를 제공하지 않습니다. 제품 renderer의 `point:n` 선택은
exact source revision과 range digest 안의 파생 순서 identity입니다.

[`e57-point-source`](e57-point-source/README.md)는 E57 1.0 단일 scan의
Cartesian XYZ 또는 spherical range/azimuth/elevation default-BitPack record를
모든 page CRC와 packet boundary를 검증한 뒤 같은 source-neutral point range로
투영합니다. optional intensity는 stream alignment까지만 해제하고 lossy omitted로
표시합니다. 자체 JavaScript decoder는 격리 Worker 실행을 전제로 하며 CRS,
scan-pose authority, semantics, write 또는 round-trip authority를 제공하지
않습니다.
현재 main은 Cartesian bounded profile뿐 아니라 spherical RAE/intensity/RGB
profile도 Browser, staged VS Code와 clean-installed VSIX 제품 open을
통과했습니다. intensity는 lossy omitted이고 E57 format family나 federation
coordinate authority는 admission하지 않습니다. 별도 qualification-only
경로는 cache-only 공개 sample의 다섯 scan·1,213,990개 record, structured
row/column stream과 네 explicit pose/한 identity pose를 독립 기준과 동일하게
해제·투영했습니다. multiple-scan Browser/VS Code 제품 open, CRS/surveyed datum,
extension과 format admission은 계속 held입니다. 파생 point 선택은 별도 actual
Browser·VS Code·clean VSIX Gate를 통과했지만 E57 native identity나 coordinate
authority를 만들지 않습니다.
