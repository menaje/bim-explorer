# Compatibility

외부 package, engine과 format 지원 상태를 사실 기반 manifest로 관리합니다.

- `unresolved`: artifact/version/conformance가 없어 호환성을 주장하지 않음
- `experimental`: exact artifact와 제한된 fixture/evidence만 검증
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

read-only `BimModelSource`의 raw source fingerprint, deterministic cache,
tree/property/Render/Pick identity와 bounded immutable geometry range 결과는
[`bim-model-source.json`](bim-model-source.json)과
[`synthetic mapped source evidence`](evidence/bim-model-source-synthetic-mapped-2026-08-04.json),
[`public representative source evidence`](evidence/bim-model-source-public-representative-2026-08-04.json)가
소유합니다. 고정된 46.77MB IFC2X3에서는 3개 bounded geometry range,
첫 range 단독 read, 3,504 renderable/65 non-renderable product의 identity와
cleanup을 두 번 재현했습니다. rendered first-frame, deferred property
range, Browser/VS Code packaging, Viewer Core conformance와 IFC2X3 profile
admission은 계속 보류합니다.

내부 3D renderer draft의 source-neutral decode, bounded initial range,
Render/Pick revision binding, headless resource lifecycle과 Browser WebGL2
first frame은
[`bim-renderer-3d.json`](bim-renderer-3d.json)과
[`public headless renderer evidence`](evidence/bim-renderer-3d-public-headless-2026-08-04.json),
[`public Browser WebGL2 evidence`](evidence/bim-renderer-3d-public-browser-webgl2-2026-08-04.json)가
소유합니다. 공개 모델 첫 range에서 2,458 geometry records, 3,182
instances와 127,993 instanced triangles를 재현했습니다. 실제 Chromium
WebGL2 API에 4,399,252 bytes를 upload해 3,182 draws와 67,153
non-background pixels를 확인하고 allocation을 0으로 회수했습니다.
physical GPU qualification, visibility 기반 range 계획, camera/picking,
context loss, section과 Host conformance는 계속 보류합니다.

web-ifc의 local Browser Worker ESM/WASM smoke는
[`Browser Worker evidence`](evidence/web-ifc-browser-worker-smoke-2026-08-03.json)에
분리해 기록합니다. 실제 file chooser, bounded admission, source switch와
client lifecycle 결과는
[`local-file lifecycle evidence`](evidence/web-ifc-browser-local-file-2026-08-03.json)에
기록합니다. 유효한 IFC가 열린 뒤 checkpoint에서 취소하고 model close와
engine dispose를 확인한 결과는
[`checkpoint cancellation evidence`](evidence/web-ifc-browser-checkpoint-cancellation-2026-08-03.json)에
기록합니다. generated 1,024-Wall fixture의 시간·WASM heap-capacity 예산은
[`bounded performance evidence`](evidence/web-ifc-browser-bounded-performance-2026-08-03.json)에
기록합니다. CC BY 4.0 Schependomlaan IFC2X3의 고정 provenance·Node
CPU/RSS는
[`public Node performance`](evidence/web-ifc-public-representative-node-performance-2026-08-03.json),
실제 Chromium Worker parse/geometry는
[`public Browser performance`](evidence/web-ifc-browser-public-representative-performance-2026-08-03.json)에
분리합니다. 모두 prototype 결과입니다. IFC2X3 profile, GPU upload·render
first-frame, checkpoint 사이에서 실행 중인 동기 engine 호출의 선점, 손상
입력 cleanup 또는 `packagingBrowser` capability를 승격하지 않습니다.
renderer의 WebGL2 first frame은 별도 Gate이며 engine/profile 선정이나
production GPU memory 보장을 뜻하지 않습니다.

Sibling checkout을 이용한 local probe는
[`evidence/viewer-core-local-probe-2026-08-03.json`](evidence/viewer-core-local-probe-2026-08-03.json)에
기록합니다. 이 결과는 source lifecycle과 3D consumer shape를 검증하지만
durable artifact, clean install 또는 public compatibility를 증명하지
않습니다.
