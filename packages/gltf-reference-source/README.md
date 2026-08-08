# glTF reference source

glTF 2.0과 GLB를 BIM semantic authority가 아닌 read-only reference mesh로
여는 bounded source입니다.

첫 profile은 다음만 허용합니다.

- GLB의 JSON/BIN chunk 또는 `.gltf`의 base64 data URI buffer
- default scene의 node hierarchy와 matrix 또는 TRS
- indexed `TRIANGLES`
- Float32 `POSITION`/`NORMAL`과 unsigned integer index
- material `baseColorFactor`
- source-local `nativeId`와 immutable range session

외부 URI와 network fetch, required extension, animation, skin, morph target,
sparse accessor, write와 round-trip은 거부합니다. 출력 geometry는
`application/vnd.bim-explorer.geometry-range.v1` display cache이며 원본
glTF/GLB의 source authority가 아닙니다.

Khronos Box GLB는 공식 Validator의 issue 0개와 실제 headless Chrome
WebGL2의 98,412 rasterized pixels, revision-bound native pick 및 800-byte
GPU allocation 전량 회수로 source/renderer를 검증했습니다. 같은 공개
GLB는 Browser local file input, staged VS Code와 clean-installed VSIX에서
12 triangles, 86,486 product pixels, source-native selection,
path-free bridge와 cleanup을 통과했습니다. 모두 SwiftShader Chromium API
evidence이며 physical GPU나 broader glTF profile을 뜻하지 않습니다.

별도 product-scale reference qualification은 고정된 42.98MB Khronos
`A Beautiful Game` GLB를 사용합니다. 공식 Validator issue 0개,
417,028 vertices, 573,952 unique triangles, 49 instances와 1,499,072
instanced triangles를 headless 및 실제 Chrome SwiftShader WebGL2에서
검증했고 16,900,016-byte allocation을 전량 회수했습니다. embedded texture와
`KHR_materials_transmission`/`KHR_materials_volume`은 source에 존재하지만
이 bounded geometry projection의 material authority로 승격하지 않습니다.
같은 파일의 Browser 제품 local file-open, source-native 3D pick과 cleanup도
별도 evidence로 통과했습니다. VS Code 제품 file-open과 physical GPU는
계속 별도 Gate입니다.

qualified snapshot은 BIM federation에 `gltf`/`glb` reference slot으로
등록할 수 있습니다. selection은 source slot, exact revision과
source-native `nativeId`에 묶이며 unaligned source는 shared-coordinate
projection을 fail closed합니다.
