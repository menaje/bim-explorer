---
type: qualification
status: active
authority:
  - reference-format-demand-intake
  - evidence-privacy
  - qualification-entry-gate
last_reviewed: 2026-08-08
---

# Reference format evidence intake

## 목적

LAS/LAZ/E57, 3D Tiles, RVT/DGN 중 다음 구현 대상을 maintainer의 추측이
아니라 실제 사용자 과업과 재현 가능한 근거로 선택합니다. 공개 제안은
[`Reference format qualification`](../.github/ISSUE_TEMPLATE/reference-format-qualification.yml)
issue form을 사용합니다.

이 intake는 [`v0.1 contract`](../specs/reference-format-intake-v0.1.md)에 따라
packet을 검증하고 `ready-for-qualification` 또는 `held-missing-evidence`로
분류합니다. 어떤 결과도 format admission이나 production 지원을 만들지
않습니다.

## 제출 원칙

- 후보 포맷 하나만 말하지 말고 실제 과업에서 함께 쓰는 두 종류 이상의
  source를 설명합니다.
- 고객명, 프로젝트명, 파일명과 모델 원본을 공개 issue에 넣지 않습니다.
- 공개 fixture는 credential 없는 HTTPS URL, byte length, SHA-256와 test-use
  조건을 함께 고정합니다. 테스트 전용 파일은 ignored digest cache에만 내려받고
  Git 또는 release에 포함하지 않습니다.
- 비공개 수요·측량 근거는 원문 대신 `private-review:sha256:<digest>`로
  식별합니다.
- parser, engine 또는 SDK는 exact artifact/version, license와 redistribution
  상태를 분리합니다.
- view/query/write/round-trip 요구를 각각 표시합니다. write와 round-trip은
  read-only view admission에 따라오지 않습니다.

## 판정 단계

```text
issue form
  -> privacy-safe intake packet
  -> registry/family별 missing evidence
  -> ready-for-qualification
  -> 별도 codec·engine·SDK 구현과 conformance
  -> compatibility evidence
  -> format admission 검토
```

`maintainer-hypothesis`, private-only fixture, 미확인 implementation redistribution 권리,
좌표 근거 부재 또는 lifecycle harness 부재는 명시적인 gap으로 남습니다.
RVT/DGN은 platform package와 reopen evidence, 3D Tiles는 network policy,
LAS/LAZ/E57은 survey/CRS evidence가 추가로 필요합니다.

## Cache-only sample probe

정식 intake 전에도 공개 샘플을 기술 테스트에 사용할 수 있습니다. 이 경우
`public-test-only`로 표시하고 원본은 `.bim-explorer-cache`에만 보관합니다.
샘플 파일을 배포하지 않으므로 샘플 재배포 권리는 요구하지 않지만, 다운로드와
테스트 사용 조건·원본 URL·bytes·SHA-256는 고정합니다. 제품에 포함할 parser,
engine 또는 SDK의 redistribution 권리는 여전히 별도 Gate입니다.

첫 probe는 `libE57Format-test-data`의 CC0 E57 샘플을 고정 commit에서 내려받아
118,784-byte envelope, 116개 physical page CRC-32C, XML metadata와 7,680개
point record 선언을 검증합니다. 후속 자체 JavaScript decoder는 단일 Cartesian
XYZ/RGB, empty codec vector의 3개 data packet을 모두 해제해 독립 reference와
7,680개 record가 일치했고, 122,880-byte source-neutral point payload와 exact
cleanup을 재현했습니다. 후속 Browser, staged VS Code와 clean-installed VSIX
제품 Gate는 같은 7,680 points·122,880-byte GPU payload·39,561 pixels,
path-free bridge와 source/Worker/CPU/GPU cleanup을 재현했습니다. 다만 CRS,
scan pose, surveyed datum과 point identity/picking·LOD가 없으므로 E57
admission과 `pointCloudCodec`은 계속 held입니다.

후속 profile matrix는 같은 고정 commit의 Test Data License 대상
`bunnyDouble.e57`과 `bunnyInt32.e57`을 재배포하지 않고 cache-only로 사용합니다.
두 파일은 각각 Float64와 scale `1e-6` ScaledInteger XYZ를 쓰며, index packet이
없는 compressed-vector와 optional `cartesianInvalidState`를 포함합니다. 자체
decoder의 30,571개 유효점은 독립 `pye57@0.4.19/libE57Format` 기준과 동일한
record-major Float64 position SHA-256을 만들었습니다. checksum-valid in-memory
derivative로 state 1 direction record가 bounds·range 투영 전에 제거되는 것도
검증했습니다.

