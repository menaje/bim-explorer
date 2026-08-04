# openBIM Explorer v0.1

Status: experimental internal contract.

## Contract identity

- Explorer: `bim-explorer-openbim-explorer/0.1`
- BCF document: `bim-explorer-bcf-document/0.1`
- BCF viewpoint resolution:
  `bim-explorer-bcf-viewpoint-resolution/0.1`
- IDS document: `bim-explorer-ids-document/0.1`
- IDS result: `bim-explorer-ids-result/0.1`
- IDS result resolution:
  `bim-explorer-ids-result-resolution/0.1`
- bSDD reference: `bim-explorer-bsdd-reference/0.1`
- bSDD lookup: `bim-explorer-bsdd-lookup/0.1`
- Source: `bim-explorer-bim-source/0.2`

## Profile

v0.1은 buildingSMART BCF XML `release_3_0`의 local BCFZIP과 IDS
`v1.0.0` XML을 read/explore 대상으로 제한합니다. bSDD는
`identifier.buildingsmart.org`의 class/property URI를 보존하고
`api.bsdd.buildingsmart.org/api/Class|Property/v1`의 explicit lookup
profile만 사용합니다.

이 profile은 전체 BCF XSD validation, IDS requirement evaluation, BCF API
collaboration 또는 bSDD live-service qualification을 주장하지 않습니다.

## Source binding

모든 BCF/IDS document와 IDS result는 다음 source binding을 가져야 합니다.

```json
{
  "protocolVersion": "bim-explorer-bim-source/0.2",
  "fingerprint": "sha256:<64 lowercase hex>",
  "revisionId": "source-snapshot:sha256:<same 64 lowercase hex>"
}
```

viewpoint 적용과 failing entity selection 때 active snapshot과 세 필드를
exact 비교합니다. 불일치는 `InvalidStateError`이며 자동 reconcile이나
best-effort 적용을 하지 않습니다.

component는 IFC GlobalId로 해석합니다. GlobalId 없음, active snapshot에
없음, Render ID가 없는 semantic-only entity를 각각 다른 diagnostic으로
유지합니다.

## BCF XML 3.0

### Import

BCFZIP을 inflate하기 전에 EOCD, central/local directory, entry 이름,
compression method와 선언 크기를 검사합니다.

- archive: 8 MiB
- uncompressed total: 16 MiB
- entry: 2 MiB
- entries: 128
- topics: 64
- viewpoints: 256
- components per collection: 5,000
- clipping planes: 6

multi-disk, ZIP64, encrypted entry, unsupported compression, duplicate/path
traversal entry와 symbolic link를 거부합니다. XML은 UTF-8, 최대 2 MiB,
64 depth, 20,000 nodes이며 DOCTYPE을 거부합니다.

import 결과는 topic metadata, comments, related topics, viewpoint camera,
selection, default visibility/exceptions, coloring과 clipping plane을
보존합니다. reference된 viewpoint entry가 없으면 topic은 유지하되 적용은
`NotFoundError`로 실패합니다.

### Apply

camera direction은 `target = position + direction`으로 projection합니다.
selection, visibility exception과 coloring component는 같은 active source의
GlobalId map에서 Render/Pick identity로 변환합니다. missing reference는
diagnostic에 남고 `canApply`가 false입니다.

### Export

v0.1 export는 한 topic과 한 viewpoint의 minimal BCF XML 3.0 archive입니다.
caller가 UUID, timestamp와 author를 제공해야 하며 ZIP timestamp는
1980-01-01로 고정합니다. 같은 입력은 byte-identical archive와 같은
SHA-256 document ID를 만듭니다.

export는 local review artifact 생성일 뿐 source, Spatial Revision,
acceptance 또는 collaboration server를 변경하지 않습니다.

## IDS 1.0

IDS document import는 info, specification identity/IFC version,
applicability와 requirement facet tree, `uri` reference를 bounded하게
보존합니다. 이는 document exploration이며 XSD validation이나 IFC
requirement evaluation이 아닙니다.

IDS result는 별도 Explorer contract입니다.

- status: `pass`, `fail`, `not-evaluated`
- provenance kind: `explorer`, `external`, `spatial`
- `explorer`는 validator profile을 요구합니다.
- `spatial`은 Spatial revision ID를 reference로 요구합니다.
- 결과는 IDS document SHA-256과 BIM source binding을 포함합니다.

failing entity만 selection/highlight 후보가 됩니다. missing GlobalId,
active source에 없는 GlobalId와 non-renderable entity는 서로 다른
diagnostic입니다. Spatial provenance는 reference일 뿐 Explorer에 Spatial
Revision authority를 부여하지 않습니다.

## bSDD

IDS의 classification/property `uri`에서 namespace, dictionary, version,
kind와 code를 파생하되 원본 URI를 그대로 보존합니다.

lookup의 기본은 `allowNetwork: false`이며 `offline-missing`을 반환합니다.
`allowNetwork: true`인 호출만 HTTPS API에 credential 없이 GET을 보냅니다.
response는 512 KiB로 제한하고 exact URI+kind+version key로 최대 128개를
cache합니다. non-bSDD, insecure URI, 404와 unavailable 상태를 구분합니다.
import는 어떤 lookup도 자동 실행하지 않습니다.

## Authority

모든 document, resolution과 session state는 다음 authority를 유지합니다.

```json
{
  "sourceMutation": false,
  "acceptance": false,
  "publish": false,
  "spatialRevision": false
}
```

Spatial validation-to-revision/diagnostic linkage는 Coni Spatial이
소유합니다. Explorer는 BCF/IDS 결과만으로 source baseline, acceptance나
publish 상태를 바꾸지 않습니다.
