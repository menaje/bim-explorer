# Third-party notices

experimental `web-ifc` qualification adapter와 local Browser Worker probe는
다음 dependency를 exact version으로 사용합니다.

- `web-ifc@0.0.77`
- MPL-2.0
- <https://github.com/ThatOpen/engine_web-ifc>
- exact npm source commit:
  <https://github.com/ThatOpen/engine_web-ifc/tree/f26c4beef0a668ebdb180d2b95a94097a1e21cef>
- [adapter notice](adapters/web-ifc/THIRD_PARTY_NOTICES.md)

Community Browser/VS Code executable에는 이 notice, MPL-2.0 full text와
[`SOURCE_OFFER.md`](SOURCE_OFFER.md)를 포함합니다. 포함된 MPL code의 정확한
source와 수정분을 합리적인 방법으로 받을 수 있는 경로를 함께 제공합니다.
현재 release는 upstream npm artifact를 수정하지 않습니다.
BIM Explorer 고유 파일과 Coni Spatial 고유 파일은 `web-ifc`와 분리된
Larger Work 경계로 유지합니다. 이 항목은 release engineering 기준이며
법률 자문이나 public redistribution 승인이 아닙니다.

IfcOpenShell은 repository dependency나 distributable bundle에 포함하지 않고,
qualification 시 외부 Python environment를 주입합니다.
[candidate notice](adapters/ifcopenshell/THIRD_PARTY_NOTICES.md)는 관찰한
version과 library license 범위를 기록합니다.

Viewer contract conformance는 다음 exact MPL-2.0 source packages를 고정된
DWG Viewer release asset에서 설치합니다. 두 package는 v0.1.0 VSIX runtime에
포함되지 않고 source/build SBOM에만 기록됩니다.

- `@menaje/viewer-core@0.1.2`
- `@menaje/viewer-render-protocol@0.1.2`
- source and notices:
  <https://github.com/menaje/dwg-viewer/releases/tag/viewer-core-v0.1.2>

