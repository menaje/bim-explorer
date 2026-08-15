# BIM Explorer

raw BIM 모델을 로컬에서 열어 3D 형상, 공간 구조, 속성과 관계를 탐색하는
독립 오픈소스 제품입니다.

첫 semantic vertical slice는 read-only IFC이고, 첫 비 IFC format은
bounded glTF 2.0/GLB reference mesh입니다. `.gltf`는 명시적으로 함께 고른
동일 폴더 `.bin`, `.png`, `.jpg`, `.jpeg` sidecar까지 bounded local bundle로
열 수 있습니다. 제품명과 저장소 이름은
`bim-explorer`를 사용하며 Coni Spatial의 설치나 계정을 요구하지 않습니다.

> 현재 상태: 공개·immutable v0.1.0 Community release와 read-only
> source·3D·semantic explorer vertical slice 단계입니다.
> 두 후보는 base·mapped synthetic fixture를 통과했고 web-ifc local Browser
> Worker smoke, bounded local-file/source-session과 model-opened checkpoint
> 취소·정리, 1,024-Wall scale step과 46.77MB CC BY 4.0 공개 IFC의
> Node CPU/RSS·Browser parse/geometry budget도 통과했습니다. generated
> malformed/truncated 3-case corpus는 두 후보의 격리 process에서 반복
> 거부·종료·정상 IFC 복구를 통과했고, web-ifc는 실제 Chromium Worker에서
> model close·engine dispose·Worker 종료와 후속 정상 parse를 재현했습니다.
> mapped IFC에서는 raw fingerprint, spatial tree/property identity, shared
> binary geometry range와 stale/budget 거부를 통과했습니다. 같은 공개
> IFC를 read-only source artifact로 투영해 3,569 products, 3개 bounded
> geometry range, 6개 deferred semantic detail range와 비렌더링 제품
> diagnostic도 재현했습니다. first-frame은 detail을 읽지 않고 선택
> 제품의 exact detail slice만 읽습니다. 첫 range의
> 2,458 geometry records·3,182 instances를 bounded headless renderer와 실제
> Chromium WebGL2에 mount하고 전량 회수했습니다. camera/view/pointer input,
> revision-bound pick/highlight, section/measurement, large-coordinate origin,
> progressive range cache, isolate/show-all, affected-bounds atomic redraw와
> visibility-first range도 실제 Browser에서 재현했습니다. Browser 제품
> shell과 staged VS Code read-only Custom Editor는 같은 IFC source
> fingerprint, model/renderer projection, 실제 Chromium WebGL2와
> source switch/editor-exit cleanup을 통과했습니다. 독립 VSIX도 빈
> profile에 clean install한 뒤 설치본으로 같은 fixture, WebGL2와 close
> cleanup을 다시 통과했습니다. 이어 46.77MB 공개 IFC도 Browser와
> clean-installed VSIX에서 각각 3,569 products·261,424 triangles·3 ranges로
> 열고 같은 첫-range WebGL2 projection과 cleanup을 재현했습니다.
> bounded glTF/GLB도 같은 제품 shell의 격리 Worker와 generic renderer로
> 열립니다. Khronos Box GLB는 Browser, staged VS Code와 clean-installed
> VSIX에서 source-native identity, `globalId: null`, 12 triangles,
> 86,486 pixels, path-free bridge와 Worker/GPU/editor cleanup을 통과했습니다.
> 같은 세 제품 경로는 macOS arm64와 Linux x64 CI에서도 고정 VS Code
> 1.131.0·SwiftShader WebGL2로 동일한 projection과 cleanup을 재현했습니다.
> 42.98MB `A Beautiful Game` GLB도 Browser, staged VS Code와 clean-installed
> VSIX에서 49개 source-native entity·573,952 unique triangles, 16,896,412-byte
> read·16,900,016-byte upload와 48,765 pixels를 동일하게 재현했습니다.
> occurrence/type primitive property value는 별도 lazy range로 읽고,
> IFC4 projected CRS/MapConversion과 fingerprinted source
> precision·lossy Float32 display tessellation 경계도 통과했습니다. complex
> property, 실제 측량 좌표/datum 변환과 source-precision geometry export는
> 제한합니다. federated Surface v0.2의 generated GLB–IFC–GLB와 별도로,
> 46.77MB 공개 IFC 및 42.98MB product-scale GLB 제품 경로도 software
> rasterizer를 끈 actual Browser, staged VS Code와 clean-installed local
> VSIX에서 Apple M2 Metal physical GPU를 통과했습니다. 두 대표 모델은 합산
> source bytes가 64MiB 제품 상한을 넘으므로 각각의 세션에서 검증했습니다.
> 이 재검증은 현재 exact public Viewer Core 0.1.2 제품 adapter를 거쳐 IFC
> 4,193,868 bytes와 GLB 16,896,412 bytes의 range read, selection event와
> source/session/Worker/Host terminal cleanup까지 확인했습니다.
> 별도 cache-only Khronos `Box.gltf`와 `Box0.bin`은 Browser 다중 파일 선택,
> staged VS Code의 선언된 sibling read와 clean-installed local VSIX에서 같은
> 3,546-byte composite fingerprint, 12 triangles, 86,486 pixels와 cleanup을
> Apple M2 Metal로 재현했습니다. 이 Gate는 최대 16개 same-folder ASCII `.bin`과
> 합산 64MiB까지만 허용하며 임의 URI, path traversal, symlink와 runtime network를
> 거부합니다. 외부 image는 이 buffer Gate와 분리해 아래 PNG texture Gate에서만
> 제한적으로 승인합니다.
> ratified `KHR_mesh_quantization`은 exact Box GLB에서 position/normal을
> deterministic하게 양자화한 1,632-byte cache-only fixture로 별도 승인했습니다.
> 공식 Validator issue 0개, headless projection과 Browser·staged VS Code·
> clean-installed local VSIX의 Apple M2 Metal 3개 표면에서 동일한 12 triangles,
> 86,486 pixels, 756-byte read·800-byte upload와 cleanup을 재현했습니다. 이 확장에는
> runtime codec을 추가하지 않았습니다.
> ratified `EXT_meshopt_compression`도 exact Box GLB를 1,696-byte cache-only
> fixture로 결정적으로 파생해 별도 승인했습니다. exact `meshoptimizer@1.2.0`
> single-thread WASM은 기존 source Worker에 bundle되고 압축 source에서만 lazy
> 초기화됩니다. 192 compressed bytes를 648 bytes로 복원한 headless 결과와
> Browser·staged VS Code·clean-installed local VSIX의 Apple M2 Metal 3개 표면이
> 같은 12 triangles, 86,486 pixels, 756-byte read·800-byte upload와 cleanup을
> 재현했습니다. `FILTER_NONE`만 허용하며 Draco·다른 meshopt filter·그 밖의
> required extension은 계속 fail-closed입니다.
> OPAQUE PNG `baseColorTexture`는 외부 PNG, exact glTF PNG data URI, GLB PNG
> bufferView와 명시적으로 공급된 local `.bin` 안의 glTF PNG bufferView로
> 승인했습니다. source는 `TEXCOORD_0`과 표준 sampler만
> geometry-range v2에 투영하고 renderer는 storage와 독립적으로 PNG를 재검증한
> 뒤 WebGL2 `SRGB8_ALPHA8` texture로 실제 upload합니다. exact Khronos
> BoxTextured 외부 bundle과 embedded GLB의 Browser·staged VS Code·
> clean-installed local VSIX, 합계 6개 Apple M2 Metal 표면은 모두 12 triangles,
> 86,486 pixels, 4,756-byte range read, 262,144-byte decoded base RGBA,
> 349,524-byte mipmap-aware GPU texture와 350,516-byte total upload, terminal
> cleanup을 재현했습니다. 별도 bounded baseline sequential JPEG profile은 외부
> `.jpg`/`.jpeg`, exact glTF JPEG data URI, GLB JPEG bufferView와 명시적으로
> 공급된 local `.bin` 안의 glTF JPEG bufferView를 MIME-aware
> geometry-range v3로 투영합니다. exact BoxTextured geometry와 749-byte
> CompareDispersion JPEG의 cache-only derivation은 공식 Validator issue 0개와
> source/renderer 독립 validation을 통과했고, Browser·staged VS Code·
> clean-installed local VSIX의 Apple M2 Metal 3개 표면에서 1,756-byte range,
> 86,486 pixels, 21,844-byte mipmap-aware GPU texture·22,836-byte total upload와
> terminal cleanup을 재현했습니다. PNG-only v2 bytes는 그대로 유지합니다.
> data-URI buffer가 뒷받침하는 glTF bufferView image,
> progressive/arithmetic/lossless JPEG, alpha mode,
> normal/metallic-roughness/occlusion/emissive texture, `KHR_texture_transform`과
> 임의 URI는 계속 fail-closed 또는 metadata-only입니다.
> 이 기능은 single-source Browser/VS Code 제품 범위이며 이미 공개되고 Spatial이
> exact-pin한 federated BIM Surface v0.2 runtime이나 `.bimfed.json` 경로에는
> 소급 반영하지 않습니다.
> 같은 fail-closed GPU 정책으로 cache-only LAS·LAZ·E57·다중 스캔 E57도
> actual Chrome 151, staged VS Code 1.132와 clean-installed local VSIX에서
> Apple M2 Metal을 통과했습니다. 12개 제품 표면은 최대 1,213,990 points,
> exact range/pick identity, 3단계 LOD와 Worker/CPU/GPU terminal cleanup을
> 재현했습니다. 이는 point format admission이나 CRS authority를 승인하지 않습니다.
> Linux/Windows physical GPU, 동시 합성, OS-level peak GPU memory는 아직
> 확정되지 않았습니다. engine-cooperative cancellation, forced-exit 내부
> cleanup과 Browser/native resource exhaustion도 보류합니다. 첫 engine은
> exact `web-ifc@0.0.77`, 첫 profile은 IFC4
> `ReferenceView_V1.2`의 local read-only exploration으로 experimental
> admission했습니다. IfcOpenShell은 bundle하지 않는 qualification
> reference oracle로 유지합니다. 공개 `@menaje/viewer-core`와 render
> protocol package 0.1.2 prerelease는 exact release asset으로 고정했고,
> wire protocol 0.1.0에서 실제 BIM
> source·3D renderer의 Browser/VS Code 호스트 conformance를 통과했습니다.
> IFC와 glTF/GLB의 실제 Browser, staged VS Code 및 clean-installed local VSIX
> entrypoint도 공개 Viewer Core의 range read, selection event와 terminal
> cleanup을 software와 위 Apple Metal 제품 경로에서 통과했습니다.
> stable/production과 Marketplace publication은 별도 Gate입니다. 공개 IFC call-start
> 뒤 process/Worker 강제 격리 취소와 새 runtime 복구는 통과했습니다.
> 같은 공개 IFC의 256MiB process RSS 상한 감지·강제 종료·새 process
> 복구도 통과했지만 Browser heap과 native allocator/parser memory safety는
> 아직 검증되지 않았습니다. exact web-ifc Node/WASM private stage는
> macOS arm64와 Linux x64에서 offline clean install·실행을 통과했고,
> 두 CI가 만든 989,965-byte tgz도 byte-identical이었습니다. 이는
> exact npm artifact, MPL-2.0 text, source commit과 notice를 기술
> 검토했습니다. Community VSIX는 MPL-2.0 source offer, SPDX SBOM,
> SHA-256 manifest와 GitHub build provenance를 함께 배포합니다. 이는
> 법률 자문, production write, SLA 또는 Coni Spatial 지원 승인이 아닙니다.
> generated semantic IFC에서는 Project→Site→Building→Storey→Space→Wall
> tree, occurrence/type, Pset/Qto/material/classification, bounded search,
> 같은 revision의 실제 WebGL2 pick, isolate, saved view와 keyboard/ARIA를
> Chromium에서 검증했습니다. source session과 제품 UI는 선택 entity의
> bounded primitive property value도 lazy load합니다. public semantic
> scale과 advanced relation graph는 아직 보류합니다. 같은 generated
> source에 BCF XML 3.0 archive를 bounded deterministic round-trip하고
> camera·clipping·visibility·selection을 GlobalId로 적용했습니다. IDS 1.0
> document와 external `pass`·`fail`·`not-evaluated` result, failing entity
> selection과 bSDD URI/version도 탐색합니다. import는 network 없이
> 동작하며 bSDD는 explicit lookup만 bounded cache를 사용합니다. full BCF
> XSD, native IDS validation, live bSDD와 Spatial revision diagnostic linkage는
> 보류합니다.

