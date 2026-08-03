# Packages

BIM Explorer가 소유할 source와 product-neutral integration package를
둡니다.

예정 경계:

- `bim-model-source`: bounded source snapshot, range와 source-local identity
- `bim-renderer-3d`: generic 3D camera/render/picking/section/measurement
- `bim-explorer-ui`: model tree, property/relation/search composition
- `host-contracts`: Browser/VS Code Host adapter contract
- `spatial-integration`: optional public handoff와 Spatial overlay bridge

공용 Viewer Core/render protocol은 이 저장소에 복사하지 않습니다. durable
artifact와 conformance가 제공되기 전에는
`compatibility/viewer-core.json`을 `unresolved`로 유지합니다.

현재 [`viewer-core-consumer`](viewer-core-consumer/README.md)는 public
dependency가 없는 pre-conformance probe입니다. external upstream
conformance module을 명시적으로 주입할 때만 compatibility test를
실행하며 package 호환성을 주장하지 않습니다.
