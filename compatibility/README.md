# Compatibility

외부 package, engine과 format 지원 상태를 사실 기반 manifest로 관리합니다.

- `unresolved`: artifact/version/conformance가 없어 호환성을 주장하지 않음
- `experimental`: exact artifact와 제한된 fixture/evidence만 검증
- `qualified`: 공개 profile과 release Gate를 통과
- `blocked`: 필수 license, safety 또는 conformance Gate 실패

Community 제품 공개 상태는
[`community-release.json`](community-release.json)이 license, privacy,
SBOM, reproducibility와 remote publication Gate를 분리해 소유합니다.
v0.1.0은 macOS/Linux byte-identical build, 12개 asset checksum과
GitHub provenance 검증을 통과한 `qualified` 상태입니다. immutable release
결과는
[`release evidence`](evidence/community-release-v0.1.0-2026-08-04.json)에
고정합니다. annotated Git tag 자체는 서명되지 않았으며, 공식 asset의
build/release provenance가 서명돼 있습니다.

현재 Viewer Core 상태는
[`viewer-core.json`](viewer-core.json)이 소유합니다.
공개 `@menaje/viewer-core`와 render protocol package 0.1.2 prerelease의 exact
release URL·SHA-256·lock integrity·installed content digest, 실제 BIM
source/renderer와 Browser/VS Code host conformance는
[`release evidence`](evidence/viewer-core-release-2026-08-04.json)에
기록합니다. wire protocol ID는 `menaje-viewer-render-protocol/0.1.0`으로
유지됩니다. 상태는 `experimental`이며 stable/production을 주장하지
않습니다. Spatial도 같은 0.1.2 artifact를 독립 consumer evidence로
고정했으며 실제 BIM layer composition은 integration Gate가 소유합니다.

외부 product shell이 재사용할 BIM lifecycle은
[`bim-surface.json`](bim-surface.json)이 별도로 소유합니다.
`@bim-explorer/bim-surface@0.1.0`은 source, bounded mesh renderer host,
semantic explorer와 optional Spatial provider를 하나의 zero-runtime-dependency
ESM으로 구성합니다. 두 번의 byte-identical pack과 offline clean install,
exact source identity·selection·search·cleanup 및 Browser/VS Code 제품
composition을 통과했습니다. repository manifest는 private이고 public registry,
실제 Spatial consumer와 stable support는 held입니다. package는 별도
`bim-surface-v0.1.0` immutable GitHub prerelease로 공개했고 익명 download,
macOS/Linux byte identity, checksum, release attestation과 workflow build
provenance를 통과했습니다. exact 결과는
[package evidence](evidence/bim-surface-package-2026-08-09.json)와
[release evidence](evidence/bim-surface-release-v0.1.0-2026-08-09.json)에
고정합니다.

차기 multi-source lifecycle은 공개 v0.1 manifest와 분리된
[`federated-bim-surface.json`](federated-bim-surface.json)이 소유합니다.
generated IFC4 semantic base와 GLB reference를 headless composite로 열어
source-scoped semantic, cross-source selection, source-local anchor 두 개,
한 source refresh와 unchanged-source range replay, transferred/borrowed cleanup을
재현했습니다. 이어 generated GLB–IFC–GLB 세 source를 actual Chrome WebGL2에
올리고 GPU depth를 exact revision geometry와 대조해 세 개의 winding normal,
triangle-barycentric locator와 derived source-local anchor를 만들었습니다.
추가 원본 range read 없이 임시 CPU geometry와 모든 source/GPU allocation을
회수했습니다. VS Code v0.2 entrypoint, 실제 Spatial consumer와 public v0.2
package는 held입니다. exact 결과는
[`headless evidence`](evidence/federated-bim-surface-headless-2026-08-09.json)와
[`Browser evidence`](evidence/federated-bim-surface-browser-2026-08-09.json)에
고정합니다.

