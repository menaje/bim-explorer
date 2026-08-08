# Tests

공개 synthetic fixture만 사용합니다.

예정 구조:

- `foundation/`: repository, documentation와 privacy boundary
- `conformance/`: Viewer Core, source, Host와 identity contract
- `ifc/`: engine/profile/geometry/semantic qualification
- `gltf/`: bounded glTF/GLB reference source와 generic renderer 연결
- `renderer/`: 3D lifecycle, picking, section과 disposal
- `product/`: Browser/VS Code standalone behavior
- `vscode/`: staged Custom Editor의 실제 VS Code Chromium qualification

실제 고객 BIM과 redistribution 권한이 불분명한 파일은 test fixture로
추적하지 않습니다.

`gltf` test는 binary artifact를 추적하지 않고 deterministic generator가
만든 JSON data URI와 GLB를 메모리에서 검사합니다. external URI, required
extension, malformed length를 거부하고 source-native identity가 IFC
GlobalId를 합성하지 않는지 확인합니다. 공개 Box 및 `A Beautiful Game`
manifest는 pinned URL·digest·CC BY 4.0·private cache 정책을 별도로
검사하며 원본 GLB는 test tree에 포함하지 않습니다.

IFC fixture artifact는 `node scripts/generate-synthetic-ifc.mjs --fixture
small|mapped|performance --output <temporary.ifc>`로 생성합니다. `.ifc`는
Git에 추적하지 않습니다.

기본 `npm test`는 exact `web-ifc` Node/WASM adapter와 child-process harness를
실행합니다. child-process harness는 mapped/shared representation, Qto와
classification fixture까지 검사합니다. IfcOpenShell은 repository dependency가
아니므로 별도 Python environment를
`scripts/qualify-ifc-engine.mjs --python ...`에 주입할 때만 실행합니다.

일반 process supervisor test는 harmless Node stub으로 성공, redacted failure,
timeout, output budget과 AbortSignal 취소 후 강제 종료를 검사합니다. 별도
negative qualification은 generated 3-case corpus를 web-ifc/IfcOpenShell
process에서 각각 두 번 거부하고 cleanup 경계와 정상 IFC recovery를
검사합니다. 별도 in-call qualification은 공개 IFC call-start checkpoint
뒤 process 강제 종료와 fresh-process recovery를 검증합니다. engine
cooperative cancellation이나 resource exhaustion 증거로 승격하지 않습니다.
RSS qualification은 실제 두 engine process의 sampled 상한 초과,
`rss-limit` 종료와 fresh-process recovery를 검사합니다. Browser heap,
native allocator와 parser memory safety는 승격하지 않습니다.

Browser Worker probe test는 loopback server의 strict route/CSP와 main-thread
Worker client의 report validation, path-free failure, ordered checkpoint,
model-opened cooperative cleanup과 응답 없는 취소의 bounded 강제 종료를
검사합니다. `model-open-call-starting` 뒤 응답하지 않는 Worker의 forced
isolation과 receipt도 검사합니다. source-session test는 size-before-read
admission, 파일명 비노출,
active source 교체, stale 결과 억제, 중첩 cancellation receipt와 terminal
disposal을 검사합니다. 실제 Chromium ESM/WASM, file chooser와 checkpoint
취소, negative corpus dispose/recovery, 1,024-Wall bounded performance
관찰과 공개 IFC in-call forced isolation/fresh-Worker recovery는 별도
evidence로 기록합니다.
성능 test는 fixture identity, 시간 budget, WASM heap capacity와 cleanup을
fail-closed로 검사합니다. engine-cooperative cancellation, 종료된 runtime
내부 cleanup, resource exhaustion과 production Browser packaging Gate는
계속 분리합니다.

`bim-model-source` test는 generated mapped IFC에서 raw source fingerprint,
spatial tree와 product semantics, shared·multi-range geometry payload,
Express ID/GlobalId/Render/Pick lookup, 비렌더링 product identity,
bounded tree/search/relation query, query-bound cursor, bounded range read와
stale·malformed artifact 거부를 검사합니다. 별도 공개
fixture qualification은 46.77MB IFC2X3의 3개 range와 첫 range 단독 read를
두 번 확인합니다. 공용 Viewer Core와 rendered first-frame은 별도 release
qualification/evidence가 소유합니다.

