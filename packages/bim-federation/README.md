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
- aligned source의 range·Render/Pick ID를 source slot별로 namespacing하고
  source transform을 미리 합성한 derived renderer projection을 제공합니다.

현재 실제 source admission은 기존 IFC4 `ReferenceView_V1.2` read-only
semantic snapshot과 bounded glTF 2.0/GLB read-only reference mesh입니다.
glTF/GLB는 source-native `nativeId`만 사용하고 IFC GlobalId나 BIM semantic
authority를 만들지 않습니다. LAS/LAZ/E57, 3D Tiles, RVT/DGN entry는
capability와 qualification Gate만 정의하며 codec, SDK, redistribution
또는 제품 지원을 주장하지 않습니다.

제품 규모 qualification은 generated IFC architecture/MEP source와 on-demand
CC BY 4.0 `A Beautiful Game` GLB를 한 first frame에 동시에 올려 53 instances,
573,976 unique triangles, 19회 range read, 16,902,256-byte upload 및 headless/
Chrome WebGL2 cleanup을 통과했습니다. 이 결과는 synthetic IFC와 reference
mesh 조합이며 datum transformation, 실제 측량 좌표, 실제 Spatial consumer,
사용자 수요나 production federation evidence는 아닙니다.

held format의 다음 구현 후보는
[`bim-explorer-reference-format-intake/0.1`](../../specs/reference-format-intake-v0.1.md)으로
접수합니다. evaluator는 실제 multi-source 과업, cache-only 또는 redistributable
public test fixture,
codec/SDK 권리, coordinate와 lifecycle evidence의 누락을 deterministic
code로 반환합니다. 완전한 packet도 별도 qualification 전에는 registry
admission, BIM semantics, write, round-trip 또는 Spatial authority를 만들지
않습니다.
