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

IFC fixture artifact는 `node scripts/generate-synthetic-ifc.mjs --fixture
small|mapped|performance --output <temporary.ifc>`로 생성합니다. `.ifc`는
Git에 추적하지 않습니다.

기본 `npm test`는 exact `web-ifc` Node/WASM adapter와 child-process harness를
실행합니다. child-process harness는 mapped/shared representation, Qto와
classification fixture까지 검사합니다. IfcOpenShell은 repository dependency가
아니므로 별도 Python environment를
`scripts/qualify-ifc-engine.mjs --python ...`에 주입할 때만 실행합니다.

일반 process supervisor test는 harmless Node stub으로 성공, redacted failure,
timeout, output budget과 AbortSignal 취소 후 강제 종료를 검사합니다. 특정 IFC
engine의 손상 입력·취소 또는 Browser Worker cleanup 증거로 승격하지 않습니다.

Browser Worker probe test는 loopback server의 strict route/CSP와 main-thread
Worker client의 report validation, path-free failure, ordered checkpoint,
model-opened cooperative cleanup과 응답 없는 취소의 bounded 강제 종료를
검사합니다. source-session test는 size-before-read admission, 파일명 비노출,
active source 교체, stale 결과 억제, 중첩 cancellation receipt와 terminal
disposal을 검사합니다. 실제 Chromium ESM/WASM, file chooser와 checkpoint
취소, 1,024-Wall bounded performance 관찰은 별도 evidence로 기록합니다.
성능 test는 fixture identity, 시간 budget, WASM heap capacity와 cleanup을
fail-closed로 검사합니다. 대표 대형 모델, 실행 중인 동기 engine 호출의
선점, 손상 입력 cleanup과 production Browser packaging Gate는 계속
분리합니다.

`bim-model-source` test는 generated mapped IFC에서 raw source fingerprint,
spatial tree와 product semantics, shared·multi-range geometry payload,
Express ID/GlobalId/Render/Pick lookup, 비렌더링 product identity,
bounded range read와 stale·malformed artifact 거부를 검사합니다. 별도 공개
fixture qualification은 46.77MB IFC2X3의 3개 range와 첫 range 단독 read를
두 번 확인합니다. 공용 Viewer Core conformance나 rendered first-frame
test는 아닙니다.