Browser 제품 shell과 VS Code IFC/glTF/GLB 및 experimental LAS/LAZ read-only
Custom Editor의
source-role별 projection, 실제 Chromium WebGL2, local Worker lifecycle,
path-free host bridge와 clean VSIX install 결과는
[`bim-product-shells.json`](bim-product-shells.json),
[`Browser product evidence`](evidence/bim-product-shell-browser-synthetic-2026-08-04.json),
[`public Browser product evidence`](evidence/bim-product-shell-browser-public-2026-08-04.json),
[`reference Browser product evidence`](evidence/gltf-reference-source-khronos-box-browser-product-2026-08-04.json),
[`VS Code product evidence`](evidence/bim-product-shell-vscode-synthetic-2026-08-04.json),
[`VSIX install evidence`](evidence/bim-product-shell-vscode-vsix-install-2026-08-04.json),
[`LAS/LAZ VS Code evidence`](evidence/las-laz-vscode-product-2026-08-08.json),
[`glTF product platform matrix`](evidence/gltf-product-platform-matrix-2026-08-08.json)가
소유합니다. 두 host는 같은 generated IFC4 fingerprint, 2 products,
24 triangles, 57,585 non-background pixels와 1,120 uploaded bytes를
재현했습니다. 빈 profile의 설치된 VSIX runtime도 같은 fixture와
model/renderer projection, path-free bridge와 close cleanup을 다시
통과했습니다. 46.77MB CC BY 4.0 공개 IFC도 두 제품 runtime에서
3,569 products·261,424 triangles·3 ranges와 같은 4,193,868-byte 첫-range
WebGL2 projection으로 열고 정리했습니다. 계정·upload·telemetry·Coni
Spatial 의존성은 없습니다. Khronos Box GLB도 Browser, staged VS Code와
clean-installed VSIX에서 1 reference entity·12 triangles·86,486 pixels,
source-native selection, `globalId: null`과 cleanup을 재현했습니다. 제품
세 경로는 macOS arm64와 Linux x64 CI에서 고정 VS Code 1.131.0으로 같은
model/resource/render projection과 1,168,823-byte VSIX를 재현했습니다.
paired LAS/LAZ도 staged VS Code와 clean-installed VSIX에서 같은 10,201
points·163,216-byte payload·36,934 pixels를 재현하고 path-free bridge,
source/Worker/CPU/GPU/editor cleanup을 통과했습니다. VSIX는 strict-CSP용
generated `laz-perf@0.0.6` glue와 exact WASM을 포함하되 sample은 포함하지
않습니다.
entrypoint의 public Viewer Core 채택, IFC2X3 profile admission, broader
glTF profile, physical GPU와 marketplace release는 계속 보류합니다.

IFC engine 후보와 experimental profile 상태는
[`ifc-engines.json`](ifc-engines.json)이 소유합니다. 두 후보의 base fixture
비교는
[`synthetic-small evidence`](evidence/ifc-engine-synthetic-small-2026-08-03.json),
mapped/shared/Qto/classification 비교는
[`synthetic-mapped evidence`](evidence/ifc-engine-synthetic-mapped-2026-08-03.json)에
기록합니다. exact `web-ifc@0.0.77` package/source/license evidence는
[`license profile evidence`](evidence/ifc-license-profile-2026-08-04.json)가
소유합니다. 이 결과는 IFC4 `ReferenceView_V1.2` local read-only
exploration의 experimental engine selection이며 production redistribution
승인은 아닙니다.

read-only `BimModelSource`의 raw source fingerprint, deterministic cache,
tree/property/Render/Pick identity, bounded tree/search/relation query와
immutable geometry range 결과는
[`bim-model-source.json`](bim-model-source.json)과
[`synthetic mapped source evidence`](evidence/bim-model-source-synthetic-mapped-2026-08-04.json),
[`metadata extension evidence`](evidence/bim-model-source-metadata-2026-08-04.json),
[`public representative source evidence`](evidence/bim-model-source-public-representative-2026-08-04.json)가
소유합니다. 고정된 46.77MB IFC2X3에서는 3개 bounded geometry range와
6개 deferred semantic detail range를 만들었습니다. 첫 geometry range를
읽는 동안 detail은 0 bytes이고, 선택 제품은 2,575-byte detail slice만
읽습니다. 3,504 renderable/65 non-renderable product의 identity와 cleanup도
두 번 재현했습니다. generated IFC4 metadata extension에서는 별도
1,026-byte property range의 선택 entity 497-byte slice만 읽어
occurrence/type primitive 값을 재현했고, EPSG:32652 MapConversion,
conversion 부재/invalid 거부와 external source precision·lossy Float32
display tessellation 분리를 통과했습니다. complex property, 실제 측량
좌표/datum 변환, source-precision geometry export와 IFC2X3 profile admission은
보류합니다. rendered first-frame, Browser/VS Code packaging과 Viewer Core
source conformance는 별도 evidence에서 통과했습니다.