## 첫 사용자 흐름

```text
local IFC, bounded glTF/GLB(필요하면 명시적 same-folder .bin/.png/.jpg/.jpeg 포함) 또는 bounded E57/LAS/LAZ 선택
-> isolated adapter가 immutable source snapshot 생성
-> model tree와 3D overview 표시
-> 객체 선택
-> IFC semantics 또는 source-native reference metadata 탐색
-> section/isolate/measure
-> viewpoint 또는 선택 가능한 handoff descriptor 저장
```

파일과 모델 데이터는 사용자가 명시적으로 선택한 local runtime 안에서
처리합니다. 계정, cloud upload 또는 Coni Spatial 설치는 기본 흐름의
선행조건이 아닙니다.

## 제품 경계

```text
versioned Viewer Core / render protocol
├─ DWG Viewer
│  └─ raw DWG 2D review
├─ BIM Explorer
│  └─ raw BIM read/index/render + generic 3D exploration
└─ Coni Spatial
   └─ Workspace revision + Agent change + review authority
```

BIM Explorer가 소유할 범위:

- BIM source fingerprint와 bounded read/index/cache
- IFC GlobalId·Express ID에서 Render/Pick ID로의 source-local mapping
- generic 3D camera, picking, section과 measurement
- model tree, property, relation과 search
- standalone Browser diagnostic surface와 VS Code Custom Editor
- path-free `.bimfed.json` 기반 source-scoped federated VS Code Surface v0.2
- IFC engine, format, license, 성능과 compatibility qualification
- bounded glTF/GLB reference source, local `.gltf + .bin/.png/.jpg/.jpeg` bundle,
  `KHR_mesh_quantization`, `EXT_meshopt_compression` `FILTER_NONE`과
  OPAQUE PNG/baseline JPEG `baseColorTexture`, source-native identity exploration
