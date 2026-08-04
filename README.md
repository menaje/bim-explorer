# BIM Explorer

raw BIM 모델을 로컬에서 열어 3D 형상, 공간 구조, 속성과 관계를 탐색하는
독립 오픈소스 제품입니다.

첫 vertical slice는 read-only IFC입니다. 제품명과 저장소 이름은
`bim-explorer`를 사용하며 Coni Spatial의 설치나 계정을 요구하지 않습니다.

> 현재 상태: v0.1.0 Community release candidate와 read-only
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
> shell과 staged VS Code `.ifc` read-only Custom Editor는 같은 source
> fingerprint, model/renderer projection, 실제 Chromium WebGL2와
> source switch/editor-exit cleanup을 통과했습니다. 독립 VSIX도 빈
> profile에 clean install한 뒤 설치본으로 같은 fixture, WebGL2와 close
> cleanup을 다시 통과했습니다. 이어 46.77MB 공개 IFC도 Browser와
> clean-installed VSIX에서 각각 3,569 products·261,424 triangles·3 ranges로
> 열고 같은 첫-range WebGL2 projection과 cleanup을 재현했습니다.
> occurrence/type primitive property value는 별도 lazy range로 읽고,
> IFC4 projected CRS/MapConversion과 fingerprinted source
> precision·lossy Float32 display tessellation 경계도 통과했습니다. complex
> property, 실제 측량 좌표/datum 변환과 source-precision geometry export는
> 제한합니다. physical GPU qualification, engine-cooperative cancellation,
> forced-exit 내부 cleanup과 Browser/native resource exhaustion은 아직
> 확정되지 않았습니다. 첫 engine은 exact `web-ifc@0.0.77`, 첫 profile은 IFC4
> `ReferenceView_V1.2`의 local read-only exploration으로 experimental
> admission했습니다. IfcOpenShell은 bundle하지 않는 qualification
> reference oracle로 유지합니다. 공개 `@menaje/viewer-core`와 render
> protocol package 0.1.2 prerelease는 exact release asset으로 고정했고,
> wire protocol 0.1.0에서 실제 BIM
> source·3D renderer의 Browser/VS Code 호스트 conformance를 통과했습니다.
> 제품 entrypoint 적용과 stable/production 주장은 별도 Gate입니다. 공개 IFC call-start
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
local IFC 선택
-> isolated adapter가 immutable source snapshot 생성
-> model tree와 3D overview 표시
-> 객체 선택
-> property·type·containment·relation 탐색
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
- IFC engine, format, license, 성능과 compatibility qualification
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

optional Spatial 연계는
[`bim-explorer-spatial-integration/0.1`](specs/bim-spatial-integration-v0.1.md)
bridge를 사용합니다. Explorer는 source-bound GlobalId와 viewpoint만
제공하고 Spatial Service가 Canonical mapping, 2D/3D selection과 opaque
Context Reference를 발급합니다. 현재 synthetic provider conformance는
통과했으며 실제 Spatial consumer와 독립 Spatial bundle 검증은 Spatial
저장소 이슈가 소유합니다.

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

## 관련 저장소

- [dwg-viewer](https://github.com/menaje/dwg-viewer):
  Viewer Core/render protocol과 독립 raw DWG 제품
- [coni-spatial](https://github.com/menaje/coni-spatial):
  Workspace, revision, Agent change, reconcile와 product authority

## 개발 기준선

Node.js 24가 필요합니다.

```bash
npm ci
npm run check
npm run start:web
npm run qualify:product:web:public
npm run qualify:product:vscode-install
npm run qualify:ifc:platform-package
npm run qualify:ifc:license-profile
npm run qualify:viewer-core
npm run qualify:openbim
npm run qualify:community-release
npm run package:vscode
npm run release:bundle
```

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
BCF·IDS·bSDD 탐색 계약의 상태는
[compatibility/openbim-explorer.json](compatibility/openbim-explorer.json)을
따릅니다.
실제 IFC, 고객 모델, credential과 generated cache는 Git에 추적하지
않습니다.
