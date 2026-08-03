# Browser Worker probe

`web-ifc@0.0.77`을 dedicated Browser Worker의 single-thread WASM으로
초기화하고 사용자가 고른 local IFC Blob 또는 repository-authored synthetic
IFC를 로컬에서 읽는 진단 surface입니다.

```sh
npm run probe:browser-worker
```

브라우저에서 `http://127.0.0.1:4173`을 열고 **Open local IFC**,
**Run synthetic IFC probe** 또는 **Run cancellation probe**를 실행합니다.
local source는 64 MiB를 넘으면 읽기 전에 거부합니다. 파일명과 path는
Worker request/result에 넣지 않고, 선택 직후 input의 파일명도 지웁니다.
외부 upload, 계정 또는 telemetry를 사용하지 않습니다.

이 probe가 확인하는 범위:

- Browser module Worker에서 exact `web-ifc` ESM/WASM 초기화
- IFC schema, Project/Wall count와 geometry triangle 관찰
- model close와 engine dispose 후 Worker 종료 요청
- bounded Blob admission과 path/file-name-free source descriptor
- source 교체 시 이전 작업 취소, stale 결과 억제와 명시적 취소
- `engine-initialized` → `model-opened` → `inspection-complete` 순서의
  checkpoint/continue handshake
- `model-opened` checkpoint 취소 시 model close와 engine dispose 영수증
- 취소 요청 뒤 500ms grace와 응답하지 않는 Worker의 강제 종료 fallback
- `pagehide` disposal과 dispose 이후 재사용 거부

64 MiB는 source admission 한도이지 전체 WASM/GPU memory budget이 아닙니다.
checkpoint 취소는 유효한 작은 IFC가 열린 뒤 adapter가 제어권을 돌려준
지점의 cooperative cleanup만 증명합니다. 실행 중인 synchronous `web-ifc`
호출을 선점하는 cancellation, 손상 입력 cleanup, production Browser
packaging, 대형 모델 resource budget과 VS Code lifecycle은 계속 검증
대상입니다.