- bounded E57/LAS/LAZ point source와 source-neutral point rendering
- BCF viewpoint, IDS result와 bSDD reference의 read-only exploration

Coni Spatial이 계속 소유하는 범위:

- Workspace, immutable Spatial Revision과 Canonical Entity ID
- Agent query와 declarative change proposal
- live/diff overlay, Context Reference와 semantic review
- source refresh, identity reconcile와 conflict
- candidate, human accept, publish와 verified delivery export
- IFC query/edit/diff/patch/write와 round-trip admission

BIM Explorer는 Spatial authoring authority를 복제하지 않습니다. Coni
Spatial도 설치된 BIM Explorer extension/process를 필수 dependency로
호출하지 않고, public compatibility가 검증된 package만 자신의 bundle에
포함합니다.

재사용 경계는 제품명과 구분해
[`bim-surface/0.1`](specs/bim-surface-v0.1.md)로 정의합니다. Browser와 VS
Code의 IFC 경로가 이 surface로 source session, bounded 3D host, semantic
explorer와 cleanup을 합성합니다. zero-runtime-dependency 0.1.0
package는 deterministic pack과 offline clean install을 통과했고
`bim-surface-v0.1.0` immutable GitHub prerelease로 공개했습니다. repository
manifest와 npm registry publication은 계속 private입니다. Surface는 Workspace,
Canonical Entity ID, mutation, accept, publish와 export authority를 발급하지
않습니다.

