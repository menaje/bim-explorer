# BIM Explorer Web

local IFC, bounded glTF/GLB 또는 bounded E57/LAS/LAZ를 Browser에서 선택해 Worker-isolated
source snapshot과 WebGL2 renderer로 여는 standalone read-only product
shell입니다. IFC는 host-neutral `bim-surface/0.1`이 `BimModelSource`, bounded
3D host와 semantic explorer의 수명주기를 합성하고, glTF/GLB는
source-native reference mesh explorer로, E57/LAS/LAZ는 source-neutral point
range와 `POINTS` renderer로 분기합니다.

- IFC/glTF/GLB는 64 MiB, E57은 32 MiB, LAS/LAZ는 8 MiB admission limit 뒤
  Worker로 전달합니다.
- `.gltf`가 local `.bin` buffer 또는 승인된 `.png`/`.jpg`/`.jpeg` image를 선언하면 source와
  최대 16개 sidecar를 한
  picker에서 함께 명시적으로 선택해야 합니다. ASCII leaf-name만 허용하고
  document와 resource 합산 64MiB, 중복·누락·미사용 resource를 검사합니다.
- 파일명, local path, credential을 Worker/report에 넣지 않습니다.
- source switch와 cancel은 prior Worker를 종료해 stale result를 차단합니다.
- tree, property, search와 3D pick은 같은 fingerprint/revision을 사용합니다.
- IFC와 glTF/GLB renderer range는 exact public Viewer Core session을 통과하고,
  initial/3D selection과 close cleanup은 public selection/Host lifecycle로
  투영합니다.
- glTF/GLB는 `nativeId`만 사용하고 IFC GlobalId나 BIM semantic authority를
  합성하지 않습니다.
- required `KHR_mesh_quantization`은 bounded integer position/normal을 Worker에서
  display range로 decode합니다. required `EXT_meshopt_compression`은 exact
  meshoptimizer 1.2.0을 압축 source에서만 lazy load하고 `FILTER_NONE` bufferView를
  bounded decode합니다. Draco·다른 meshopt filter·그 밖의 required extension은
  source admission 전에 거부합니다.
- 외부 PNG/JPEG, exact glTF PNG/JPEG data URI 또는 GLB PNG/JPEG bufferView의
  `baseColorTexture`는 OPAQUE material, `TEXCOORD_0`과 표준 sampler만
  geometry-range v2/v3로 투영해 WebGL2 sRGB texture로 표시합니다. JPEG는
  bounded baseline sequential profile만 허용합니다. glTF bufferView image,
  progressive/arithmetic/lossless JPEG, 비-OPAQUE alpha material mode와 다른
  material texture role은 거부합니다.