성능 qualification은
[`buildingsmart-community/Community-Sample-Test-Files`](https://github.com/buildingsmart-community/Community-Sample-Test-Files)의
Schependomlaan `ROOT-Compleet.ifczip`을 고정 commit에서 내려받을 수 있습니다.
upstream 표기는 `(C) original authors`, license는 CC BY 4.0입니다. archive와
추출 IFC는 repository나 배포 artifact에 포함하지 않고 ignored local
cache에서만 사용합니다. 정확한 source·digest·사용 경계는
[`public fixture manifest`](fixtures/ifc/public-schependomlaan/manifest.json)가
소유합니다.

`web-ifc`는 제한된 IFC4 read-only exploration profile의 첫 experimental
Community engine으로 선정했고 exact Browser JS/WASM redistribution을
승인했습니다. IfcOpenShell은 public product dependency나 distributable
bundle로 승인하지 않았습니다. engine/profile 확대나 replacement에는
다음을 같은 변경에서 기록해야 합니다.

internal `openbim-explorer` package는 bounded BCFZIP/XML 처리를 위해 다음
exact registry dependency를 사용합니다.

- `fflate@0.8.3`, MIT,
  <https://github.com/101arrowz/fflate>,
  [license text](LICENSES/fflate-MIT.txt)
- `saxes@6.0.0`, ISC,
  <https://github.com/lddubeau/saxes>,
  [license text](LICENSES/saxes-ISC.txt)
- transitive `xmlchars@2.2.0`, MIT,
  <https://github.com/lddubeau/xmlchars>,
  [license text](LICENSES/xmlchars-MIT.txt)

세 dependency는 MPL-2.0 source tree의 openBIM exploration package에서
사용합니다. v0.1.0 VSIX runtime에는 포함되지 않지만 source SBOM은 exact
registry integrity와 license를 기록합니다. 향후 executable에 포함할 때
runtime SBOM과 배포 notice를 다시 검증해야 합니다.

`packaging/web-ifc-platform-stage`는 exact Node API/WASM, MPL-2.0 text와
notice를 포함해 macOS/Linux의 offline clean install과 byte identity를
검증하는 npm 비게시 qualification package입니다. 공식 Community artifact는
별도 VSIX/source bundle, runtime/source SBOM, checksums와 provenance Gate를
통과해야 합니다.

glTF reference source qualification은 Khronos Group의 공식 Validator를
제품 runtime과 분리된 exact dev dependency로 사용합니다.

- `gltf-validator@2.0.0-dev.3.10`
- Apache-2.0
- <https://github.com/KhronosGroup/glTF-Validator>
- npm integrity:
  `sha512-odJ4k0tRkGXiDGn78yDBg+fBbAIvBnXxh3RwAta0emSxGtyagFE8B4xELB1oYe3S5RD8Ci3uZAsZaascH2LAEQ==`
- [Apache License 2.0 full text](specs/LICENSE)

공개 qualification fixture는 Khronos Group
`glTF-Sample-Assets`의 Cesium Box GLB이며 CC-BY-4.0입니다. 고정된 source,
digest와 attribution은
[`public glTF fixture manifest`](fixtures/gltf/public-khronos-box/manifest.json)에
기록합니다. GLB 자체는 ignored private cache에만 두며 release에 포함하지
않습니다.

LAS/LAZ point-record qualification과 experimental Browser 및 VS Code/VSIX
product Worker는 다음 exact dependency를 사용합니다.

- `laz-perf@0.0.6`
- Apache-2.0, [full text](specs/LICENSE)
- <https://github.com/hobuinc/laz-perf>
- exact npm source commit:
  <https://github.com/hobuinc/laz-perf/tree/0e1443a34669739ef8a3fd7eb2278d9d7e586a77>
- npm integrity:
  `sha512-ZBqC+BBlofznDIY3SfjXDBVdIhYfz7bq8HAHztlw4XOnu++nHiWtCGPgzpdeAhPkByc68DaKNy3E3rY4XrdRtQ==`

공개 LAS/LAZ pair는 `visgl/loaders.gl`의 MIT source repository에서 고정 commit과
SHA-256로 내려받습니다. 샘플 binary는 ignored cache에만 두고 재배포하거나
release에 포함하지 않습니다. `laz-perf`는 main의 bounded Browser product와
VS Code/VSIX에서 전용 classic Worker runtime으로 사용합니다. Webview의 strict
CSP에서 `unsafe-eval` 없이 실행하기 위해 generated Emscripten glue의 dynamic
Function naming과 invoker construction을 동등한 closure로 치환했으며,
`laz-perf.wasm`은 수정하지 않았습니다. 수정 표시는 generated file header에도
기록합니다. 개발 VSIX는 이 glue, exact WASM과 Apache-2.0 full text를 포함하지만
공개 샘플은 포함하지 않습니다. immutable Community v0.1.0과 그 release
bundle에는 이 runtime이 없으며 marketplace 또는 다음 Community release는
runtime SBOM, checksum, notice와 재현성 Gate를 다시 통과해야 합니다.

E57 packet framing과 default BitPack decoder 동작은 다음 exact MIT source를
감사 reference로 사용해 BIM Explorer 소유 JavaScript로 구현했습니다.

- `cry-inc/e57@0.10.5`
- MIT, [full text](LICENSES/e57-rs-MIT.txt)
- <https://github.com/cry-inc/e57>
- exact source commit:
  <https://github.com/cry-inc/e57/tree/7a7498f679b30588dc9298beb7aafab2245a2d0c>

upstream Rust crate나 WASM binary는 dependency 또는 배포 artifact에 포함하지
않습니다. 저작권·허가 고지는 source tree와 VSIX/release notice에 보존합니다.
공개 E57 sample은 별도 CC0 fixture manifest의 고정 digest로 ignored cache에서만
사용하며 배포하지 않습니다.

- exact package와 version
- upstream source와 license
- static/dynamic/WASM/process 결합 방식
- redistribution·source 제공 의무
- platform artifact와 SBOM 위치
- removal 또는 replacement 절차
