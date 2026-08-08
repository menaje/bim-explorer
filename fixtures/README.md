# Fixtures

공개 qualification에는 repository-authored synthetic generator 또는
provenance·license·고정 digest와 사용 경계가 명시된 public manifest만
사용합니다.

`.ifc`, `.ifczip`, `.rvt` 등 model artifact 자체는 Git에서 차단합니다.
fixture command가 임시 디렉터리에 결정적으로 생성하고 종료 시 삭제합니다.

현재 fixture:

- `ifc/synthetic-small`: IFC4 Project/Site/Building/Storey/Space/Wall,
  extrusion geometry, property, type와 material relation
- `ifc/synthetic-mapped`: 두 Wall이 하나의 representation map을 재사용하며
  quantity, classification과 Express ID mapping을 포함
- `ifc/synthetic-performance`: 1,024 Wall이 하나의 representation map을
  사용하는 388,316-byte bounded Browser scale step
- `ifc/negative-corpus`: invalid STEP preamble, truncated DATA section과
  missing Project root의 작은 generated rejection/cleanup corpus
- `ifc/public-schependomlaan`: buildingSMART Community Sample Test Files의
  46,766,968-byte IFC2X3를 parse/source/headless-renderer 성능에 사용하는
  CC BY 4.0 manifest
- `gltf/public-khronos-box`: 1,664-byte embedded GLB parser·identity·제품
  surface smoke에 사용하는 Cesium CC BY 4.0 manifest
- `gltf/public-khronos-a-beautiful-game`: 42,977,928-byte embedded GLB의
  417,028 vertices·573,952 unique triangles를 product-scale reference
  source, SwiftShader WebGL2, Browser/VS Code/clean VSIX 제품 file-open과
  generated IFC 두 source의 동시 federation projection에 사용하는
  ASWF/Ed Mackey CC BY 4.0 manifest
- `e57/public-libe57-coloured-cube`: `libE57Format-test-data`의 118,784-byte
  CC0 E57을 envelope, 116-page CRC-32C와 XML metadata profile의 cache-only
  pre-admission probe, 자체 decoder와 Browser/VS Code 제품 open에 사용하는
  manifest
- `e57/public-libe57-bunny-profiles`: 같은 저장소 `reference` 디렉터리의
  Test Data License 대상 `bunnyDouble.e57`·`bunnyInt32.e57`을 cache-only로
  받아 30,571-point Float64/ScaledInteger parity, `cartesianInvalidState`,
  indexless compressed-vector와 source-neutral point range를 검증하는 manifest
- `e57/public-e57-example-spherical`: E57 reference implementation의
  5,168,128-byte `pumpASpherical.e57`을 cache-only로 받아 370,530개 spherical
  RAE/intensity/RGB record, 215,329개 invalid filter와 155,201개 Cartesian
  display point의 독립 `pye57/libE57Format` parity를 검증하는 manifest. 원본은
  재배포하지 않음
- `las-laz/public-loaders-gl-ripple`: `visgl/loaders.gl`의 paired 347,061-byte
  LAS와 53,952-byte LAZ를 cache-only로 받아 LAS 1.2 point-format 3의
  10,201개 record, Float64 좌표·RGB와 압축 해제 후 exact record SHA-256
  parity 및 actual Chrome Worker lifecycle을 검증하는 manifest. 샘플
  binary는 재배포하지 않음

어느 performance fixture도 artifact를 추적하지 않습니다. public fixture는
고정 commit의 8,873,221-byte IFCZIP과 내부 단일 IFC를 각각 SHA-256으로
검증하고 `.ifc-cache/public-ifc`에만 추출합니다. archive는 보관하지 않으며
fixture bundling과 draft IFC4 profile admission은 승인하지 않습니다.
두 glTF fixture도 `.gltf-cache/public-gltf`의 digest cache로만 내려받으며
원본 GLB를 Git 또는 release bundle에 포함하지 않습니다.
E57 sample도 `.bim-explorer-cache/public-reference/e57`에만 내려받고 Git 또는
release에 포함하지 않습니다. test-only 사용에는 샘플 재배포를 요구하지 않습니다.
LAS/LAZ pair도 `.bim-explorer-cache/public-reference/las-laz`에만 내려받고 Git,
Community runtime 또는 release에 포함하지 않습니다.

```sh
npm run fetch:ifc:public
npm run qualify:ifc:public
npm run qualify:ifc:negative
npm run qualify:bim-source:public
npm run qualify:renderer:public
npm run fetch:gltf:product-scale
npm run fetch:e57:public
npm run qualify:e57:probe
npm run fetch:e57:profiles
npm run qualify:e57:profiles
npm run fetch:e57:spherical
npm run qualify:e57:spherical
npm run qualify:e57:spherical:product:web
npm run qualify:e57:spherical:product:vscode
npm run fetch:las-laz:public
npm run qualify:las-laz:probe
npm run qualify:las-laz:worker
npm run qualify:las-laz:renderer
npm run qualify:gltf:product-scale
npm run qualify:gltf:product-scale:web
npm run qualify:gltf:product-scale:vscode
npm run qualify:gltf:product-scale:vscode-install
npm run qualify:federation:product-scale
```