내부 semantic explorer의 spatial tree, decomposition/containment,
occurrence/type 왕복, Pset/Qto/material/classification panel, bounded search,
revision-bound WebGL2 pick selection, isolate, saved view와 keyboard/ARIA
결과는
[`bim-semantic-explorer.json`](bim-semantic-explorer.json)과
[`synthetic Browser evidence`](evidence/bim-semantic-explorer-browser-synthetic-2026-08-04.json)가
소유합니다. 4,030-byte generated IFC4에서 7-node
Project→Site→Building→Storey→Space→Wall tree와 두 Wall 검색을 검증했고
DOM은 8 rows, query는 20회 이하로 제한했습니다. 호환 source session은
선택 entity의 bounded property value를 lazy load하고, 지원하지 않는
source는 name-only limitation을 유지합니다. public representative scale과
advanced relation graph는 보류합니다.

내부 3D renderer draft의 source-neutral decode, bounded initial range,
Render/Pick revision binding, headless resource lifecycle과 Browser WebGL2
first frame은
[`bim-renderer-3d.json`](bim-renderer-3d.json)과
[`public headless renderer evidence`](evidence/bim-renderer-3d-public-headless-2026-08-04.json),
[`public Browser WebGL2 evidence`](evidence/bim-renderer-3d-public-browser-webgl2-2026-08-04.json),
[`public Browser view-state evidence`](evidence/bim-renderer-3d-public-browser-view-state-2026-08-04.json),
[`public Browser picking evidence`](evidence/bim-renderer-3d-public-browser-picking-selection-2026-08-04.json),
[`public Browser lifecycle evidence`](evidence/bim-renderer-3d-public-browser-lifecycle-2026-08-04.json),
[`public Browser section evidence`](evidence/bim-renderer-3d-public-browser-section-measurement-2026-08-04.json)가
소유합니다. 공개 모델 첫 range에서 2,458 geometry records, 3,182
instances와 127,993 instanced triangles를 재현했습니다. 실제 Chromium
WebGL2 API에 4,399,252 bytes를 upload해 3,182 draws와 67,153
non-background pixels를 확인하고 allocation을 0으로 회수했습니다.
같은 allocation으로 perspective fit, orbit·pan·zoom, 64개 Render ID
hide와 orthographic show-all fit을 4 frames로 검증했습니다. 이후
visibility 기반 first range, DOM pointer input, progressive cache와
Browser/VS Code Webview 내부 host lifecycle도 별도 evidence로 통과했습니다.
physical GPU qualification은 보류합니다.
별도 offscreen WebGL2 pass의 화면 중앙 pick은 active revision의 Pick ID로
해결됐고, 선택 frame은 7,507 highlight pixels를 만들었습니다. context
loss를 관찰·복원한 뒤 같은 revision을 다시 upload하고 별도 IFC4 source로
전환해 세 mount의 allocation을 모두 회수했습니다. section frame은
single plane과 six-plane box로 pixel을 줄이고 복구했으며, GPU depth로
복원한 source-world 점에서 distance·area·angle을 계산했습니다. 단위는
source-coordinate-unit입니다. Browser/VS Code Webview host와 Viewer Core
contract host conformance는 각각 별도 evidence에서 통과했습니다.
별도 source-neutral point range는 Float64 origin과 relative Float32/RGBA8
payload를 사용합니다. cache-only LAS/LAZ parity sample의 10,201 points를
actual Chrome WebGL2 단일 `POINTS` draw로 그려 40,471 pixels를 확인하고
163,216-byte upload를 전량 회수했습니다. renderer manifest는 이 세 point
Gate를 포함해 24 passed / 0 held입니다. 별도 Browser와 VS Code 제품
source/open은 reference-format과 product-shell manifest가 소유하며, format
admission·CRS는 계속 분리해 held합니다.