- LAS/LAZ와 single-scan E57은 기본 8 MiB·500,000-point 한도를 유지하고,
  multiple-scan E57만 명시적 32 MiB·2,000,000-point 한도와 전용 one-shot
  Worker를 사용합니다. source/range CPU buffer와 GPU allocation을 닫을 때
  회수합니다. point pick의 `point:n`은 exact source revision과 root range
  digest의 파생 순서 identity입니다. 대형 range는 파생 octree leaf chunk와
  coarse-to-full LOD로 열고, 각 전환에서 이전 GPU range/identity map을 회수한
  뒤 full detail에서 Worker hierarchy를 종료합니다. 이는 CRS, surveyed datum,
  source-native hierarchy·semantics 또는 BIM semantic authority를 제공하지
  않습니다.
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
`npm run qualify:gltf:external-resource-products`는 exact cache-only Khronos
`Box.gltf + Box0.bin`을 Browser 다중 선택, staged VS Code와 clean-installed
local VSIX에서 Apple M2 Metal로 열어 composite identity, local-only transport와
cleanup을 검증합니다. sample은 Git, package 또는 release에 포함하지 않습니다.
`npm run qualify:gltf:mesh-quantization-products`는 exact Box-derived
`KHR_mesh_quantization` GLB를 공식 Validator와 headless renderer에 이어 Browser,
staged VS Code와 clean-installed local VSIX의 Apple M2 Metal로 검증합니다. 원본과
파생 fixture는 cache-only이며 runtime codec이나 federated v0.2 지원을 추가하지
않습니다.
`npm run qualify:gltf:meshopt-products`는 exact Box-derived
`EXT_meshopt_compression` GLB를 공식 Validator의 고정 info 2건, headless decode,
Browser·staged VS Code·clean-installed local VSIX의 Apple M2 Metal로 검증합니다.
`FILTER_NONE`만 승인하며 sample과 immutable federated v0.2는 변경하지 않습니다.
`npm run qualify:gltf:texture-products`는 exact cache-only Khronos
`BoxTextured.gltf + BoxTextured0.bin + CesiumLogoFlat.png`와
`BoxTextured.glb`를 공식 Validator, headless renderer 및 각각의
Browser·staged VS Code·clean-installed local VSIX, 합계 6개 Apple M2 Metal
표면에서 검증합니다. sample은 라이선스·표장 조건만 manifest에 기록하고
재배포하지 않으며 immutable federated v0.2를 변경하지 않습니다.
`npm run qualify:gltf:jpeg-texture-products`는 exact BoxTextured geometry와
CompareDispersion의 749-byte baseline JPEG를 cache-only로 결합한 결정적 glTF를
공식 Validator, headless renderer, Browser·staged VS Code·clean-installed local
VSIX의 Apple M2 Metal 3개 표면에서 검증합니다. 1,756-byte geometry-range v3,
22,836-byte total upload와 terminal cleanup을 고정하며 원본·파생 sample과
immutable federated v0.2는 변경하거나 재배포하지 않습니다.
`npm run qualify:product:representative:physical-gpu`는 이 product-scale GLB와
공개 IFC를 software fallback이 비활성화된 Apple M2 Metal에서 각각 actual
Browser, staged VS Code와 clean-installed local VSIX로 검증합니다. 현재 exact
public Viewer Core 0.1.2 adapter의 range read, selection event와 terminal
source/session/Worker/Host cleanup도 같은 hardware run에 포함합니다. 합산
source bytes가 64MiB 제품 상한을 넘으므로 두 모델의 동시 합성,
Linux/Windows, OS-level peak GPU memory와 production support는 승인하지
않습니다.
`npm run qualify:viewer-core:product`는 public IFC와 product-scale GLB를 실제
Browser에서 열고 같은 entrypoint를 staged VS Code와 clean-installed local
VSIX에서도 검증합니다. 이 명령은 exact public package, generated bundle,
range byte accounting, 양방향 selection과 terminal cleanup을 한 증거에 묶으며
Marketplace publication이나 production support를 수행하지 않습니다.
`npm run qualify:las-laz:product:web`은 cache-only 공개 LAS/LAZ pair를 각각
실제 Browser local file input으로 열어 exact point-range/visual parity,
`laz-perf@0.0.6` Worker isolation과 source/Worker/CPU/GPU cleanup을 확인합니다.
`npm run qualify:las-laz:product:vscode`는 같은 projection을 staged VS Code와
clean-installed VSIX에서 다시 확인합니다. 샘플은 Git, package 또는 release에
포함하지 않습니다.
`npm run qualify:e57:product:web`은 cache-only 공개 E57을 실제 Browser local
file input으로 열어 7,680-point range, visible projection과
source/Worker/CPU/GPU cleanup을 확인합니다. `npm run
qualify:e57:product:vscode`는 같은 projection을 staged VS Code와
clean-installed VSIX에서 재현합니다. E57 샘플도 재배포하지 않습니다.
`npm run qualify:e57:spherical:product:web`과
`npm run qualify:e57:spherical:product:vscode`는 155,201개 유효점을 만드는
spherical RAE/intensity/RGB profile을 같은 세 제품 경로에서 검증합니다.
intensity는 display range에서 lossy omitted이며 원본 sample은 cache-only입니다.
`npm run qualify:e57:multiple-scan:product:web`과
`npm run qualify:e57:multiple-scan:product:vscode`는 다섯 scan·1,213,990-point
cache-only E57을 pose-applied range로 열어 Browser, staged VS Code와
clean-installed VSIX의 동일 투영 및 cleanup을 검증합니다. pose는 local
registration으로만 취급합니다.
`npm run qualify:point-cloud:picking:web`은 cache-only LAS, LAZ와 five-scan
E57을 actual Chrome에서 열고 32-bit point selection, 선택 좌표 GPU readback과
transient target/source/Worker/CPU/GPU cleanup을 검증합니다. 샘플은 재배포하거나
제품에 포함하지 않습니다.
`npm run qualify:point-cloud:lod`는 같은 five-scan E57을 Browser, staged VS Code와
clean-installed VSIX에서 51개 chunk·3개 LOD로 전환하고 root-range point identity,
단계별 GPU/identity-map release와 최종 hierarchy cleanup을 검증합니다.
