---
type: specification
status: draft
authority:
  - reference-anchor-receipt
  - reference-anchor-invalidation
  - source-local-hit-identity
last_reviewed: 2026-08-09
---

# BIM reference anchor v0.1

## 상태와 범위

`bim-explorer-reference-anchor/0.1`은 read-only 3D pick을 외부 소비자가
설계 기준으로 등록할 수 있도록 exact source revision, native identity와
source-local hit를 묶는 authority-free receipt draft다.

이 계약은 Spatial constraint, Canonical Entity ID, source mutation, topology
editing 또는 native write를 정의하지 않는다. screen coordinate나 Render/Pick
ID만 저장해 장기 reference로 사용하지 않는다.

## Anchor receipt

receipt는 최소 다음 값을 가진다.

```json
{
  "schema": "bim-explorer-reference-anchor/0.1",
  "federationSourceId": "source-slot:existing-shell",
  "nativeDocument": {
    "format": "ifc",
    "fingerprint": "sha256:...",
    "revisionId": "source-snapshot:sha256:...",
    "schema": "IFC4",
    "profile": "ReferenceView_V1.2"
  },
  "nativeIdentity": {
    "kind": "ifc-global-id",
    "nativeId": "ifc-globalid:...",
    "globalId": "0123456789ABCDEFGHIJKL",
    "occurrencePath": []
  },
  "hit": {
    "coordinateSpace": "source-local",
    "point": [12.5, 4.25, 3.0],
    "normal": [0.0, 0.0, 1.0]
  },
  "locator": {
    "kind": "triangle-barycentric",
    "primitiveId": "primitive:42",
    "triangleIndex": 7,
    "barycentric": [0.2, 0.3, 0.5]
  },
  "stability": "derived",
  "alignmentFingerprint": "sha256:...",
  "projectionFingerprint": "sha256:..."
}
```

모든 number는 finite여야 한다. point는 정확히 세 좌표를 가지며 normal은
zero vector가 아니어야 한다. consumer는 normal을 사용하기 전에 정규화한다.
`occurrencePath`는 instance/assembly transform chain이 있을 때 순서를
보존한다.

## Identity와 locator

anchor identity는 최소 다음 tuple이다.

```text
(federation source slot, native revision, native identity, occurrence path)
```

IFC GlobalId, glTF node/mesh/primitive ID 또는 다른 source-native ID를 서로
합치지 않는다. `globalId`는 해당 format/profile이 제공할 때만 존재하며 GLB
같은 reference mesh는 이를 합성하지 않는다.

`locator`는 optional이다.

- `native`: source/profile이 검증한 stable topology locator
- `derived`: exact renderer projection에서만 재현 가능한
  primitive/triangle/barycentric locator
- `point-only`: native identity와 source-local point·normal만 보존

v0.1의 기본 `stability`는 `derived`다. triangle index나 barycentric 좌표를
native authoring face ID 또는 source-precision geometry로 표현하지 않는다.

## Coordinate와 projection

`hit.point`와 `hit.normal`은 source-local 좌표다. federation/world 좌표만
반환하는 anchor는 허용하지 않는다. surface는 pick 시 사용한 exact
`sourceToFederation` alignment와 renderer projection의 fingerprint를 함께
반환한다.

consumer가 Workspace 좌표를 만들 때는 등록된 source-to-Workspace transform을
별도로 적용한다. Explorer receipt가 CRS, datum transformation 또는 Workspace
placement authority를 발급하지 않는다.

## Invalidation

다음 중 하나가 바뀌면 기존 anchor는 stale다.

- native source fingerprint 또는 revision
- source slot에 바인딩된 native identity나 occurrence path
- alignment fingerprint
- renderer projection fingerprint가 locator 의미를 바꾸는 경우

stale anchor를 새 revision에 자동 이월하지 않는다. consumer는 새 source에서
identity와 locator를 다시 resolve하고 성공·missing·ambiguous·conflict를
명시적으로 기록해야 한다. point가 우연히 같은 위치라는 이유로 exact match를
주장하지 않는다.

## Bounds와 privacy

한 selection receipt의 기본 상한은 32 KiB, occurrence path 64개,
locator 하나다. receipt는 local path, credential, parser pointer, raw source
payload, Workspace capability와 acceptance token을 포함하지 않는다.

## Authority

receipt의 authority record는 다음을 모두 `false`로 유지한다.

```text
workspace
canonicalEntityId
sourceMutation
geometryMutation
constraintMutation
acceptance
publish
export
```

## Conformance Gate

qualification은 최소 IFC semantic source와 GLB reference source에서
source-local hit, source-scoped native identity, occurrence path, alignment와
projection fingerprint를 재현해야 한다. source refresh·alignment 변경·stale
projection 거부와 dispose cleanup도 포함한다. 실제 Spatial constraint 등록과
reconcile은 consumer-owned evidence다.
