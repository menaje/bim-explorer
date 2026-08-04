# BIM Spatial integration

BIM Explorer의 immutable source identity를 Coni Spatial의
revision-bound mapping·Context Reference·live/diff review에 선택적으로
연결하는 source-neutral draft입니다.

- Spatial package나 설치된 extension을 import하지 않습니다.
- Viewer Core/Render Protocol package 0.1.2와 wire protocol 0.1.0을
  exact pin으로 요구합니다.
- IFC GlobalId는 source fingerprint·revision과 함께 bridge에 전달합니다.
- Canonical Entity ID와 2D/3D Render/Pick mapping은 Spatial bridge만
  반환합니다.
- Context Reference 요청에는 Spatial Render/Pick ID와 viewport만 넣으며
  Canonical ID, path, credential 또는 acceptance capability를 제출하지
  않습니다.
- BIM base와 Spatial live/diff layer의 owner·revision을 합치지 않습니다.
- semantic, geometry, representation, render, requirement diff category를
  항상 구분합니다.
- bridge가 없으면 BIM Explorer standalone 상태를 그대로 유지하고
  optional handoff descriptor만 만들 수 있습니다.

계약은 `bim-explorer-spatial-integration/0.1`이며 read-only입니다.
Spatial Workspace authority, mapping, Context record, accept/publish와
source mutation은 이 package의 권한이 아닙니다.
