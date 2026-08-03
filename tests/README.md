# Tests

공개 synthetic fixture만 사용합니다.

예정 구조:

- `foundation/`: repository, documentation와 privacy boundary
- `conformance/`: Viewer Core, source, Host와 identity contract
- `ifc/`: engine/profile/geometry/semantic qualification
- `renderer/`: 3D lifecycle, picking, section과 disposal
- `product/`: Browser/VS Code standalone behavior

실제 고객 BIM과 redistribution 권한이 불분명한 파일은 test fixture로
추적하지 않습니다.

IFC fixture artifact는
`node scripts/generate-synthetic-ifc.mjs --output <temporary.ifc>`로
생성합니다. `.ifc`는 Git에 추적하지 않습니다.

기본 `npm test`는 exact `web-ifc` Node/WASM adapter와 child-process harness를
실행합니다. child-process harness는 mapped/shared representation, Qto와
classification fixture까지 검사합니다. IfcOpenShell은 repository dependency가
아니므로 별도 Python environment를
`scripts/qualify-ifc-engine.mjs --python ...`에 주입할 때만 실행합니다.
