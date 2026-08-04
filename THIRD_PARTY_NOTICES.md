# Third-party notices

experimental `web-ifc` qualification adapter와 local Browser Worker probe는
다음 dependency를 exact version으로 사용합니다.

- `web-ifc@0.0.77`
- MPL-2.0
- <https://github.com/ThatOpen/engine_web-ifc>
- exact npm source commit:
  <https://github.com/ThatOpen/engine_web-ifc/tree/f26c4beef0a668ebdb180d2b95a94097a1e21cef>
- [adapter notice](adapters/web-ifc/THIRD_PARTY_NOTICES.md)

외부에 Browser/VS Code executable을 배포할 때는 이 notice와 MPL-2.0
license text를 수령자가 확인할 수 있어야 하며, 포함된 MPL code의 정확한
source와 수정분을 합리적인 방법으로 받을 수 있는 경로를 함께 제공해야
합니다. 현재 qualification은 upstream npm artifact를 수정하지 않습니다.
BIM Explorer 고유 파일과 Coni Spatial 고유 파일은 `web-ifc`와 분리된
Larger Work 경계로 유지합니다. 이 항목은 release engineering 기준이며
법률 자문이나 public redistribution 승인이 아닙니다.

IfcOpenShell은 repository dependency나 distributable bundle에 포함하지 않고,
qualification 시 외부 Python environment를 주입합니다.
[candidate notice](adapters/ifcopenshell/THIRD_PARTY_NOTICES.md)는 관찰한
version과 library license 범위를 기록합니다.

성능 qualification은
[`buildingsmart-community/Community-Sample-Test-Files`](https://github.com/buildingsmart-community/Community-Sample-Test-Files)의
Schependomlaan `ROOT-Compleet.ifczip`을 고정 commit에서 내려받을 수 있습니다.
upstream 표기는 `(C) original authors`, license는 CC BY 4.0입니다. archive와
추출 IFC는 repository나 배포 artifact에 포함하지 않고 ignored local
cache에서만 사용합니다. 정확한 source·digest·사용 경계는
[`public fixture manifest`](fixtures/ifc/public-schependomlaan/manifest.json)가
소유합니다.

`web-ifc`는 제한된 IFC4 read-only exploration profile의 첫 experimental
engine으로 선정했습니다. 하지만 두 후보 모두 public product dependency나
production redistribution 승인을 받지 않았습니다. 후보를 release
dependency로 승격할 때 다음을 같은 변경에서 기록해야 합니다.

internal `openbim-explorer` package는 bounded BCFZIP/XML 처리를 위해 다음
exact registry dependency를 사용합니다.

- `fflate@0.8.3`, MIT,
  <https://github.com/101arrowz/fflate>
- `saxes@6.0.0`, ISC,
  <https://github.com/lddubeau/saxes>

두 dependency는 Community release Gate 전까지 private `UNLICENSED`
package에서만 사용합니다. public artifact에 포함할 때 exact registry
integrity, license text, SBOM과 redistribution notice를 다시 검증해야
합니다.

`packaging/web-ifc-platform-stage`는 exact Node API/WASM, MPL-2.0 text와
notice를 포함해 macOS/Linux의 offline clean install과 byte identity만
검증하는 private qualification package입니다. public release, SBOM,
signing 또는 redistribution 승인을 의미하지 않습니다.

- exact package와 version
- upstream source와 license
- static/dynamic/WASM/process 결합 방식
- redistribution·source 제공 의무
- platform artifact와 SBOM 위치
- removal 또는 replacement 절차