web-ifc의 local Browser Worker ESM/WASM smoke는
[`Browser Worker evidence`](evidence/web-ifc-browser-worker-smoke-2026-08-03.json)에
분리해 기록합니다. 실제 file chooser, bounded admission, source switch와
client lifecycle 결과는
[`local-file lifecycle evidence`](evidence/web-ifc-browser-local-file-2026-08-03.json)에
기록합니다. 유효한 IFC가 열린 뒤 checkpoint에서 취소하고 model close와
engine dispose를 확인한 결과는
[`checkpoint cancellation evidence`](evidence/web-ifc-browser-checkpoint-cancellation-2026-08-03.json)에
기록합니다. generated 1,024-Wall fixture의 시간·WASM heap-capacity 예산은
[`bounded performance evidence`](evidence/web-ifc-browser-bounded-performance-2026-08-03.json)에
기록합니다. CC BY 4.0 Schependomlaan IFC2X3의 고정 provenance·Node
CPU/RSS는
[`public Node performance`](evidence/web-ifc-public-representative-node-performance-2026-08-03.json),
실제 Chromium Worker parse/geometry는
[`public Browser performance`](evidence/web-ifc-browser-public-representative-performance-2026-08-03.json)에
분리합니다. 세 가지 generated malformed/truncated source의 두 후보
process cleanup·recovery는
[`negative corpus evidence`](evidence/ifc-engine-negative-corpus-2026-08-04.json),
실제 Chromium Worker dispose·recovery는
[`Browser negative evidence`](evidence/web-ifc-browser-negative-corpus-2026-08-04.json)에
분리합니다. 공개 IFC call-start checkpoint 뒤 두 후보 process를 각각
두 번 강제 종료하고 새 process에서 복구한 결과는
[`process in-call evidence`](evidence/ifc-engine-in-call-cancellation-2026-08-04.json),
실제 Chromium Worker의 50ms grace 강제 종료·새 Worker 복구는
[`Browser in-call evidence`](evidence/web-ifc-browser-in-call-cancellation-2026-08-04.json)에
기록합니다. `cancellation`은 이 forced-isolation 전략에 한해 `mapped`입니다.
모두 prototype 결과이며 IFC2X3 profile, physical GPU, engine-cooperative
cancellation, 강제 종료 뒤 내부 explicit cleanup, resource exhaustion 또는
`packagingBrowser` capability를 승격하지 않습니다.
두 후보 process의 256MiB RSS 상한 초과·강제 종료와 fresh-process recovery는
[`process RSS evidence`](evidence/ifc-engine-resource-exhaustion-2026-08-04.json)에
기록합니다. 이는 `processRssLimitRecovery`만 통과시키며 Browser heap
exhaustion, native allocator/OOM behavior와 parser memory safety를 포함한
전체 `resourceExhaustion` Gate는 계속 보류합니다.
exact web-ifc Node/WASM private stage의 macOS arm64·Linux x64 offline
clean install과 실행, 동일한 10-file inventory 및 byte-identical tgz는
[`platform package matrix`](evidence/web-ifc-platform-package-matrix-2026-08-04.json)에
기록합니다. 이는 `crossPlatformWebIfcStage`와
`stageArtifactIntegrity`만 통과시킵니다. production Browser/VS Code
package, IfcOpenShell Linux wheel, public license, SBOM, signing과
redistribution review는 계속 보류합니다.
renderer의 WebGL2 first frame은 별도 Gate이며 engine/profile 선정이나
production GPU memory 보장을 뜻하지 않습니다.

optional Coni Spatial bridge의 exact Viewer package pin, source-bound
GlobalId→Canonical mapping response, synchronized 2D/3D selection, opaque
Context Reference, BIM base + Spatial live/diff layer와 authority-free handoff는
[`spatial-integration.json`](spatial-integration.json)과
[`synthetic bridge evidence`](evidence/spatial-integration-synthetic-2026-08-04.json)가
소유합니다. Explorer provider contract는 통과했지만 실제 Spatial service
consumer, standalone Spatial bundle과 public integration package는
consumer package admission Gate로 계속 보류합니다. MPL-2.0 source 자체는
Community v0.1.0 source archive에 공개돼 있습니다.

BCF XML 3.0 local archive, IDS 1.0 document/result와 bSDD URI의 source-bound
read-only 탐색은
[`openbim-explorer.json`](openbim-explorer.json)과
[`synthetic openBIM evidence`](evidence/openbim-explorer-synthetic-2026-08-04.json)가
소유합니다. BCFZIP bounded admission·deterministic export,
camera/clipping/visibility/selection, IDS 3-state provenance와 failing entity
highlight, bSDD offline-default·explicit cached lookup을 통과했습니다. full
BCF XSD, native IDS IFC validation, live bSDD와 Spatial revision diagnostic
linkage는 보류합니다.

