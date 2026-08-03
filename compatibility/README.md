# Compatibility

외부 package, engine과 format 지원 상태를 사실 기반 manifest로 관리합니다.

- `unresolved`: artifact/version/conformance가 없어 호환성을 주장하지 않음
- `experimental`: exact artifact와 synthetic fixture만 검증
- `qualified`: 공개 profile과 release Gate를 통과
- `blocked`: 필수 license, safety 또는 conformance Gate 실패

현재 Viewer Core 상태는
[`viewer-core.json`](viewer-core.json)이 소유합니다.

IFC engine 후보와 draft profile 상태는
[`ifc-engines.json`](ifc-engines.json)이 소유합니다. 두 후보의 base fixture
비교는
[`synthetic-small evidence`](evidence/ifc-engine-synthetic-small-2026-08-03.json),
mapped/shared/Qto/classification 비교는
[`synthetic-mapped evidence`](evidence/ifc-engine-synthetic-mapped-2026-08-03.json)에
기록합니다. 이는 `experimental` evidence이며 engine selection 또는
production redistribution 승인이 아닙니다.

web-ifc의 local Browser Worker ESM/WASM smoke는
[`Browser Worker evidence`](evidence/web-ifc-browser-worker-smoke-2026-08-03.json)에
분리해 기록합니다. 실제 file chooser, bounded admission, source switch와
client lifecycle 결과는
[`local-file lifecycle evidence`](evidence/web-ifc-browser-local-file-2026-08-03.json)에
기록합니다. 유효한 IFC가 열린 뒤 checkpoint에서 취소하고 model close와
engine dispose를 확인한 결과는
[`checkpoint cancellation evidence`](evidence/web-ifc-browser-checkpoint-cancellation-2026-08-03.json)에
기록합니다. 모두 prototype 결과입니다. checkpoint 사이에서 실행 중인
동기 engine 호출의 선점, 손상 입력 cleanup 또는 `packagingBrowser`
capability를 승격하지 않습니다.

Sibling checkout을 이용한 local probe는
[`evidence/viewer-core-local-probe-2026-08-03.json`](evidence/viewer-core-local-probe-2026-08-03.json)에
기록합니다. 이 결과는 source lifecycle과 3D consumer shape를 검증하지만
durable artifact, clean install 또는 public compatibility를 증명하지
않습니다.
