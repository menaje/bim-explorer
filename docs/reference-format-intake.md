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
- 공개 fixture는 credential 없는 HTTPS URL, byte length, SHA-256와 license를
  함께 고정합니다.
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

`maintainer-hypothesis`, private-only fixture, 미확인 redistribution 권리,
좌표 근거 부재 또는 lifecycle harness 부재는 명시적인 gap으로 남습니다.
RVT/DGN은 platform package와 reopen evidence, 3D Tiles는 network policy,
LAS/LAZ/E57은 survey/CRS evidence가 추가로 필요합니다.

## 현재 상태

intake 계약과 공개 issue form은 준비됐지만 실제 외부 packet은 아직 없습니다.
따라서 `actualMultiFormatUserDemand`, `surveyedCoordinateDatumEvidence`와 여섯
후보 format Gate는 계속 held입니다. 고객 모델이나 검증되지 않은 SDK를
저장소에 추가해 이 상태를 우회하지 않습니다.
