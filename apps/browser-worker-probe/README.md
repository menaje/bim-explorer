# Browser Worker probe

`web-ifc@0.0.77`을 dedicated Browser Worker의 single-thread WASM으로
초기화하고 사용자가 고른 local IFC Blob 또는 repository-authored synthetic
IFC를 로컬에서 읽는 진단 surface입니다.

```sh
npm run probe:browser-worker
```

브라우저에서 `http://127.0.0.1:4173`을 열고 **Open local IFC** 또는
**Run synthetic IFC probe**를 실행합니다. local source는 64 MiB를 넘으면
읽기 전에 거부합니다. 파일명과 path는 Worker request/result에 넣지 않고,
선택 직후 input의 파일명도 지웁니다. 외부 upload, 계정 또는 telemetry를
사용하지 않습니다.

이 probe가 확인하는 범위:

- Browser module Worker에서 exact `web-ifc` ESM/WASM 초기화
- IFC schema, Project/Wall count와 geometry triangle 관찰
- model close와 engine dispose 후 Worker 종료 요청
- bounded Blob admission과 path/file-name-free source descriptor
- source 교체 시 이전 작업 취소, stale 결과 억제와 명시적 취소
- `pagehide` disposal과 dispose 이후 재사용 거부

64 MiB는 source admission 한도이지 전체 WASM/GPU memory budget이 아닙니다.
Worker 강제 종료 계약도 engine-cooperative cancellation이나 손상 입력
cleanup의 증거가 아닙니다. production Browser packaging, 대형 모델 resource
budget, negative corpus와 VS Code lifecycle은 계속 검증 대상입니다.