`viewer-core-release` test는 exact public release package의 설치 content
digest, upstream source/delta conformance와 실제 IFC→BIM source→3D renderer
Browser/VS Code host lifecycle을 검사합니다. prerelease를 stable 또는
production compatibility로 승격하지 않습니다.

`semantic` test는 Storey→Space→Wall→Type→Occurrence 왕복, Pset/Qto,
material/classification panel, paged search와 explicit omission,
revision-bound 3D pick, isolate, saved view와 DOM/search aggregate bound를
검사합니다. Browser probe server test는 strict same-origin CSP와 bounded
geometry range만 노출하는지 검사합니다. 실제 Chromium 키보드·ARIA와
WebGL2 pick은 별도 compatibility evidence로 고정합니다.

`product` test는 allowlist loopback server, Worker generation/cancel,
runtime-neutral digest, VS Code manifest/CSP, non-symlink exact-file
admission, format dispatch, IFC semantic/reference mesh explorer 분리,
path-free report와 독립 package staging을 검사합니다.
`npm run qualify:product:web`은 실제 Chrome에서 local Worker, semantic
search, 3D pick과 cleanup을 실행합니다. `npm run
qualify:product:web:public`은 digest가 고정된 공개 IFC를 실제 local file
input으로 열어 대표 product scale을 확인합니다. `npm run
qualify:product:vscode`는
독립 staging을 실제 VS Code Custom Editor로 열고 같은 source/render
projection과 editor close를 확인합니다. `npm run
qualify:product:vscode-install`은 생성한 VSIX를 빈 profile에 설치한 뒤
설치본 Custom Editor로 generated fixture와 같은 공개 IFC를 연속으로 열어
WebGL2, path-free bridge와 editor close를 다시 확인합니다.
`npm run qualify:gltf:product`는 공개 Khronos Box GLB를 Browser local file,
staged VS Code와 clean-installed VSIX에서 열어 source-native identity,
`globalId: null`, WebGL2 projection과 cleanup을 확인합니다.
`npm run qualify:gltf:product:platform -- --output <file>`은 고정 VS Code
1.131.0을 사용해 같은 세 제품 경로의 플랫폼 receipt를 만듭니다. macOS와
Linux receipt는 `npm run assemble:gltf:product:platform`으로 합치며, 동일한
portable projection과 physical-GPU 비주장을 검사합니다.
`npm run qualify:gltf:product-scale`은 42.98MB 공개 GLB를 official
Validator와 bounded source/headless renderer에 통과시킨 뒤 실제 Chrome
SwiftShader WebGL2 first frame, range budget과 allocation cleanup을
검증합니다. 이는 Browser/VS Code product file-open이나 physical GPU
qualification이 아닙니다.
`npm run qualify:federation:product-scale`은 같은 공개 GLB와 generated IFC
두 source를 하나의 aligned renderer projection으로 구성해 headless/실제
Chrome WebGL2 first frame, aggregate memory, source-scoped highlight와 모든
range/session/GPU cleanup을 검사합니다. macOS/Linux CI receipt는 `npm run
assemble:federation:product-scale:platform`으로 합치며 geometry, range,
render/highlight와 cleanup의 portable projection이 동일하지 않으면
실패합니다. memory/time은 runner별 예산 관측으로 분리해 보존합니다.

`reference-format-intake` test는 held LAS/LAZ/E57, 3D Tiles, RVT/DGN 제안을
실제 multi-source 과업, public fixture, implementation 권리, coordinate와
lifecycle evidence로 분류합니다. 완전한 packet도 qualification 착수만
허용하고 registry admission은 계속 false이며, 고객 모델·credential·absolute
path와 이미 admission된 format 재개방을 거부합니다.

