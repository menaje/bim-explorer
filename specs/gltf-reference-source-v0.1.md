---
type: specification
status: draft
authority:
  - internal-gltf-reference-source
  - mesh-reference-admission
  - bounded-source-lifecycle
last_reviewed: 2026-08-11
---

# glTF reference source v0.1

## 상태와 역할

`bim-explorer-gltf-reference-source/0.1`은 glTF 2.0과 GLB를 read-only
reference mesh로 투영하는 내부 draft입니다. BIM semantic source, 원본
authoring document, geometry 변환 authority 또는 round-trip codec이
아닙니다.

source descriptor는 다음 경계를 명시합니다.

```text
sourceRole: derived-or-reference-mesh
semanticAuthority: false
writeAuthority: false
roundTripAuthority: false
```

## 입력 profile

첫 profile은 다음 입력만 허용합니다.

- 정확한 GLB 2.0 header와 JSON 뒤 optional BIN chunk
- glTF 2.0 JSON의 base64 `application/octet-stream` 또는
  `application/gltf-buffer` data URI
- glTF 2.0 JSON이 참조하고 caller가 명시적으로 공급한 동일 폴더 ASCII
  leaf-name `.bin` buffer
- glTF 2.0 JSON이 참조하고 caller가 명시적으로 공급한 동일 폴더 ASCII
  leaf-name `.png`, `.jpg` 또는 `.jpeg` image
- exact `data:image/png;base64,...` 또는 `data:image/jpeg;base64,...` image URI
- GLB BIN chunk 안의 `mimeType: image/png` 또는 `image/jpeg` image bufferView
- 하나의 default scene과 bounded node hierarchy
- node의 column-major matrix 또는 translation/rotation/scale
- indexed `TRIANGLES`
- Float32 `POSITION`과 `NORMAL`
- 또는 `extensionsUsed`와 `extensionsRequired` 양쪽에 선언된 ratified
  `KHR_mesh_quantization`: BYTE/UNSIGNED_BYTE/SHORT/UNSIGNED_SHORT `POSITION`과
  normalized BYTE/SHORT `NORMAL`
- 또는 양쪽 extension 배열에 required로 선언된 ratified
  `EXT_meshopt_compression`: `ATTRIBUTES`, `TRIANGLES`, `INDICES` mode와
  `FILTER_NONE` bufferView. fallback buffer는 payload 없는 placeholder만 허용
- unsigned byte, unsigned short 또는 unsigned int index
- material `baseColorFactor`
- OPAQUE material의 승인된 PNG/JPEG `baseColorTexture`, bounded `TEXCOORD_0`과
  glTF core 범위의 standard sampler

local sidecar 이름은
`^[A-Za-z0-9][A-Za-z0-9._-]*\.(bin|png|jpg|jpeg)$` 범위이고 `..`를
포함할 수 없습니다. scheme, slash/backslash, query/fragment, percent-encoding을
포함한 외부 HTTP, file 및 path URI는 fetch하지 않고 `NotSupportedError`로
거부합니다. caller가 공급한 누락·중복·미사용 sidecar도 fail closed합니다.
두 승인 확장 이외 required extension, primitive extension, profile 밖 image,
animation, skin, morph target, sparse accessor와 collapsed transform도 first
profile 밖입니다. 양자화 vertex accessor는 glTF extension의 4-byte alignment를
따르며 signed normalized normal은 decode 뒤 단위 벡터로 다시 정규화합니다.
승인 범위 밖 texture/image metadata는 geometry 입출력이나 network authority를
부여하지 않습니다. PNG/JPEG texture는 저장 방식과 무관하게
`baseColorTexture.texCoord = 0`,
primitive의 `TEXCOORD_0`, OPAQUE alpha mode와 한 개의 image source를 정확히
참조해야 합니다. normal, metallic-roughness, occlusion, emissive texture,
`KHR_texture_transform`, alpha mask/blend와 unused image/resource는 거부합니다.
JPEG는 SOF0 baseline sequential DCT, 8-bit precision, 단일 scan, 1개 grayscale
또는 3개 component와 bounded DQT/DHT만 허용합니다. progressive·arithmetic·
lossless frame, DAC/DNL, 다중 scan, 잘못된 restart와 trailing payload는
fail closed합니다.