federated Surface 0.2.0 package candidate는 generated GLB–IFC–GLB를 actual
Browser와 VS Code 1.131.0 Webview에 합성해 source별 exact WebGL2 hit·normal,
triangle-barycentric anchor와 cleanup을 검증했습니다. VS Code는 같은 폴더의
bounded source만 참조하는 path-free `.bimfed.json`을 열며 staged 확장과
clean-installed VSIX가 같은 결과를 재현합니다. exact 461,431-byte runtime을
사용한 이전 private tgz는 actual Spatial headless consumer에서 external base와
Spatial overlay, Canonical selection, durable anchor, stale/no-remap과 cleanup을
통과했습니다. release-ready tgz는 runtime/API를 유지하면서 package 문서 변경으로
SHA-256이 `3bdb747d…c63cb`가 됐고, Spatial commit `ef0c1ea…4e5`가 그 exact
97,623 bytes를 다시 검증했습니다. `dev` → `prerelease` 승격 뒤 package-only
[`bim-surface-v0.2.0`](https://github.com/menaje/bim-explorer/releases/tag/bim-surface-v0.2.0)
immutable GitHub prerelease와 9개 attested asset을 공개했습니다. 이 public asset의
anonymous download와 offline clean install을 Spatial commit `55d96e8…975e`가
다시 exact-pin해 Phase B도 통과했습니다. authoring authority, Spatial VSIX BIM
runtime, Spatial 제품의 실제 BIM UI/GPU나 새 VSIX/Marketplace publication은
승인하지 않습니다. 별도 post-release 개발 검증에서는 software fallback을 끈
Chrome 151 Browser 2회와 VS Code 1.132 staged/clean-installed local VSIX가 모두
Apple M2 Metal에서 같은 3-source composition, 8,286 pixels, surface hit 3개와
cleanup을 재현했습니다. 이는 기존 package/VSIX를 다시 게시하거나 Linux/Windows,
실제 고객 모델 또는 production support를 승인하지 않습니다.

새 federated Surface v0.3.0 package candidate는 immutable v0.2.0 asset을
변경하지 않고 `consumer-overlay` retained geometry 계약을 포함합니다. 독립 stage
두 곳의 byte-identical pack과 tarball-only offline clean install에서 packet
encode/decode, async prepare, synchronous atomic commit, source-replay 없는
checkpoint와 terminal cleanup을 재현했습니다. 공개 tag는
`bim-surface-v0.3.0`이며 npm registry, VSIX, published Viewer Core 0.1.3 artifact,
cross-platform physical GPU와 production support는 포함하지 않습니다.

optional Spatial 연계는
[`bim-explorer-spatial-integration/0.1`](specs/bim-spatial-integration-v0.1.md)
bridge를 사용합니다. Explorer는 source-bound GlobalId와 viewpoint만
제공하고 Spatial Service가 Canonical mapping, 2D/3D selection과 opaque
Context Reference를 발급합니다. 현재 synthetic provider conformance는
통과했습니다. federated Surface 0.2의 actual private-candidate consumer evidence는
Spatial 저장소가 소유하며 release-ready tgz와 immutable public artifact의
exact-pin admission을 모두 통과했습니다. Spatial bundle product integration과
production support는 별도 consumer-owned Gate로 유지합니다.

post-v0.1 federation foundation은
[`bim-explorer-federation/0.1`](specs/bim-federation-v0.1.md)로
두 IFC source와 bounded glTF/GLB reference mesh의
identity·visibility·partial/stale·alignment, incremental refresh와
cross-source saved view를 분리합니다. glTF/GLB는 source-native identity만
사용하며 BIM semantic authority를 갖지 않습니다. E57은 single-scan
Cartesian XYZ와 optional RGB/default-BitPack profile을 bounded Browser,
staged VS Code와 clean-installed VSIX에서 source-neutral point range로 여는
제품 Gate까지 통과했습니다. 같은 제품 Worker는 cache-only profile matrix에서
Float64·ScaledInteger 좌표, optional `cartesianInvalidState` 필터와 indexless
compressed-vector를 추가로 통과했습니다. 별도 공개 spherical sample도
370,530개 RAE/intensity/RGB record 중 invalid 215,329개를 제거해 155,201개
Cartesian display point를 독립 기준과 동일하게 만들고, 실제 Browser·staged
VS Code·clean-installed VSIX에서 같은 2,483,216-byte GPU projection으로
열립니다. intensity omission은 lossy로 기록합니다. 별도 cache-only 5-scan
E57 profile은 1,213,990개 Cartesian record와 row/column stream을
해제하고, 네 explicit quaternion/translation pose와 한 implicit identity
pose를 적용한 좌표 및 RGB digest가 독립 `pye57/libE57Format` 기준과
일치합니다. 같은 19,423,840-byte payload는 실제 Browser, staged VS Code와
clean-installed VSIX에서도 동일하게 열리고 전량 회수됩니다. pose는 local
registration일 뿐 CRS authority나 E57 format admission을 승인하지 않습니다.
3D Tiles와 RVT/DGN은
capability Gate만 등록했고 제품 codec/SDK evidence 전에는 열기를 거부합니다.
LAS/LAZ는 bounded Browser, staged VS Code와
clean-installed VSIX 제품 source/open Gate까지 통과했습니다. 두 point-cloud
profile 모두 CRS와 federation format admission은 계속 분리해 보류합니다.
cache-only decoder probe만으로는
제품 codec/SDK evidence가
되지 않습니다. 이 기능은 immutable Community v0.1.0 asset에는
포함되지 않습니다. 개발 기준선의 bounded glTF/GLB profile은 Browser,
VS Code와 clean-installed VSIX 제품 file-open을 별도 evidence로
통과했고, macOS arm64와 Linux x64 제품 매트릭스에서도 동일하게
재현했습니다. 별도 product-scale reference Gate는 CC BY 4.0
`A Beautiful Game` 42.98MB GLB를 on-demand로 검증해 417,028 vertices,
573,952 unique triangles와 1,499,072 instanced triangles를 headless 및 실제
Chrome SwiftShader WebGL2에서 열고 16.9MB allocation을 전량 회수했습니다.
같은 제품 규모 GLB와 generated IFC architecture/MEP source 두 개를 하나의
aligned derived projection으로 동시에 구성한 federation Gate도 53 instances,
573,976 unique triangles, 19회 bounded read와 16,902,256-byte upload를
headless 및 실제 Chrome WebGL2에서 재현하고 전량 회수했습니다. 같은
federation projection은 macOS arm64와 Linux x64 CI에서 geometry, range,
render/highlight와 cleanup이 동일함을 별도
[`platform matrix`](compatibility/evidence/bim-federation-product-scale-platform-matrix-2026-08-08.json)로
통과했습니다.
같은 파일은 Browser 제품의 실제 local file input, staged VS Code와 빈
profile에 clean-installed VSIX에서 검색·3D pick 또는 source-native selection,
path-free bridge, 닫기와 전량 cleanup을 통과했습니다. 현재 public Viewer Core
제품 entrypoint를 사용한 Apple M2 Metal 검증도 세 제품 경로에서 통과해 bounded
GLB physical GPU Gate를 승인했습니다. 별도 local
`.gltf + .bin/.png/.jpg/.jpeg` bundle과
`KHR_mesh_quantization`과 `EXT_meshopt_compression` `FILTER_NONE`도 세 제품 표면의
Apple M2 Metal Gate를 통과했습니다. OPAQUE PNG `baseColorTexture`는 외부 PNG,
exact glTF PNG data URI, GLB PNG bufferView 또는 명시적 local `.bin`의 glTF PNG
bufferView에서 geometry-range v2와 실제
sRGB texture로 투영합니다. cache-only Khronos BoxTextured의 외부/내장 변형은
각각 같은 세 Apple M2 Metal 제품 표면, 합계 6개 표면을 통과했습니다. bounded
baseline JPEG는 별도 v3 range와 세 Apple M2 Metal 제품 표면을 통과하면서
PNG-only v2를 byte-identical하게 유지했습니다. cache-only BoxTextured GLB를
`.gltf + 단일 .bin`으로 결정적으로 파생한 PNG bufferView 경로도 byte-identical한
v2 range와 세 Apple M2 Metal 제품 표면을 통과했습니다. 현재 glTF manifest는
32 passed / 4 held, renderer는 30 passed / 0 held, product shell은 69 passed /
1 held입니다. Linux/Windows hardware, 임의 URI, data-URI buffer 기반 image,
progressive/arithmetic/lossless JPEG·투명/다중 material texture,
Draco·다른 meshopt filter·그 밖의 required
extension 또는 BIM semantic authority는 승인하지 않습니다. 다음 held
format 제안은
[`reference format evidence intake`](docs/reference-format-intake.md)로 실제
사용자 과업·public fixture·권리·좌표·lifecycle evidence를 접수하며, intake
완료만으로 format 지원을 승인하지 않습니다.
공개 sample은 재배포하지 않고 cache-only pre-admission probe에 사용할 수 있으며,
현재 E57 envelope·page integrity·metadata profile, 7,680개 compressed
XYZ/RGB record와 122,880-byte point payload를 검증했습니다. 추가 E57 matrix는
각 30,571개 점의 Float64/ScaledInteger가 독립 `pye57/libE57Format` 기준과
동일한 position SHA-256 및 489,136-byte point payload를 만드는지 검증합니다.
5,168,128-byte spherical example은 155,201개 유효점의 nanometer-quantized
Cartesian position과 RGB digest parity 및 2,483,216-byte point payload를
검증합니다. 같은 payload는 실제 Browser, staged VS Code 1.131.0과
clean-installed VSIX에서 155,201 points·20,754 pixels로 재현되고 source
buffer, Worker, CPU range, GPU와 editor 자원이 전량 회수됩니다.
22,146,048-byte `pumpNoInvalidPoints.e57`은 재배포하지 않고 digest cache에서만
사용해 다섯 scan·1,213,990 points, structured row/column packet alignment와
네 explicit pose 적용의 nanometer-quantized position/RGB parity를 검증합니다.
한 scan의 생략된 pose는 identity로 처리합니다. 이는 qualification-only
sample이며, 실제 Browser·staged VS Code·clean-installed VSIX에서 같은
1,213,990 points·19,423,840-byte GPU payload·28,206 pixels를 재현하고
source/Worker/CPU/GPU/editor 자원을 전량 회수했습니다.
paired LAS 1.2/LAZ의
10,201개 point-format 3 record·Float64 좌표·RGB 및 압축 해제 후 exact SHA-256
parity를 검증했습니다. LAZ는 실제 Chrome의 disposable Worker에서도 4,063,232
byte peak WASM heap, checkpoint 취소, 동기 decode 중 강제 종료, timeout,
truncated payload 거부와 fresh-Worker 복구를 통과했습니다. 이어
source-neutral Float64-origin/relative-Float32
point range를 actual Chrome WebGL2에서 10,201 points·1 draw·40,471 pixels로
검증하고 allocation을 전량 회수했습니다. 따라서 point primitive renderer
Gate를 통과했습니다. 같은 E57도 실제 BIM Explorer Browser local file input,
staged VS Code 1.131.0 Custom Editor와 빈 profile에 clean-installed VSIX에서
7,680 points·122,880-byte GPU payload·39,561 pixels를 동일하게 재현하고
source buffer, Worker, CPU range와 GPU 자원을 전량 회수했습니다. 이어 같은
LAS와 LAZ를 실제 BIM Explorer Browser local
file input, staged VS Code 1.131.0 Custom Editor와 빈 profile에 clean-installed
VSIX에서 각각 열어 동일한 10,201 points·163,216-byte GPU payload·36,934
pixels를 재현하고 source buffer, Worker, CPU range와 GPU 자원을 전량
회수했습니다. exact `laz-perf@0.0.6`은 전용 product Worker에서 실행하며,
VSIX의 generated glue는 Webview CSP에 `unsafe-eval`을 추가하지 않도록 dynamic
Function construction을 동등한 closure로 치환합니다. E57 local scan pose
projection과 multiple-scan 제품 open, E57/LAS/LAZ의 source-revision/root-range
digest scoped 파생 point selection은 Browser, staged VS Code 및 clean-installed
VSIX에서 통과했습니다. 같은 세 제품 경로는 five-scan E57을 51개 파생 octree
leaf chunk와 31,971→242,821→1,213,990-point LOD로 점진 전환하고 단계별
identity map·GPU range·Worker hierarchy를 전량 회수했습니다. CRS/surveyed datum,
E57 extension, source-native hierarchy·point semantics와 format/federation
admission은 계속 held입니다.
software rasterizer를 끈 별도 제품 Gate에서는 동일한 LAS·LAZ·E57·다중 스캔
E57을 Apple M2 Metal의 actual Chrome, staged VS Code와 clean-installed local
VSIX에서 다시 열어 12개 표면의 exact payload, point selection, LOD와 terminal
cleanup을 재현했습니다. 이는 macOS arm64 단일 hardware qualification이며
Linux/Windows, CRS, format admission, OS-level peak GPU memory와 production은
계속 held입니다.

## 비목표

- IFC/RVT authoring과 production write 지원을 미리 주장하지 않습니다.
- 범용 CAD/BIM authoring kernel을 만들지 않습니다.
- Viewer event만으로 Spatial revision을 accept/publish하지 않습니다.
- IFC parser object, native pointer, 실제 path나 credential을 Viewer Core에
  전달하지 않습니다.
- `dwg-viewer`의 Viewer Core나 Coni Spatial authority 코드를 fork하거나
  복사하지 않습니다.

## 구현 순서

전체 dependency와 Gate는
[Roadmap #1](https://github.com/menaje/bim-explorer/issues/1)에서
추적합니다.

```text
#2 product/authority boundary
-> #3 Viewer Core 3D conformance
-> #4 IFC engine/profile qualification
-> #5 BimModelSource
-> #6 generic 3D surface + #7 BIM exploration UX
-> #8 Browser/VS Code shells
-> #9 Coni Spatial integration
-> #10 openBIM exploration
-> #11 public release Gate
-> #12 federation/reference formats
-> #13 bounded glTF/GLB reference product surfaces
```

세부 이슈:

- [#2 Architecture](https://github.com/menaje/bim-explorer/issues/2)
- [#3 Viewer Core 3D consumer](https://github.com/menaje/bim-explorer/issues/3)
- [#4 IFC engine qualification](https://github.com/menaje/bim-explorer/issues/4)
- [#5 IFC source·cache·identity](https://github.com/menaje/bim-explorer/issues/5)
- [#6 Generic 3D surface](https://github.com/menaje/bim-explorer/issues/6)
- [#7 BIM semantic exploration UX](https://github.com/menaje/bim-explorer/issues/7)
- [#8 Browser·VS Code product surfaces](https://github.com/menaje/bim-explorer/issues/8)
- [#9 Coni Spatial integration](https://github.com/menaje/bim-explorer/issues/9)
- [#10 BCF·IDS·bSDD exploration](https://github.com/menaje/bim-explorer/issues/10)
- [#11 Open-source release Gate](https://github.com/menaje/bim-explorer/issues/11)
- [#12 Federation·reference formats](https://github.com/menaje/bim-explorer/issues/12)
- [#13 glTF/GLB reference source](https://github.com/menaje/bim-explorer/issues/13)

## 오픈소스 방향

BIM Explorer 구현은 [MPL-2.0](LICENSE), `specs/`의 공개
protocol·schema·normative example은
[Apache-2.0](specs/LICENSE)입니다. package의 `private: true`는 npm 오게시
차단이며 공개 source license를 제한하지 않습니다. executable의 exact
source와 dependency notice는 [SOURCE_OFFER.md](SOURCE_OFFER.md)와
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 따릅니다.

engine과 format 지원도 미리 약속하지 않습니다. IfcOpenShell, web-ifc 등
후보를 동일 fixture로 비교하고 identity, geometry, memory, startup,
license와 packaging Gate를 통과한 profile만 지원 대상으로 올립니다.

공식 Community asset, 지원/비지원 범위, clean build와 migration 정책은
[Community release 문서](docs/community-release.md)를 따릅니다. `Coni`,
`Coni Spatial`과 official `menaje` build 표시는 별도
[상표·배포 정책](TRADEMARKS.md)을 따릅니다.
릴리스 asset과 검증 가능한 provenance는
[v0.1.0 공식 릴리스](https://github.com/menaje/bim-explorer/releases/tag/v0.1.0),
고정된 검증 결과는
[release evidence](compatibility/evidence/community-release-v0.1.0-2026-08-04.json)에
기록합니다.

## 관련 저장소

- [dwg-viewer](https://github.com/menaje/dwg-viewer):
  Viewer Core/render protocol과 독립 raw DWG 제품
- [coni-spatial](https://github.com/menaje/coni-spatial):
  Workspace, revision, Agent change, reconcile와 product authority

## 개발 기준선

Node.js 24가 필요합니다.

개발은 `dev`, 공개 package prerelease 승격은 `prerelease`, 정식 release
승격은 `main`에서 진행합니다. 새 VSIX의 Marketplace/Open VSX 게시는 별도
승인 전까지 보류합니다. 세부 규칙은
[`Branch and release workflow`](docs/branch-release-workflow.md)를 따릅니다.

```bash
npm ci
npm run check
npm run start:web
npm run qualify:product:web:public
npm run qualify:product:vscode-install
npm run qualify:gltf:product
npm run qualify:gltf:product-scale
npm run qualify:gltf:product-scale:web
npm run qualify:gltf:product-scale:vscode
npm run qualify:gltf:product-scale:vscode-install
npm run qualify:gltf:external-resource-products
npm run qualify:gltf:jpeg-texture-products
npm run qualify:ifc:platform-package
npm run qualify:ifc:license-profile
npm run qualify:viewer-core
npm run qualify:viewer-core:product
npm run qualify:openbim
npm run qualify:federation
npm run qualify:federation:product-scale
npm run qualify:bim-surface:v0.2:vscode
npm run qualify:community-release
npm run package:vscode
npm run release:bundle
```

일반 `push`와 pull request에서는 Ubuntu/macOS의 `npm run check`만 실행한다.
Browser, VS Code, IFC, E57, LAS/LAZ와 product-scale platform evidence를 만드는
전체 qualification은 Actions의 `CI` workflow를 수동 실행할 때만 수행한다.
수동 실행은 두 플랫폼 결과를 수집한 뒤 federation platform matrix까지 조립한다.

저장소 구조와 authority 문서는 [docs/README.md](docs/README.md), 현재
Viewer Core admission 상태는
[compatibility/viewer-core.json](compatibility/viewer-core.json), IFC engine
후보 상태는
[compatibility/ifc-engines.json](compatibility/ifc-engines.json)을 따릅니다.
내부 read-only source 계약의 상태는
[compatibility/bim-model-source.json](compatibility/bim-model-source.json)을
따릅니다.
내부 3D renderer 계약의 상태는
[compatibility/bim-renderer-3d.json](compatibility/bim-renderer-3d.json)을
따릅니다.
내부 semantic explorer 계약의 상태는
[compatibility/bim-semantic-explorer.json](compatibility/bim-semantic-explorer.json)을
따릅니다.
Browser/VS Code 제품 Host 계약의 상태는
[compatibility/bim-product-shells.json](compatibility/bim-product-shells.json)을
따릅니다.
제품 entrypoint의 공개 Viewer Core 검증은
[product entrypoint evidence](compatibility/evidence/bim-product-shell-viewer-core-product-entrypoints-2026-08-11.json)에
고정합니다.
대표 공개 IFC·GLB의 Apple M2 Metal 제품 검증은
[physical GPU evidence](compatibility/evidence/bim-product-shell-representative-physical-gpu-darwin-arm64-2026-08-11.json)에
고정합니다.
대표 LAS·LAZ·E57 제품 경로의 Apple M2 Metal 검증은
[point-cloud physical GPU evidence](compatibility/evidence/bim-product-shell-representative-point-clouds-physical-gpu-darwin-arm64-2026-08-11.json)에
고정합니다.
`KHR_mesh_quantization`의 공식 Validator·headless·3-surface Apple M2 Metal 검증은
[mesh quantization evidence](compatibility/evidence/gltf-reference-source-khr-mesh-quantization-products-darwin-arm64-2026-08-11.json)에
고정합니다.
`EXT_meshopt_compression` `FILTER_NONE`의 decoder·headless·3-surface Apple M2 Metal
검증은 [meshopt evidence](compatibility/evidence/gltf-reference-source-ext-meshopt-products-darwin-arm64-2026-08-11.json)에
고정합니다.
외부/data-URI/GLB-bufferView PNG `baseColorTexture`와 외부/내장 fixture의
geometry-range v2·6-surface Apple M2 Metal 검증은 [texture evidence](compatibility/evidence/gltf-reference-source-base-color-texture-products-darwin-arm64-2026-08-11.json)에
고정합니다.
bounded baseline JPEG의 geometry-range v3·3-surface Apple M2 Metal 검증은
[JPEG texture evidence](compatibility/evidence/gltf-reference-source-jpeg-base-color-texture-products-darwin-arm64-2026-08-11.json)에
고정합니다.
명시적 local `.bin`의 PNG bufferView와 byte-identical geometry-range v2,
3-surface Apple M2 Metal 검증은
[external-buffer bufferView texture evidence](compatibility/evidence/gltf-reference-source-external-buffer-view-texture-products-darwin-arm64-2026-08-11.json)에
고정합니다.
BCF·IDS·bSDD 탐색 계약의 상태는
[compatibility/openbim-explorer.json](compatibility/openbim-explorer.json)을
따릅니다.
multi-source와 후속 format Gate 상태는
[compatibility/bim-federation.json](compatibility/bim-federation.json)을
따릅니다.
실제 IFC, 고객 모델, credential과 generated cache는 Git에 추적하지
않습니다.
