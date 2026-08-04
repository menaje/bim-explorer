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
GPU allocation 전량 회수로 검증했습니다. 이는 SwiftShader Browser API
evidence이며 physical GPU나 제품 file-open 지원을 뜻하지 않습니다.
