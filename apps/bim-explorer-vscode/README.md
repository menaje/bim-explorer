# BIM Explorer for VS Code

`.ifc`, `.gltf`, `.glb`를 같은 `bim-explorer-web` application, isolated
source Worker와 WebGL2 renderer로 여는 read-only Custom Editor host입니다.
IFC는 `BimModelSource`와 semantic explorer를 사용하고, glTF/GLB는
source-native reference mesh explorer를 사용합니다.

- source URI는 extension host 안에서만 사용하며 webview message와
  diagnostics에 넣지 않습니다.
- `file:` URI, regular file, non-symlink와 최대 64 MiB를 읽기 전후에
  검증합니다.
- source 변경은 exact URI watcher가 새 generation을 보내 기존 Worker와
  fingerprint-scoped cache를 무효화합니다.
- cancel, retry와 diagnostics command는 active editor에만 전달합니다.
- editor close는 webview Worker/GPU를 파기하고 extension-side watcher와
  path-free report를 정리합니다.
- 계정, telemetry, upload와 Coni Spatial 설치가 필요하지 않습니다.

개발 소스는 저장소 공용 runtime을 직접 사용합니다. `npm run
package:vscode`는 동일 파일을 staging한 뒤 독립 설치 가능한 VSIX를
생성합니다. clean-install 검증은 빈 profile에 설치된 확장 자체로 generated
IFC, on-demand 공개 IFC와 Khronos Box GLB를 다시 열어 source/render
projection과 close cleanup까지 확인하며, 공개 fixture를 VSIX에 포함하지
않습니다. 42.98MB `A Beautiful Game` GLB도 staged Custom Editor와
clean-installed VSIX에서 49개 source-native entity·573,952 unique triangles,
bounded WebGL2 projection과 close cleanup을 재현합니다. 이 검증은
`npm run qualify:gltf:product-scale:vscode`와
`npm run qualify:gltf:product-scale:vscode-install`로 실행하며 원본 GLB를
package에 포함하지 않습니다. glTF/GLB bridge는 정규화된 format과 bytes만
보내며 local URI나 IFC GlobalId를 전달하거나 합성하지 않습니다. package
안에는 MPL-2.0, third-party notice, exact source 제공 경로와 release
검증 정책이 포함됩니다.
