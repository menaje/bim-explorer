# glTF reference source

glTF 2.0과 GLB를 BIM semantic authority가 아닌 read-only reference mesh로
여는 bounded source입니다.

첫 profile은 다음만 허용합니다.

- GLB의 JSON/BIN chunk, `.gltf`의 base64 data URI buffer 또는 명시적으로
  공급된 동일 폴더 ASCII leaf-name `.bin` buffer
- default scene의 node hierarchy와 matrix 또는 TRS
- indexed `TRIANGLES`
- Float32 `POSITION`/`NORMAL`, 또는 required `KHR_mesh_quantization` 아래의
  bounded integer `POSITION`과 normalized signed integer `NORMAL`
- material `baseColorFactor`
- source-local `nativeId`와 immutable range session

local resource bundle은 최대 16개 sidecar와 document 합산 64MiB로 제한합니다.
Browser는 source와 sidecar를 한 번에 명시적으로 고르고, VS Code는 JSON에 선언된
동일 폴더 regular non-symlink `.bin`만 안정적으로 읽습니다. scheme, separator,
`..`, query/fragment, percent-encoded name, 누락·중복·미사용 resource, 외부 image와
network fetch, `KHR_mesh_quantization` 이외 required extension, animation, skin,
morph target, sparse accessor,
write와 round-trip은 거부합니다. 출력 geometry는
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
같은 파일의 Browser 제품 local file-open, staged VS Code와 clean-installed
VSIX도 동일한 49개 source-native entity·573,952 unique triangles,
16,896,412-byte read·16,900,016-byte upload와 cleanup을 별도 evidence로
통과했습니다. 현재 public Viewer Core 0.1.2 제품 entrypoint를 사용한 actual
Chrome 151, staged VS Code 1.132와 clean-installed local VSIX도 software
fallback을 끈 Apple M2 Metal에서 48,762 pixels, 같은 range/upload bytes와
terminal cleanup을 재현해 bounded GLB physical GPU Gate를 통과했습니다.
별도 Khronos `Box.gltf + Box0.bin` cache-only fixture도 Browser, staged VS Code와
clean-installed local VSIX에서 동일한 composite SHA-256, 756-byte geometry read,
800-byte upload, 86,486 pixels와 terminal cleanup을 Apple M2 Metal로 재현했습니다.
`KHR_mesh_quantization`은 Cesium Box를 normalized BYTE normal과 SHORT position으로
결정적으로 파생한 1,632-byte cache-only GLB에서 공식 Validator issue 0개와 같은
세 Apple M2 Metal 제품 표면을 통과했습니다. 이 경로는 코덱을 추가하지 않으며
확장은 `extensionsUsed`와 `extensionsRequired` 양쪽에 정확히 선언되어야 합니다.
Linux/Windows hardware, arbitrary URI, external image, Draco·meshopt·그 밖의
required extension,
OS-level peak GPU memory와 production support는 별도 Gate입니다.

qualified snapshot은 BIM federation에 `gltf`/`glb` reference slot으로
등록할 수 있습니다. selection은 source slot, exact revision과
source-native `nativeId`에 묶이며 unaligned source는 shared-coordinate
projection을 fail closed합니다.