## 상한

기본 parser 상한은 다음과 같습니다.

| 자원 | 상한 |
| --- | ---: |
| document + external resource aggregate | 64 MiB |
| JSON bytes | 4 MiB |
| decoded aggregate buffer | 64 MiB |
| meshopt decoded bufferView aggregate | 64 MiB |
| meshopt decoded/compressed ratio | 256:1 |
| external `.bin` + `.png`/`.jpg`/`.jpeg` resource | 16개 |
| projected PNG/JPEG texture | 16개 |
| encoded texture aggregate | 8 MiB |
| decoded RGBA aggregate | 16 MiB |
| image width 또는 height | 2,048 px |
| decoded/encoded image ratio | 256:1 |
| external resource leaf-name | UTF-8 128 bytes |
| node | 4,096 |
| node depth | 256 |
| mesh | 4,096 |
| primitive/accessor/bufferView | 16,384 |
| unique vertex | 2,000,000 |
| unique triangle | 4,000,000 |
| rendered occurrence | 100,000 |

호출자는 각 상한을 더 작게 설정할 수 있습니다. range read는 handle의
`maximumRequestBytes`와 session 전체 byte budget을 동시에 적용합니다.

## Geometry와 좌표

glTF의 meter, right-handed, Y-up local coordinates를
`gltf-local-meter-y-up`으로 명시합니다. node hierarchy의 world transform은
Float64 JavaScript number metadata로 계산하고, geometry range는
Float32 position/normal과 Uint32 index인 lossy display cache로 인코딩합니다.
texture가 없는 projection은 기존 `application/vnd.bim-explorer.geometry-range.v1`
(`BEXGEO01`)을 byte-identical하게 유지합니다. 승인된 base-color texture가 있으면
interleaved Float32 `TEXCOORD_0`와 exact image table을 인코딩합니다. PNG-only는
기존 `application/vnd.bim-explorer.geometry-range.v2` (`BEXGEO02`) bytes를
그대로 유지하고 JPEG 또는 mixed texture는 MIME code를 가진
`application/vnd.bim-explorer.geometry-range.v3` (`BEXGEO03`)를 사용합니다.

같은 mesh primitive를 여러 node가 참조하면 geometry record는 한 번만
인코딩하고 occurrence transform을 각각 유지합니다. 전체 bounds는 active
default scene occurrence의 transformed bounds 합집합입니다.

v0.1 geometry range의 `geometryExpressId`는 binary 호환용 unsigned record
key입니다. glTF source에서는 IFC Express ID가 아닙니다.

## Identity

각 occurrence는 다음 source-local identity를 가집니다.

```text
nativeId = node:<node-index>/mesh:<mesh-index>/primitive:<primitive-index>
globalId = null
localNumericId = positive range-local integer
```

Render/Pick ID와 external identity token은 source fingerprint와 exact
revision에 묶입니다. glTF source가 IFC GlobalId를 합성하거나 서로 다른
source의 native ID를 자동 병합해서는 안 됩니다.

## Lifecycle과 cleanup

source는 단일 immutable session만 엽니다. 모든 range handle은 protocol,
session, source, revision, snapshot과 layer context를 포함하며 stale
context를 거부합니다.

parser가 소유한 source/buffer/image sidecar 복사본, image validation scratch,
meshopt decode buffer와 intermediate
accessor array는 projection 뒤 지웁니다. meshoptimizer 1.2.0 single-thread WASM은
압축 source를 열 때만 기존 source Worker 안에서 초기화하며 cancel/switch는 Worker
종료로 동기 decode를 격리합니다. terminal source dispose는 retained geometry range를
0으로 덮고 identity index와 retained texture payload를 비웁니다. caller-owned input bytes와 renderer
GPU allocation은 source가 소유하지 않습니다.