multi-source IFC identity, visibility, same-CRS Float64 alignment,
partial/stale, incremental refresh와 cross-source saved view foundation은
[`bim-federation.json`](bim-federation.json)과
[`synthetic federation evidence`](evidence/bim-federation-synthetic-2026-08-04.json)가
소유합니다. IFC semantic source 두 개와 GLB reference mesh 하나를 함께
배치해 source-native identity와 unaligned 경계를 포함한 foundation Gate를
통과했습니다. 별도
[`product-scale federation evidence`](evidence/bim-federation-product-scale-2026-08-08.json)는
generated IFC 두 source와 42.98MB GLB를 한 aligned first frame으로 구성해
53 instances·573,976 unique triangles·19회 range read·16,902,256-byte
upload와 headless/Chrome WebGL2 cleanup을 재현합니다.
[`platform matrix`](evidence/bim-federation-product-scale-platform-matrix-2026-08-08.json)는
macOS arm64와 Linux x64의 동일한 geometry·range·render/highlight·cleanup
projection을 고정하고 플랫폼별 bounded memory/time 관측을 보존합니다. 전체
19개 Gate가 통과했고 actual Spatial consumer, 사용자 수요, 측량 datum, LAS/LAZ/E57,
3D Tiles, RVT/DGN의 6개 Gate는 보류합니다. registry는 `ifc`, `gltf`,
`glb`만 admission하고 다른 format은 fail closed합니다.

별도 [`reference-format-probes.json`](reference-format-probes.json)은 샘플 파일을
배포하지 않는 pre-admission 기술 테스트를 기록합니다. E57 공개 샘플의 고정
digest 다운로드, header, 116개 page CRC와 7,680-point XML metadata 선언에
이어 single-scan Cartesian XYZ/RGB default-BitPack record 7,680개와
122,880-byte point payload를 자체 JavaScript로 해제했습니다. 별도
[`E57 profile matrix`](evidence/e57-profile-matrix-2026-08-08.json)는 공개
`bunnyDouble.e57`·`bunnyInt32.e57`을 cache-only로 사용해 각 30,571-point
Float64/ScaledInteger, indexless compressed-vector와 Cartesian validity 필터를
검증하고 독립 `pye57/libE57Format` position digest와 exact parity를 고정합니다.
별도 [`E57 spherical profile`](evidence/e57-spherical-profile-2026-08-08.json)은
5,168,128-byte 공개 example의 370,530개 spherical RAE/intensity/RGB record를
해제하고 215,329개 invalid record를 제거해 155,201개 Cartesian display point를
만듭니다. nanometer-quantized position과 RGB digest는 독립
`pye57@0.4.18/libE57Format` 기준과 일치하며 intensity omission은 lossy로
기록합니다.
[`spherical Browser product evidence`](evidence/e57-spherical-browser-product-2026-08-08.json)와
[`spherical VS Code product evidence`](evidence/e57-spherical-vscode-product-2026-08-08.json)는
같은 cache-only sample을 실제 Browser local input, staged VS Code와
clean-installed VSIX에서 열어 155,201 points·2,483,216-byte GPU payload·20,754
pixels, path-free/local-only 실행과 source/Worker/CPU/GPU/editor cleanup을
재현합니다.
별도 [`E57 multiple-scan profile`](evidence/e57-multiple-scan-profile-2026-08-08.json)은
22,146,048-byte 공개 sample을 재배포하지 않고 digest cache에서만 사용합니다.
다섯 scan의 1,213,990개 Cartesian/intensity/RGB/row/column record를 해제하고,
네 explicit quaternion/translation pose와 한 implicit identity pose를 적용한
nanometer-quantized position 및 RGB SHA-256가 독립
`pye57@0.4.18/libE57Format` 기준과 일치합니다. 이는 bounded technical
pre-admission evidence입니다. 이어
[`multiple-scan Browser product evidence`](evidence/e57-multiple-scan-browser-product-2026-08-08.json)와
[`multiple-scan VS Code product evidence`](evidence/e57-multiple-scan-vscode-product-2026-08-08.json)는
같은 1,213,990 points·19,423,840-byte GPU payload를 actual Browser, staged
VS Code와 clean-installed VSIX에서 재현하고 전량 회수합니다. pose는 local
registration일 뿐 CRS와 surveyed datum authority를 승인하지 않습니다.
paired LAS 1.2/LAZ
10,201-point record를 exact `laz-perf@0.0.6`로 해제해
raw record SHA-256 parity, Float64 좌표와 RGB를 확인했습니다. 별도
[`Browser Worker evidence`](evidence/las-laz-browser-worker-2026-08-08.json)는
actual Chrome의 4,063,232-byte peak WASM heap, checkpoint/forced cancellation,
timeout, truncated payload cleanup과 fresh-Worker recovery를 기록합니다.
별도 [`point renderer evidence`](evidence/las-laz-point-renderer-2026-08-08.json)는
Float64 origin + relative Float32/RGBA8 range, actual Chrome WebGL2의 10,201
points·1 draw·40,471 pixels와 exact CPU/GPU cleanup을 기록합니다. 별도
[`Browser product evidence`](evidence/las-laz-browser-product-2026-08-08.json)는
LAS와 LAZ 실제 local file input이 동일한 10,201 points·163,216-byte upload·
36,934 pixels를 만들고 source/Worker/CPU/GPU 자원을 회수했음을 기록합니다.
[`VS Code product evidence`](evidence/las-laz-vscode-product-2026-08-08.json)는
staged Custom Editor와 clean-installed VSIX가 같은 projection을 재현하고
point runtime asset hash와 `.las`/`.laz` association을 보존했음을 기록합니다.
별도
[`point hierarchy/LOD product evidence`](evidence/point-cloud-lod-products-2026-08-09.json)는
five-scan E57의 51개 파생 chunk와 3단계 coarse-to-full 전환, root-range identity
mapping 및 Browser/staged VS Code/clean VSIX cleanup을 기록합니다. 전체 36개
Gate가 통과했고 E57·LAS/LAZ의 coordinate reference와 format
admission 4개 Gate는 held입니다. 이 결과는 federation의
`pointCloudCodec`이나
어떤 point-cloud format admission도 바꾸지 않습니다.

