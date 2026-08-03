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
