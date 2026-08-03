# BIM Explorer

raw BIM 모델을 로컬에서 열어 3D 형상, 공간 구조, 속성과 관계를 탐색하는
독립 오픈소스 제품입니다.

첫 vertical slice는 read-only IFC입니다. 제품명과 저장소 이름은
`bim-explorer`를 사용하며 Coni Spatial의 설치나 계정을 요구하지 않습니다.

> 현재 상태: architecture, IFC engine qualification과 첫 read-only source
> vertical slice 단계입니다.
> 두 후보는 base·mapped synthetic fixture를 통과했고 web-ifc local Browser
> Worker smoke, bounded local-file/source-session과 model-opened checkpoint
> 취소·정리, 1,024-Wall scale step과 46.77MB CC BY 4.0 공개 IFC의
> Node CPU/RSS·Browser parse/geometry budget도 통과했습니다. generated
> mapped IFC에서는 raw fingerprint, spatial tree/property identity, shared
> binary geometry range와 stale/budget 거부를 통과했습니다. 같은 공개
> IFC를 read-only source artifact로 투영해 3,569 products, 3개 bounded
> geometry range와 비렌더링 제품 diagnostic도 재현했습니다. 첫 range의
> 2,458 geometry records·3,182 instances를 bounded headless renderer에
> mount하고 전량 dispose하는 단계도 통과했습니다. 실제 Chromium
> WebGL2에서는 같은 첫 range를 4,399,252 bytes로 upload해 3,182 draws와
> rasterized first frame을 확인하고 전량 회수했습니다. visibility 기반
> loading, camera/picking/section, physical GPU qualification, deferred
> property range, engine, public package와 지원 profile은 아직 확정되지
> 않았습니다.

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

BIM Explorer 구현은 MPL-2.0, protocol·schema는 Apache-2.0을 우선
검토합니다. 이는 현재 후보이며 실제 IFC/geometry dependency의 결합 방식,
redistribution 조건과 법률 검토를 통과하기 전에는 최종 라이선스로
주장하지 않습니다.

engine과 format 지원도 미리 약속하지 않습니다. IfcOpenShell, web-ifc 등
후보를 동일 fixture로 비교하고 identity, geometry, memory, startup,
license와 packaging Gate를 통과한 profile만 지원 대상으로 올립니다.

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
실제 IFC, 고객 모델, credential과 generated cache는 Git에 추적하지
않습니다.
