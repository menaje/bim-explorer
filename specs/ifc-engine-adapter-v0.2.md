# IFC engine adapter contract v0.2 (draft)

Status: experimental draft

Report schema: `bim-explorer-ifc-engine-report/0.2`

Fingerprint projection: `bim-explorer-ifc-engine-fingerprint/0.2`

## Process contract

Qualification adapter는 하나의 명시적 source capability를 읽는 격리 process로
실행합니다.

```text
stdin: unused
argument: --input <ephemeral source>
stdout: one JSON report
stderr: bounded private diagnostic
exit 0: report produced and parsed
non-zero/timeout/signal: no snapshot admission
```

public report에는 source path, engine object, native pointer, credential 또는
원본 model payload를 포함하지 않습니다. source는 id, byte length, SHA-256,
detected schema와 exchange view로만 식별합니다.

## Report

필수 top-level field:

- `engine`: exact id/version/backend/license
- `fixture`: stable fixture id, schema/view, byte length와 digest
- `capabilities`: 모든 operation의 `native/mapped/opaque/lossy/blocked` 상태
- `semantics`: entity counts, GlobalId diagnostic, hierarchy와 selected object
- `relations`: relation entity counts
- `representationSharing`: map/item/product/source reuse count
- `geometry`: products/geometries/vertices/triangles, IFC Z-up aggregate와
  occurrence별 bounds
- `performance`: init/open/semantic/geometry/total과 memory 관찰값
- `cleanup`: explicit model/engine cleanup receipt
- `diagnostics`: path-free public diagnostic codes
- `fingerprint`: stable projection의 SHA-256

성능, cleanup과 diagnostic은 fingerprint에서 제외합니다. engine metadata,
source digest, capabilities, semantic/relation snapshot과 geometry는 포함합니다.

## Identity

GlobalId는 IFC source-local native identity입니다. report는 IfcRoot의
GlobalId–Express ID map을 digest로 기록해 같은 source 반복 parse에서의
결정성을 검사합니다. Express ID는 같은 parsed snapshot의 lookup key일 뿐
source 변경을 가로지르는 stable identity로 승격하지 않습니다. Render/Pick
ID와 Spatial Canonical Entity ID는 이 qualification report의 범위가 아닙니다.

## Admission

v0.1 report 통과는 synthetic fixture에 대한 engine 관찰 증거입니다. 다음을
자동으로 의미하지 않습니다.

- public IFC implementation profile
- large/corrupt model safety
- Browser/VS Code packaging
- write/round-trip 가능성
- license 또는 production redistribution 승인

validator 구현은
[`packages/ifc-engine-contract`](../packages/ifc-engine-contract/README.md),
candidate 상태는
[`compatibility/ifc-engines.json`](../compatibility/ifc-engines.json)을
따릅니다.
