# BIM Retained Overlay v0.1

## 상태와 목적

이 문서는 `consumer-overlay` source가 native IFC/glTF/DWG 원본을 다시 읽거나
파싱하지 않고 bounded geometry delta를 Viewer에 전달하는 additive draft를
정의한다. 다음 contract가 함께 한 revision을 이룬다.

```text
bim-explorer-retained-overlay-packet/0.1
application/vnd.bim-explorer.retained-overlay-delta.v1
bim-explorer-retained-overlay-delta-receipt/0.1
bim-explorer-retained-overlay-checkpoint-receipt/0.1
bim-explorer-federated-retained-overlay/0.1
bim-explorer-federated-retained-overlay-adapter/0.1
```

이 contract는 공개된 immutable
`@bim-explorer/federated-bim-surface@0.2.0` runtime을 변경하지 않고 새
v0.3.0 package candidate에 포함됩니다. immutable public v0.3.0 artifact는 tag
workflow가 완료되기 전까지 주장하지 않습니다.

## Packet envelope

packet은 24-byte little-endian header, UTF-8 JSON manifest, 0–3 byte zero padding,
canonical binary geometry 순서로 구성한다.

| Offset | Type | Meaning |
| ---: | --- | --- |
| 0 | 8-byte ASCII | `BEXOVL01` magic |
| 8 | uint32 LE | version `1` |
| 12 | uint32 LE | JSON manifest byte length |
| 16 | uint32 LE | binary geometry byte length |
| 20 | uint32 LE | entry count |

manifest는 `schema`, `deltaId`, `sourceId`, `layerId`, `fromRevisionId`,
`toRevisionId`, 양의 `sequence`와 `entries`만 허용한다. 모든 ID는 1–512자의
control-character-free, local-path-free opaque string이다. packet SHA-256,
byte length, media type과 manifest의 delta/source/layer/revision/sequence는
Viewer Render Protocol payload descriptor 및 operation과 모두 정확히 일치해야
한다.

geometry entry의 binary slice는 다음 순서다.

1. vertex마다 Float32 LE position XYZ와 normal XYZ를 interleave한 24-byte record
2. triangle마다 세 개의 Uint32 LE index

각 geometry slice는 4-byte aligned이고 앞 entry의 끝에서 바로 시작한다.
overlap, gap, unused tail, trailing byte와 non-zero JSON padding은 거부한다.
position/normal은 finite여야 하고 index는 vertex count보다 작아야 한다.

기본 한도는 packet 8 MiB, packet entry 4,096개, resident overlay object
32,768개, CPU/GPU transaction staging 16 MiB다. 제품은 더 작은 한도를 선택할
수 있지만 같은 contract identifier에서 더 큰 기본 한도를 암묵적으로
허용하지 않는다.

## Entry와 operation

모든 entry는 `operationId`, operation `kind`, `aspect`, source-local
`renderId`와 positive-extent world `bounds`를 가진다.

| Kind/aspect | Required data | Meaning |
| --- | --- | --- |
| `upsert/entity` | geometry, identity, transform, color, visibility | 새 retained object 전체 생성 |
| `upsert/geometry` | geometry, identity, transform, color, visibility | current object geometry와 display identity 교체 |
| `upsert/transform` | transform | current retained/base geometry의 instance transform 교체 |
| `upsert/style` | color 또는 visibility | current object display style 교체 |
| `upsert/identity` | Pick/native/external identity 중 하나 이상 | current display identity 교체 |
| `tombstone/entity` | 다른 payload metadata 없음 | current object 제거 및 base occurrence 억제 |

geometry upsert는 Float32 position/normal, Uint32 triangle index, 4×4 finite
column-major transform, `[0,1]` RGBA, visibility, source-local native ID와 opaque
external identity token을 모두 제공한다. Renderer는 source-local Render/Pick
ID를 overlay namespace의 projected ID로 결정적으로 바꾸며 다른 source slot의
동일 문자열과 병합하지 않는다.

한 atomic delta에서 한 Render ID는 한 번만 바뀔 수 있다. operation bounds는
delta bounds 안에 있어야 하고 packet entry bounds는 operation bounds와 정확히
같아야 한다. metadata-only update와 tombstone은 current object가 없으면
fail closed한다. 여러 base occurrence가 같은 Render ID를 공유할 때 geometry
교체는 모두 억제하고 한 retained object로 전환할 수 있지만 metadata-only
교체는 ambiguous하므로 지원하지 않는다.

## Two-phase renderer lifecycle

`prepareRetainedOverlayDelta()`는 다음을 commit 전에 끝낸다.

