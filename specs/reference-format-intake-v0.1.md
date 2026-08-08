# Reference Format Intake Contract v0.1

Status: draft

License: [Apache License 2.0](LICENSE)

## Scope

이 계약은 아직 admission되지 않은 reference format의 실제 사용자 과업,
공개 fixture, implementation 권리, coordinate profile과 qualification 준비
상태를 path-free packet으로 접수합니다.

intake가 완전해도 format을 admission하지 않습니다. 완전한 packet은 별도
codec, engine 또는 SDK qualification을 시작할 수 있다는 뜻뿐입니다.

## Contract identifiers

```text
bim-explorer-reference-format-intake/0.1
bim-explorer-reference-format-triage/0.1
```

## Candidate scope

현재 registry에서 held인 다음 후보만 intake할 수 있습니다.

- `las`, `laz`, `e57`
- `3d-tiles`
- `rvt`, `dgn`

이미 admission된 `ifc`, `gltf`, `glb`와 registry에 없는 format은 이
계약으로 다시 열지 않습니다.

## Intake packet

packet은 다음 top-level field를 정확히 가집니다.

| Field | Required content |
| --- | --- |
| `schema` | exact intake identifier |
| `candidateFormat` | held registry format |
| `demand` | actual task 여부, opaque evidence reference, path-free summary, source formats, requested capabilities |
| `fixture` | public/private/none 상태, public HTTPS URL, bytes, SHA-256, license, customer-data 부재 |
| `implementation` | codec/engine/SDK kind, exact artifact reference, license, redistribution state |
| `coordinates` | mode, CRS, opaque evidence reference, datum transformation 필요 여부 |
| `qualification` | budget, lifecycle, network, platform package와 reopen evidence |
| `privacy` | model, credential와 absolute path가 공개 issue에 없다는 세 assertion |

optional value는 field를 생략하지 않고 `null`로 표현합니다. 알 수 없는
implementation, redistribution과 coordinate 상태는 각각 `unknown`입니다.

## Evidence references

공개 issue와 비공개 review의 원문을 packet에 복사하지 않습니다. 다음 opaque
reference만 허용합니다.

```text
public-issue:<positive integer>
private-review:sha256:<64 lowercase hex>
public-evidence:sha256:<64 lowercase hex>
```

공개 fixture URL은 credential 없는 HTTPS여야 하며 query와 fragment를
허용하지 않습니다. private fixture는 공개 URL을 가질 수 없습니다. public
issue에는 고객 모델, credential, 토큰 또는 absolute path를 넣지 않습니다.

## Triage

공통 `ready-for-qualification` 조건은 다음과 같습니다.

- `actual-user-task`와 evidence reference
- 후보를 포함한 두 종류 이상의 registered source가 있는 workflow
- `view` capability가 필요한 실제 과업
- URL, bytes, SHA-256과 license가 고정된 public redistributable fixture
- exact implementation artifact/license와 confirmed redistribution
- bounded budget evidence
- cancellation과 cleanup harness

format family별로 다음 조건을 추가합니다.

| Family | Additional evidence |
| --- | --- |
| LAS/LAZ/E57 | projected CRS 또는 surveyed control point, CRS, datum 필요 여부 |
| 3D Tiles | geospatial tileset coordinate profile, network engine과 network policy |
| RVT/DGN | native SDK coordinate profile, platform package와 reopen qualification |

누락 항목은 deterministic `missingEvidence` code로 반환합니다. 모든 항목이
있어도 receipt의 `formatAdmission`, semantic authority, native write,
round-trip과 Spatial authority는 `false`입니다.

## Authority boundary

intake와 triage receipt는 사용자 수요를 조작하거나 기술 evidence의 진실성을
보증하지 않습니다. maintainer는 공개 출처 또는 private digest review를
별도로 확인해야 합니다. production admission은 별도 compatibility manifest,
재현 가능한 evidence와 제품 surface qualification이 있어야 합니다.
