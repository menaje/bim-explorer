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

일반 process supervisor test는 harmless Node stub으로 성공, redacted failure,
timeout, output budget과 AbortSignal 취소 후 강제 종료를 검사합니다. 특정 IFC
engine의 손상 입력·취소 또는 Browser Worker cleanup 증거로 승격하지 않습니다.

Browser Worker probe test는 loopback server의 strict route/CSP와 main-thread
Worker client의 report validation, path-free failure, cancel/terminate 요청을
검사합니다. source-session test는 size-before-read admission, 파일명 비노출,
active source 교체, stale 결과 억제, 명시적 취소와 terminal disposal을
검사합니다. 실제 Chromium ESM/WASM과 file chooser 관찰은 별도 evidence로
기록하며 engine cancellation과 production Browser packaging Gate는 계속
분리합니다.
