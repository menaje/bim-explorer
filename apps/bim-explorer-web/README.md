# BIM Explorer Web

local IFC 또는 bounded glTF/GLB를 Browser에서 선택해 Worker-isolated
source snapshot과 WebGL2 renderer로 여는 standalone read-only product
shell입니다. IFC는 `BimModelSource`와 semantic explorer로, glTF/GLB는
source-native reference mesh explorer로 분기합니다.

- source는 64 MiB admission limit 뒤 Worker로 전달합니다.
- 파일명, local path, credential을 Worker/report에 넣지 않습니다.
- source switch와 cancel은 prior Worker를 종료해 stale result를 차단합니다.
- tree, property, search와 3D pick은 같은 fingerprint/revision을 사용합니다.
- glTF/GLB는 `nativeId`만 사용하고 IFC GlobalId나 BIM semantic authority를
  합성하지 않습니다.
- timing과 source/geometry/metadata/range budget을 diagnostics로 표시합니다.
- account, telemetry, 외부 upload를 요구하지 않습니다.

`npm run start:web`은 loopback-only local server를 실행합니다. generated
qualification fixture는 `--fixture synthetic`을 명시한 경우에만 노출합니다.
`npm run qualify:product:web:public`은 고정 digest의 공개 IFC를 실제 local
file input으로 선택하며 server가 모델 bytes를 제공하지 않습니다. 공개
fixture와 실제 고객 IFC는 package에 포함하거나 Git에 추적하지 않습니다.
`npm run qualify:gltf:product`는 고정 Khronos Box GLB를 실제 local file
input으로 선택하고 staged VS Code와 clean-installed VSIX까지 같은 bounded
reference projection을 확인합니다. 공개 GLB도 package나 Git에 포함하지
않습니다. `npm run qualify:gltf:product-scale:web`은 on-demand cache의
42.98MB `A Beautiful Game` GLB를 실제 Browser local file input으로 열어
bounded Worker/renderer, 검색·3D pick과 close cleanup을 확인합니다.
`npm run qualify:gltf:product-scale:vscode`와
`npm run qualify:gltf:product-scale:vscode-install`은 같은 파일을 staged
Custom Editor와 빈 profile에 설치한 VSIX에서 열어 동일한 bounded reference
projection과 editor cleanup을 확인합니다.