## 보류

- Draco, meshopt의 OCTAHEDRAL/QUATERNION/EXPONENTIAL filter와 두 승인 확장 이외
  required extension
- arbitrary URI, nested path, glTF bufferView image material projection과
  progressive/arithmetic/lossless/DNL/multi-scan JPEG
- alpha mode, normal/metallic-roughness/occlusion/emissive texture,
  `KHR_texture_transform`과 broader material fidelity
- animation, skin과 morph target
- source write, conversion과 round-trip
- BIM property/classification authority
- cross-platform physical GPU와 OS-level peak GPU memory

## 현재 conformance evidence

고정된 Khronos Box GLB는 공식 `gltf-validator@2.0.0-dev.3.10`에서
error, warning, info와 hint가 모두 0입니다. 같은 source projection을 실제
headless Chrome WebGL2에 올려 98,412 non-background pixels, source-native
pick, selection highlight와 800-byte persistent allocation 전량 회수를
확인했습니다. SwiftShader API 경로만 관찰했으므로 physical GPU를
주장하지 않습니다.

같은 bounded snapshot은 IFC semantic source 두 개와 함께 federation
reference slot으로 admission했습니다. `nativeId` 선택, `globalId: null`,
unaligned shared-coordinate 거부, exact revision refresh와 deterministic
cleanup을 재현했습니다.

같은 공개 GLB는 실제 Browser local file input, staged VS Code Custom
Editor와 빈 profile에 설치한 VSIX에서도 열었습니다. 세 제품 경로는
1 entity·1 geometry record·1 instance·12 triangles, 86,486
non-background pixels, 756-byte source read, 800-byte GPU upload,
source-native selection과 `globalId: null`을 재현하고 path-free bridge,
Worker/session/GPU/editor cleanup을 통과했습니다. `.gltf` association과
embedded buffer 및 PNG data URI dispatch는 synthetic conformance가 보완합니다.

고정된 Khronos `Box.gltf` 2,898 bytes와 `Box0.bin` 648 bytes는 원본 commit과
각 SHA-256을 cache-only manifest로 고정했습니다. Browser는 두 파일을 한 번에
명시적으로 선택하고 VS Code는 JSON-declared sibling만 읽습니다. actual Chrome
151, staged VS Code 1.132와 clean-installed local VSIX는 Apple M2 Metal에서
동일한 3,546-byte composite source fingerprint, 12 triangles, 756-byte range
read, 800-byte upload, 86,486 pixels, source-native selection과 terminal cleanup을
재현했습니다. sample binary는 Git, VSIX와 release에 포함하지 않습니다.
이 제품 Gate는 single-source Browser/VS Code 경로이며 공개된 immutable
federated BIM Surface v0.2 runtime과 `.bimfed.json` admission을 변경하지 않습니다.

Cesium Box GLB를 normalized BYTE normal과 normalized SHORT position으로
결정적으로 파생한 1,632-byte `KHR_mesh_quantization` fixture도 원본·파생 SHA-256과
Khronos extension spec commit을 고정했습니다. 공식 Validator는 error, warning,
info와 hint 0개를 보고했고 headless renderer와 actual Chrome 151, staged VS Code
1.132, clean-installed local VSIX는 Apple M2 Metal에서 같은 24 vertices·12
triangles, 756-byte geometry read, 800-byte upload와 86,486 pixels를 재현했습니다.
원본과 파생 GLB는 cache-only이며 Git·VSIX·release에 포함하지 않습니다. 이 승인은
런타임 codec을 추가하지 않고 해당 required extension 하나만 허용합니다.

같은 Box를 `meshoptimizer@1.2.0`으로 결정적으로 파생한 1,696-byte
`EXT_meshopt_compression` fixture는 192 compressed bytes를 648 decoded bytes로
복원합니다. 공식 Validator는 error·warning·hint 0개와 Validator가 아직 확장
schema를 해석하지 못해 발생하는 고정 info 2개를 보고했습니다. headless renderer와
actual Chrome 151, staged VS Code 1.132, clean-installed local VSIX는 Apple M2
Metal에서 같은 24 vertices·12 triangles, 756-byte geometry read, 800-byte upload,
86,486 pixels와 terminal cleanup을 재현했습니다. decoder는 exact MIT dependency이고
Worker bundle에 포함되지만 sample은 cache-only입니다. 이 승인은 required
bufferView compression의 `FILTER_NONE`만 허용합니다.

