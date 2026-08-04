# BIM federation

서로 다른 BIM source의 identity를 합치지 않고 하나의 read-only 탐색
context에 배치하는 post-v0.1 foundation입니다.

- stable `federationSourceId` 아래 exact native source fingerprint/revision을
  유지합니다.
- source별 visibility와 `ready`·`partial`·`stale` 상태를 분리합니다.
- same-CRS IFC MapConversion 또는 provenance가 있는 explicit Float64
  transform만 허용합니다.
- cross-source selection과 saved view는 source slot과 native revision에
  함께 묶입니다.
- incremental refresh는 한 source slot만 교체하고 이전 revision의
  selection/viewpoint를 stale로 거부합니다.
- IFC, glTF/GLB, LAS/LAZ/E57, 3D Tiles, RVT/DGN의
  view/query/write/round-trip admission을 서로 분리합니다.

현재 실제 source admission은 기존 IFC4 `ReferenceView_V1.2` read-only
semantic snapshot과 bounded glTF 2.0/GLB read-only reference mesh입니다.
glTF/GLB는 source-native `nativeId`만 사용하고 IFC GlobalId나 BIM semantic
authority를 만들지 않습니다. LAS/LAZ/E57, 3D Tiles, RVT/DGN entry는
capability와 qualification Gate만 정의하며 codec, SDK, redistribution
또는 제품 지원을 주장하지 않습니다. datum transformation, 실제 측량
좌표, 대형 federation 성능, 실제 Spatial consumer도 별도 evidence가
필요합니다.
