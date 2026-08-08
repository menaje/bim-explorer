---
type: specification
status: draft
authority:
  - internal-gltf-reference-source
  - mesh-reference-admission
  - bounded-source-lifecycle
last_reviewed: 2026-08-04
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
- 하나의 default scene과 bounded node hierarchy
- node의 column-major matrix 또는 translation/rotation/scale
- indexed `TRIANGLES`
- Float32 `POSITION`과 `NORMAL`
- unsigned byte, unsigned short 또는 unsigned int index
- material `baseColorFactor`

외부 HTTP, file 및 path URI를 fetch하지 않고 `NotSupportedError`로
거부합니다. required extension, primitive extension, animation, skin,
morph target, sparse accessor와 collapsed transform도 first profile 밖입니다.
optional texture/image metadata는 geometry 입출력이나 network authority를
부여하지 않습니다.

## 상한

기본 parser 상한은 다음과 같습니다.

| 자원 | 상한 |
| --- | ---: |
| source bytes | 64 MiB |
| JSON bytes | 4 MiB |
| decoded aggregate buffer | 64 MiB |
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

parser가 소유한 source/buffer 복사본과 intermediate accessor array는
projection 뒤 지웁니다. terminal source dispose는 retained geometry range를
0으로 덮고 identity index를 비웁니다. caller-owned input bytes와 renderer
GPU allocation은 source가 소유하지 않습니다.

## 보류

- Draco, meshopt와 기타 required extension
- external relative resource bundle
- texture/image decode와 material fidelity
- animation, skin과 morph target
- source write, conversion과 round-trip
- BIM property/classification authority
- product-scale reference geometry와 physical/cross-platform GPU

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
embedded data URI dispatch는 synthetic conformance가 보완합니다.

별도 product-scale Gate는 42,977,928-byte `A Beautiful Game` GLB를 Browser,
staged VS Code와 clean-installed VSIX에서 열어 49개 source-native entity,
573,952 unique triangles, 16,896,412-byte source read와 16,900,016-byte GPU
upload를 동일하게 재현합니다. 원본은 on-demand cache에만 두고 제품 bundle에
포함하지 않습니다.

이 제품 결과는 bounded local read-only profile만 승인합니다. external
resource bundle, required extension, broader material/geometry fidelity,
physical GPU, BIM semantic authority, write와 round-trip은 승인하지 않습니다.