bounded glTF 2.0/GLB reference mesh는
[`gltf-reference-source.json`](gltf-reference-source.json)이 별도
관리합니다. Khronos Box GLB, 공식 Validator, source-native identity와
headless generic renderer, 실제 Chrome WebGL2와 federation reference
admission을 통과했습니다. bounded Browser/VS Code/clean-installed VSIX
제품 file-open도 macOS arm64와 Linux x64 매트릭스로 통과했습니다.
별도
[`product-scale reference evidence`](evidence/gltf-reference-source-a-beautiful-game-product-scale-2026-08-08.json)는
42.98MB `A Beautiful Game` GLB의 417,028 vertices·573,952 unique
triangles·1,499,072 instanced triangles를 official Validator, headless
renderer와 실제 Chrome SwiftShader WebGL2에서 검증하고 16,900,016-byte
allocation을 전량 회수했습니다. 같은 GLB는
[`Browser 제품`](evidence/gltf-reference-source-a-beautiful-game-browser-product-2026-08-08.json),
[`staged VS Code`](evidence/gltf-reference-source-a-beautiful-game-vscode-product-2026-08-08.json),
[`clean-installed VSIX`](evidence/gltf-reference-source-a-beautiful-game-vscode-vsix-product-2026-08-08.json)에서
49개 source-native entity, 동일한 bounded render projection과 close cleanup을
통과했습니다. external resource, required extension과 physical GPU는 독립
Gate로 남습니다. GLB는 ignored cache에서만 사용하고 release에는 포함하지
않습니다.

Sibling checkout을 이용한 local probe는
[`evidence/viewer-core-local-probe-2026-08-03.json`](evidence/viewer-core-local-probe-2026-08-03.json)에
기록합니다. 이 결과는 source lifecycle과 3D consumer shape를 검증하지만
durable artifact, clean install 또는 public compatibility를 증명하지
않습니다.

public compatibility admission에는 sibling checkout 결과를 사용하지 않고
[`evidence/viewer-core-release-2026-08-04.json`](evidence/viewer-core-release-2026-08-04.json)의
immutable release install과 실제 BIM 3D conformance만 사용합니다.
