# Browser Worker probe

`web-ifc@0.0.77`을 dedicated Browser Worker의 single-thread WASM으로
초기화하고 repository-authored synthetic IFC를 로컬에서 읽는 진단
surface입니다.

```sh
npm run probe:browser-worker
```

브라우저에서 `http://127.0.0.1:4173`을 열고 **Run synthetic IFC probe**를
실행합니다. source bytes는 같은 loopback origin에서만 가져오며 외부
upload, 계정 또는 telemetry를 사용하지 않습니다.

이 probe가 확인하는 범위:

- Browser module Worker에서 exact `web-ifc` ESM/WASM 초기화
- IFC schema, Project/Wall count와 geometry triangle 관찰
- model close와 engine dispose 후 Worker 종료 요청
- main-thread client의 timeout, 취소와 path-free error

이는 production Browser packaging, 실제 파일 선택, 대형 모델 resource
budget, 손상 입력 cleanup 또는 장기 Worker lifecycle qualification이
아닙니다.