고정된 Khronos `BoxTextured.gltf` 3,695 bytes, `BoxTextured0.bin` 840 bytes와
`CesiumLogoFlat.png` 3,750 bytes는 원본 commit과 각 SHA-256을 cache-only
manifest로 고정했습니다. 공식 Validator의 두 external resource 검사도
error·warning·info·hint가 모두 0입니다. source는 24 vertices·12 triangles,
3,750-byte texture source와 262,144-byte decoded base RGBA를 4,756-byte
geometry-range v2로 투영합니다. headless renderer와 actual Chrome 151, staged
VS Code 1.132, clean-installed local VSIX는 Apple M2 Metal에서 같은 86,486
pixels, 349,524-byte mipmap-aware GPU texture, 350,516-byte total upload와
terminal cleanup을 재현했습니다. sample의
원 라이선스와 Cesium 표장 조건은 manifest에 고정하며 binary는 Git·VSIX·release에
재배포하지 않습니다. 이 승인은 single-source 제품 범위이고 immutable federated
BIM Surface v0.2 runtime과 `.bimfed.json`에는 backport하지 않습니다.

같은 commit의 exact 5,956-byte `BoxTextured.glb`는 3,750-byte PNG를 GLB BIN
chunk의 image bufferView로 보관합니다. 공식 Validator issue 0개이며 외부
bundle과 byte-identical한 4,756-byte geometry-range v2와 SHA-256
`ce04af8c…a3cd`를 만듭니다. actual Chrome 151, staged VS Code 1.132와
clean-installed local VSIX도 Apple M2 Metal에서 각각 86,486 pixels,
349,524-byte mipmap-aware GPU texture, 350,516-byte total upload와 terminal
cleanup을 재현했습니다. 두 fixture 합계 6개 physical-GPU 제품 표면입니다.
원본은 cache-only이고 Git·VSIX·release에 재배포하지 않습니다.

같은 pinned commit의 exact BoxTextured geometry와 CompareDispersion의 749-byte
baseline JPEG를 결합한 cache-only `BoxTexturedJpeg.gltf`는 결정적으로
2,685 bytes와 동일 SHA-256을 재현합니다. 공식 Validator issue 0개이며 source와
renderer가 서로 독립적으로 JPEG structure를 검증한 뒤 24 vertices·12 triangles,
1,756-byte geometry-range v3와 SHA-256 `19193a36…c8dc5`를 만듭니다. actual
Chrome 151, staged VS Code 1.132와 clean-installed local VSIX의 Apple M2 Metal
3개 표면은 각각 86,486 pixels·16,384-byte decoded base RGBA·21,844-byte
mipmap-aware GPU texture·22,836-byte total upload와 terminal cleanup을
재현했습니다. 원본과 파생 sample은 cache-only이며 Git·VSIX·release에
재배포하지 않습니다.

별도 product-scale Gate는 42,977,928-byte `A Beautiful Game` GLB를 Browser,
staged VS Code와 clean-installed VSIX에서 열어 49개 source-native entity,
573,952 unique triangles, 16,896,412-byte source read와 16,900,016-byte GPU
upload를 동일하게 재현합니다. 원본은 on-demand cache에만 두고 제품 bundle에
포함하지 않습니다.

이 제품 결과는 bounded local read-only profile만 승인합니다. arbitrary URI,
glTF bufferView image, progressive/arithmetic/lossless JPEG·투명/다중 material
texture, Draco·다른 meshopt
filter·그 밖의 required extension,
broader material/geometry fidelity,
Linux/Windows physical GPU, BIM semantic authority, write와 round-trip은
승인하지 않습니다.
