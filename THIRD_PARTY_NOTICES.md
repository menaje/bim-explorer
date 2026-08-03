# Third-party notices

experimental `web-ifc` qualification adapter와 local Browser Worker probe는
다음 dependency를 exact version으로 사용합니다.

- `web-ifc@0.0.77`
- MPL-2.0
- <https://github.com/ThatOpen/engine_web-ifc>
- [adapter notice](adapters/web-ifc/THIRD_PARTY_NOTICES.md)

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

두 후보 모두 public product dependency나 production redistribution 승인을
받지 않았습니다. 후보를 release dependency로 승격할 때 다음을 같은 변경에서
기록해야 합니다.

- exact package와 version
- upstream source와 license
- static/dynamic/WASM/process 결합 방식
- redistribution·source 제공 의무
- platform artifact와 SBOM 위치
- removal 또는 replacement 절차