추가 spherical profile은 E57 reference implementation이 공개한
5,168,128-byte `pumpASpherical.e57`을 재배포하지 않고 digest cache에서만
사용합니다. 370,530개 scale `1e-6` spherical range/azimuth/elevation record를
Cartesian display 좌표로 변환하고 `sphericalInvalidState`의 215,329개 invalid
record를 제거해 155,201개 점을 만들었습니다. nanometer-quantized position
SHA-256와 RGB SHA-256는 독립 `pye57@0.4.18/libE57Format` 기준과 일치합니다.
intensity는 stream alignment를 위해 해제하지만 point range에서 lossy omitted로
보고합니다. 이 spherical 제품 profile은 identity pose의 단일 scan이며
multiple scan과 extension record는 밖입니다.

추가 multiple-scan 기술 profile은 같은 배포처의 22,146,048-byte
`pumpNoInvalidPoints.e57`을 재배포하지 않고 digest cache에서만 사용합니다.
다섯 scan의 총 1,213,990개 Cartesian/intensity/RGB/row/column record를 bounded
JavaScript decoder로 해제하고, 네 explicit unit-quaternion/translation pose와
한 생략된 identity pose를 적용합니다. pose-applied nanometer position과 RGB
SHA-256는 독립 `pye57@0.4.18/libE57Format` 기준과 일치합니다. 이 pose는 local
registration일 뿐 CRS·surveyed control·datum authority가 아닙니다. 후속 actual
Browser, staged VS Code와 clean-installed VSIX Gate는 동일한 1,213,990-point
pose-applied range와 cleanup을 재현했습니다. extension/identity/picking·LOD는
아직 Gate를 통과하지 않았습니다.

두 번째 probe는 `visgl/loaders.gl`의 paired `ripple.las`/`ripple.laz`를 같은
고정 commit에서 내려받습니다. exact `laz-perf@0.0.6` Apache-2.0 dependency로
LAZ를 해제하고, LAS 1.2 point-format 3의 10,201개 raw point
record SHA-256가 원본 LAS와 일치하는지 확인합니다. Float64 좌표와 RGB
attribute까지 읽습니다. 후속 actual Chrome Worker Gate는 같은 LAZ를 bounded
input/output와 64MiB WASM heap budget 아래 해제하고 checkpoint cooperative
cancellation, 동기 WASM 중 강제 종료, timeout, truncated compressed payload
거부와 fresh-Worker 복구를 검증했습니다. 강제 종료 시 explicit cleanup은
주장하지 않으며 pinned Emscripten glue의 `unsafe-eval`은 loopback qualification
CSP에만 허용합니다. 샘플에는 qualified CRS가 없으므로 LAS/LAZ admission과
`pointCloudCodec`은 계속 held입니다.
후속 point primitive Gate는 exact parity record를 Float64 origin + relative
Float32/RGBA8 range로 투영해 actual Chrome에서 10,201 points·1 draw와 exact
resource cleanup을 통과했습니다. 후속 Browser 제품 Gate는 bounded LAS/LAZ
source를 전용 Worker에서 같은 range로 만들고 실제 local file input에서
10,201 points·동일 range SHA-256·36,934 pixels와 source/Worker/CPU/GPU cleanup을
통과했습니다. 후속 VS Code Gate도 `.las`/`.laz` Custom Editor association,
staged runtime과 빈 profile에 clean-installed VSIX에서 같은 point-range/visible
projection, path-free bridge와 cleanup을 재현했습니다. VSIX의 generated
Emscripten glue는 strict CSP를 위해 dynamic Function construction을 동등한
closure로 치환하고 original `laz-perf.wasm`은 수정하지 않습니다. 좌표는 계속
unqualified이며 point identity/picking·LOD는 제공하지 않습니다.

## 현재 상태

intake 계약과 공개 issue form, cache-only E57 decode/source projection 및
LAS/LAZ pre-admission decode/Worker/point-renderer probe가 준비됐고, LAS/LAZ는 bounded Browser,
staged VS Code와 clean-installed VSIX 제품 source/file-open까지 통과했습니다.
E57도 bounded Browser, staged VS Code와 clean-installed VSIX에서 Cartesian,
spherical 단일-scan 및 다섯-scan pose-applied 제품 source/file-open을
통과했습니다. multiple-scan은 scan identity·structured index와 local pose
적용을 보존하지만 extension과 surveyed coordinate evidence는 아직 없습니다.
따라서
`actualMultiFormatUserDemand`, `surveyedCoordinateDatumEvidence`와 여섯 후보
format Gate는 계속 held입니다. 고객 모델이나 검증되지 않은 SDK를 저장소에
추가해 이 상태를 우회하지 않습니다.