`e57-public-sample-probe` test는 공개 E57을 ignored digest cache로만 획득하고
header, 모든 physical page CRC-32C와 XML point profile, default-BitPack packet의
7,680개 XYZ/RGB record와 source-neutral point range를 확인합니다. 샘플 원본은
추적·재배포하지 않으며 format admission은 승인하지 않습니다.

`e57-point-source`, `point-source-client`, `e57-browser-product`와
`e57-vscode-product` test는 bounded single-scan source projection, one-shot
Worker transfer·termination, 실제 Browser local file input, staged VS Code와
clean-installed VSIX의 exact range·visible projection과 cleanup을 검사합니다.
제품 open만 experimental로 승인하며 CRS/scan pose/surveyed datum, broader
profile, point identity/pick, LOD와 format admission은 계속 거부합니다.

`las-laz-public-sample-probe` test는 공개 paired LAS/LAZ를 ignored digest
cache로만 획득하고 LAS 1.2 header, 10,201개 point-format 3 record의 Float64
좌표·RGB와 LAZ 해제 후 LAS raw record SHA-256 parity를 확인합니다. exact
`laz-perf` WASM allocation도 회수합니다.

`las-laz-browser-worker` test는 같은 cache-only LAZ를 actual Chrome의
disposable classic Worker에서 해제해 input/output와 WASM heap budget,
checkpoint cooperative cancellation, 동기 decode 중 강제 종료, timeout,
truncated payload cleanup과 fresh-Worker recovery를 검증합니다. 이 Worker
test 자체는 강제 종료의 explicit cleanup, complete Browser RSS, CRS,
point renderer와 제품 admission을 주장하지 않습니다.

`las-laz-point-renderer` test는 exact parity LAS records를 source-neutral
Float64-origin/relative-Float32/RGBA8 range로 투영하고 range decoder,
loopback-only delivery·buffer zeroing과 committed actual Chrome WebGL2 evidence를
검사합니다. 이 test는 단일 `POINTS` draw와 exact CPU/GPU cleanup만 승인하며
CRS, point identity/pick, LOD와 format admission은 계속
거부합니다.

`las-laz-point-source`, `point-source-client`와 `las-laz-browser-product`
test는 bounded header/source projection, one-shot Worker transfer·termination과
실제 BIM Explorer Browser local file input의 LAS/LAZ exact range·visual parity를
검사합니다. Browser, staged VS Code와 clean-installed VSIX open만 experimental로
승인하며 CRS, point identity/pick, LOD와 format admission은 계속 거부합니다.

`renderer` test는 geometry range의 독립 decode, primitive slice/count
conformance, initial-range budget, shared geometry instance, Render/Pick
revision binding, source switch, abort, invalid backend cleanup과 deterministic
dispose를 headless backend로 검사합니다. 공개 qualification은 첫 range의
geometry/instance/draw-call accounting을 두 번 재현하지만 실제 GPU frame
test는 아닙니다.

`openbim` test는 BCF XML 3.0 deterministic local round-trip, bounded ZIP/XML,
camera/clipping/visibility/selection의 source-bound projection, IDS 1.0
requirement와 3-state result provenance, failing entity selection을
검사합니다. bSDD는 import 중 offline이며 explicit lookup에서만 injected
network와 bounded cache를 사용합니다. full XSD/IDS validator나 live
service test가 아닙니다.

`federation` test는 generated georeferenced IFC 세 개로 두 active source
slot, duplicate GlobalId isolation, per-source visibility, partial/stale,
same-CRS·explicit Float64 alignment, single-source refresh와 cross-source
saved view stale rejection을 검사합니다. 별도 generated glTF/GLB test는
bounded reference source admission, source-native selection, IFC GlobalId
부재, unaligned fail-closed, refresh와 semantic authority overclaim 거부를
확인합니다. renderer projection test는 aligned IFC/GLB range와 transform,
composite identity, source-session 비소유 lifecycle을 검사합니다.
LAS/LAZ/E57, 3D Tiles와 RVT/DGN은 admission되지 않습니다.
