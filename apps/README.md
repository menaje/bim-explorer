# Apps

제품 shell만 둡니다.

구현 경계:

- [`bim-explorer-web`](bim-explorer-web/README.md): local Browser product
  surface
- [`bim-explorer-vscode`](bim-explorer-vscode/README.md): IFC와 bounded
  glTF/GLB/E57/LAS/LAZ read-only Custom Editor

App은 IFC parser, source identity authority나 generic 3D implementation을
직접 소유하지 않습니다. Host capability와 lifecycle을 package/adapters에
주입하고 다른 제품 extension 설치를 요구하지 않습니다.

두 제품 Host는 같은 generated IFC fingerprint, `BimModelSource`, semantic
explorer와 WebGL2 projection을 실제 Chrome/VS Code Chromium에서
재현했습니다. VSIX는 빈 user data/extension directory에 clean install
한 뒤 설치본 Custom Editor에서 같은 fixture와 WebGL2 projection, path-free
bridge와 close cleanup까지 재검증했습니다. public Viewer Core conformance와
별개로, 46.77MB 공개 IFC도 Browser와 clean-installed VSIX에서 같은
3,569-product source/model projection과 첫-range WebGL2 결과로
재현했습니다. IFC2X3 profile admission, physical GPU와 release는 이
product-scale software 결과만으로 승격하지 않습니다. 별도 actual Chrome
151 및 VS Code 1.132 staged/clean-installed local VSIX 검증에서는 같은 공개
IFC를 Apple M2 Metal로 열어 model/render/selection/cleanup을 통과했습니다.

같은 두 Host는 bounded glTF/GLB를 BIM semantic source가 아닌 reference
mesh로 분기합니다. 공개 Khronos Box GLB는 Browser local file input,
staged VS Code와 clean-installed VSIX에서 12 triangles, source-native
selection, `globalId: null`, 실제 Chromium WebGL2, path-free bridge와
cleanup을 재현했습니다. 42.98MB product-scale reference GLB도 세 제품
경로에서 49개 entity·573,952 unique triangles와 동일한 bounded render
projection·cleanup을 통과했습니다. external resource/required extension과
physical GPU는 별도 Apple M2 Metal Gate에서 product-scale GLB까지
통과했습니다. Linux/Windows hardware, OS-level peak GPU memory와 공개 IFC를
포함한 동시 합성은 계속 보류합니다.

현재 [`browser-worker-probe`](browser-worker-probe/README.md)는 web-ifc
Browser Worker의 bounded local-file admission, source-session lifecycle과
model-opened checkpoint cooperative cleanup, generated 1,024-Wall
performance budget을 확인하는 experimental surface입니다. 제품 shell,
대표 대형 모델 또는 packaging 지원 약속이 아닙니다.

[`browser-gpu-probe`](browser-gpu-probe/README.md)는 공개 대표 IFC에서
투영한 첫 geometry range를 실제 Chromium WebGL2 API로 upload·draw하고
non-background pixel, camera/visibility view sequence와 disposal을 확인하는
별도 qualification surface입니다. physical GPU, pointer/picking interaction
이나 production Browser shell을 의미하지 않습니다.

[`semantic-explorer-probe`](semantic-explorer-probe/README.md)는 generated
semantic IFC의 같은 source session을 bounded semantic query와 WebGL2
renderer에 연결합니다. spatial hierarchy, property/relation/search,
실제 3D pick selection sync, 키보드·ARIA, DOM bound와 cleanup을 검증하는
qualification surface이며 제품 shell은 아닙니다.

[`gltf-browser-probe`](gltf-browser-probe/README.md)는 Khronos Box와
42.98MB `A Beautiful Game` GLB에서 투영한 generic geometry range를 실제
Chrome WebGL2로 render합니다. Box의 source-native pick과 대형 reference의
first-frame/range/allocation cleanup을 확인하는 source/renderer qualification
surface입니다. 제품 file-open은 별도 evidence가 소유하며, Browser 제품,
staged VS Code와 clean-installed VSIX 경로도 같은 대형 GLB로 통과했습니다.

[`federation-browser-probe`](federation-browser-probe/README.md)는 generated
IFC 두 source와 42.98MB `A Beautiful Game` GLB를 source-scoped identity와
explicit alignment가 보존된 한 projection으로 구성합니다. 실제 Chrome
WebGL2 first frame, cross-source highlight, aggregate range/GPU budget과
deterministic cleanup을 검증하며 Spatial authority·survey datum·physical
GPU 또는 production federation을 주장하지 않습니다.

[`federated-bim-surface-browser-probe`](federated-bim-surface-browser-probe/README.md)는
generated GLB reference, IFC semantic base와 GLB consumer overlay를 actual
Chrome WebGL2에서 하나의 v0.2 Surface로 엽니다. source-scoped semantic과
selection을 유지하면서 GPU depth와 exact geometry로 세 source의 winding
normal·triangle-barycentric locator·source-local anchor를 재현하고 replay
range, 임시 CPU geometry, transferred session과 GPU cleanup을 검증합니다.
Browser와 VS Code는 private 0.2.0 candidate runtime을 공유합니다. actual
Spatial consumer, public v0.2 release, native face·CRS 또는 physical GPU
authority는 승인하지 않습니다.

[`las-laz-worker-probe`](las-laz-worker-probe/README.md)는 cache-only 공개
LAZ를 exact `laz-perf@0.0.6` classic Web Worker에서 해제합니다. 실제 Chrome
WASM heap budget, checkpoint cooperative cancellation, 동기 decode 중 강제
종료, timeout, truncated payload 격리와 fresh-Worker 복구를 검증하지만 제품
file-open, CRS authority, point renderer 또는 format admission은 아닙니다.

[`las-laz-point-renderer-probe`](las-laz-point-renderer-probe/README.md)는
이미 exact LAS/LAZ parity가 증명된 cache-only record에서 source-neutral
point range를 만들고 actual Chrome WebGL2의 단일 `POINTS` draw, pixel output,
bounded CPU/GPU bytes와 deterministic cleanup을 검증합니다. Browser에 LAS/LAZ
원본이나 decoder를 제공하지 않으며 제품 file-open·CRS·point picking·format
admission을 승인하지 않습니다.

실제 [`bim-explorer-web`](bim-explorer-web/README.md)은 이 qualified range를
제품 source 경계로 채택해 bounded E57/LAS/LAZ local file input을 전용 Worker에서
처리합니다. Browser, staged VS Code와 clean-installed VSIX 제품 open은
통과했습니다. 같은 세 경로의 32-bit point pick은 exact source revision과
root range digest에 묶인 파생 `point:n` identity로 통과했습니다. five-scan
E57의 51개 파생 octree leaf chunk와 3단계 coarse-to-full LOD 및 exact cleanup도
같은 세 경로에서 통과했습니다. CRS/surveyed datum, source-native hierarchy·
semantics와 format/federation admission은 계속 별도 Gate입니다.
E57은 bounded Cartesian/spherical 및 five-scan pose-applied profile만
qualification했으며 extension profile은 승인하지 않습니다.
