# openBIM Explorer

`@bim-explorer/openbim-explorer`는 활성 `BimModelSource` snapshot에 묶인
BCF XML 3.0, IDS 1.0 결과와 bSDD reference를 read-only로 탐색하는 내부
experimental package입니다.

현재 범위:

- central/local directory를 선검사하는 bounded BCFZIP import
- BCF issue metadata, camera, clipping, visibility, coloring과 selection
- 동일 source revision의 GlobalId→Render/Pick identity 해석
- deterministic minimal BCF XML 3.0 local export
- bounded IDS 1.0 document, applicability와 requirement facet 탐색
- `pass`·`fail`·`not-evaluated` result와 failing entity highlight
- Explorer·external·Spatial validation provenance의 명시적 구분
- bSDD identifier URI, dictionary version과 class/property code 보존
- 기본 offline 상태와 `allowNetwork: true`에서만 수행하는 bounded lookup
- stale source, missing GlobalId와 non-renderable entity 진단

BCF import/export는 collaboration server가 아니며 IDS document import는
XSD validation이나 IFC requirement evaluation을 수행하지 않습니다.
bSDD lookup도 import 중 자동으로 발생하지 않습니다. 이 package의 결과는
source baseline, Spatial Revision, acceptance 또는 publish 권한을
변경하지 않습니다.

package는 Community release Gate 전까지 `private: true`,
`UNLICENSED`입니다. `fflate@0.8.3`과 `saxes@6.0.0`을 exact registry
version으로 사용하며 공개 배포 여부와 notice는 release Gate가 결정합니다.