1. expected revision과 `sequence + 1` 검증
2. operation/packet/digest/identity/bounds와 configured budget 검증
3. packet을 bounded CPU memory에서 decode하고 GPU buffer를 별도 staging에 upload
4. candidate geometry, visibility와 Pick map을 off-screen framebuffer에 render
5. source packet과 decoded CPU geometry를 zero-fill

prepare receipt의 `currentFramebufferPreserved`와
`currentPickMapPreserved`는 둘 다 `true`여야 한다. 이 단계에서 current
revision, visible framebuffer, Pick map, camera, clipping, selection과 외부 base
range allocation은 바뀌지 않는다.

transaction의 synchronous `commit()` 하나가 candidate color framebuffer,
geometry instance list, visibility, projected identity/Pick map과 overlay revision을
같이 바꾼다. WebGL2 default framebuffer에는 pre-rendered color target을 한 번
blit하고 이후 active state를 교체한다. commit receipt의
`geometryPickRevisionAtomic`이 `true`가 아니면 Renderer는 성공으로 인정하지
않는다.

`rollback()` 또는 open transaction의 `dispose()`는 새 GPU buffer와 off-screen
target만 회수한다. cancellation, allocation failure, malformed packet, digest
mismatch, stale/out-of-order delta와 backend receipt mismatch는 current
framebuffer/identity/revision을 보존해야 한다. terminal Surface dispose는 staged
transaction을 먼저 rollback한 뒤 retained 및 base GPU resource를 모두 회수한다.

## Surface와 Viewer Core adapter

Federated Surface는 caller가 `sourceRole: consumer-overlay`로 연 source slot만
retained source로 등록한다. 등록은 native revision과 source-local Render/Pick
ID를 보존하고 composite renderer의 projected ID에 묶는다. 다른 role 또는
unaligned/비활성 slot은 adapter를 만들 수 없다.

`createRetainedOverlayAdapter()`는 Viewer Core의 staged adapter shape를 따른다.

```text
prepareDelta(delta, { signal }) -> Promise<transaction>
transaction.commit()           -> synchronous receipt
transaction.rollback()         -> Promise
transaction.dispose()          -> Promise
adapter.dispose()               -> Promise
```

Viewer Core가 delta를 parse한 뒤 adapter가 payload를 한 번 읽고 Surface에
넘긴다. adapter는 caller byte를 직접 소유하지 않고 사본을 만들며 prepare 종료
전에 그 사본을 지운다. Viewer Core controller state와 Surface overlay revision은
같은 synchronous commit 뒤에만 함께 전진한다. Viewer Core가 stale/order를 먼저
거부하거나 linked AbortSignal이 payload 준비를 취소하면 Surface에는 staged
state가 남지 않는다.

현재 확인된 upstream 경계는 public `@menaje/viewer-core` source version 0.1.3,
commit `6702ad1439e44fa9a9835f56181614299c1fe1ff`와 wire protocol 0.1.0이다.
이는 exact source-commit qualification이며 published 0.1.3 artifact admission이
아니다.

## Pick, anchor와 checkpoint

commit 뒤 Pick receipt는 retained projected Render/Pick ID와 overlay revision,
sequence를 반환한다. retained packet에는 native source triangle/range locator가
없으므로 exact source-local surface hit와 reference anchor는
`retained-overlay-has-no-source-local-locator`로 unavailable이다. object selection은
계속 source slot과 native identity에 묶인다.

`checkpointRetainedOverlay()`는 expected retained revision을 요구하고 현재
logical object/identity count와 active backend bytes를 기록한다. checkpoint는
native source range를 읽거나 parse/upload하지 않으며 receipt의
`externalSourceRangeReads`, `externalSourceParses`와
`externalSourceRangeUploads`는 모두 0이다. 이것은 display checkpoint이지
source-authoritative revision이나 publish 결과가 아니다.

## Conformance Gate

conformance는 최소 다음을 포함한다.

- valid packet과 malformed magic/version/layout/index/digest/budget fixture
- upsert, style, transform, identity, rollback, tombstone와 deterministic dispose
- stale/order, cancellation와 allocation failure 뒤 current state 보존
- actual Browser WebGL2 pixel/Pick/latency/lifecycle
- actual VS Code webview WebGL2의 같은 packet/Surface lifecycle
- Viewer Core 0.1.3 exact source commit의 async prepare/synchronous commit,
  cancellation과 stale rejection
- base range read, base GPU allocation, camera, clipping과 checkpoint replay 0
- 기존 immutable Federated Surface v0.2 bundle hash와 v0.2 회귀 검사

## Authority

retained overlay는 display projection과 selection evidence만 소유한다. native
source mutation, Workspace, Canonical Entity ID, revision accept, publish, export,
constraint 또는 source ACL authority를 만들지 않는다. 공식 업무·설계 상태로의
승격은 별도 consumer policy와 사람의 검토가 필요하다.
