# Packages

BIM Explorer가 소유할 source와 product-neutral integration package를
둡니다.

예정 경계:

- `bim-model-source`: bounded source snapshot, range와 source-local identity
- `bim-renderer-3d`: bounded geometry staging과 generic 3D backend lifecycle
- `bim-semantic-explorer`: model tree, property/relation/search composition
- `host-contracts`: Browser/VS Code Host adapter contract
- `spatial-integration`: optional public handoff와 Spatial overlay bridge

공용 Viewer Core/render protocol은 이 저장소에 복사하지 않습니다. durable
artifact와 conformance가 제공되기 전에는
`compatibility/viewer-core.json`을 `unresolved`로 유지합니다.

현재 [`viewer-core-consumer`](viewer-core-consumer/README.md)는 public
dependency가 없는 pre-conformance probe입니다. external upstream
conformance module을 명시적으로 주입할 때만 compatibility test를
실행하며 package 호환성을 주장하지 않습니다.

[`bim-model-source`](bim-model-source/README.md)는 web-ifc adapter artifact를
raw source fingerprint, immutable tree/entity identity와 bounded binary
range directory로 투영하는 내부 read-only draft입니다. 공개 대표 IFC의
multi-range source artifact까지 통과했지만 공용 Viewer Core package
호환성과 rendered first-frame은 아직 주장하지 않습니다.

[`bim-renderer-3d`](bim-renderer-3d/README.md)는 source-neutral geometry
range decoder, bounded initial-range plan과 headless resource receipt를
구현합니다. 공개 모델 첫 range의 headless mount와 실제 Chromium WebGL2
upload·rasterized first frame·dispose를 통과했습니다. visibility 기반
range loading과 pointer/picking/section은 아직 없지만 perspective·
orthographic fit, orbit·pan·zoom camera state와 revision-bound Render ID
hide/show core를 검증했습니다. physical GPU qualification과 product Host는
아직 없습니다.

[`bim-semantic-explorer`](bim-semantic-explorer/README.md)는 bounded source
query를 spatial/product tree, search, inspector, relation navigation,
revision-bound 3D selection, isolate와 source-local saved view로 투영합니다.
generated semantic IFC의 실제 Chromium DOM/WebGL2 probe를 통과했지만
public representative scale, value-level property payload와 advanced
relation graph는 보류합니다.

[`ifc-engine-contract`](ifc-engine-contract/README.md)는 candidate adapter의
동일 fixture 비교에 사용하는 experimental report validator입니다. public
package나 accepted IFC profile은 아닙니다.
