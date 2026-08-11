---
type: release-policy
status: accepted
authority:
  - development-branch
  - prerelease-promotion
  - stable-release-promotion
last_reviewed: 2026-08-11
---

# Branch and release workflow

BIM Explorer는 개발, 공개 prerelease와 정식 release의 기준선을 다음 세
브랜치로 분리합니다.

```text
dev -> prerelease -> main
```

## Branch authority

- `dev`는 일상 개발과 통합 기준선입니다. 기능·수정·release candidate 준비는
  여기에서 시작하고 두 OS의 기본 CI를 통과해야 합니다.
- `prerelease`는 공개 전 검증 기준선입니다. `dev`에서만 승격하며 experimental
  package prerelease tag와 immutable GitHub prerelease는 이 브랜치의 exact
  HEAD에서만 발급합니다.
- `main`은 정식 지원 기준선입니다. `prerelease`에서만 승격하며 Community
  stable tag는 이 브랜치의 exact HEAD에서만 발급합니다.

`dev`를 GitHub 기본 브랜치로 사용해 새 개발 PR의 기본 대상도 개발 기준선과
일치시킵니다. `main`은 정식 지원 기준선 역할만 유지합니다. 세 브랜치에서
force-push로 공개 이력을 바꾸지 않습니다. 긴 기능 격리가 필요하면 짧은
feature branch를 `dev`로 합치되 release branch를 우회하지 않습니다.

## Promotion Gate

```text
feature work
-> dev check
-> dev full qualification when required
-> dev to prerelease PR
-> package/release candidate evidence
-> prerelease tag and immutable prerelease
-> downstream exact-artifact admission
-> prerelease to main PR
-> stable tag
```

`prerelease` 대상 PR은 `dev`, `main` 대상 PR은 `prerelease`에서만 올 수
있습니다. tag workflow는 tag commit과 해당 release branch HEAD가 다르면
공개 전에 실패합니다.

## VS Code publication hold

VS Code Webview와 clean-installed VSIX는 계속 제품 conformance 입력으로
사용할 수 있습니다. 그러나 별도 승인 전에는 새 VSIX를 Visual Studio
Marketplace, Open VSX 또는 federated BIM Surface package prerelease asset으로
게시하지 않습니다.

Community stable release workflow도 repository variable
`VSCODE_PUBLICATION_AUTHORIZED=true`가 명시적으로 설정되지 않으면 attestation과
draft 생성 전에 실패합니다. 이 variable은 사용자가 새 VSIX publication을
승인한 뒤에만 설정합니다. 기존 immutable v0.1.0 release는 변경하지 않습니다.

Federated BIM Surface v0.2 prerelease는 host-neutral tgz, SPDX SBOM,
checksum, source offer, release manifest와 provenance만 공개합니다. 이 package
prerelease는 standalone BIM Explorer extension release나 marketplace 지원을
주장하지 않습니다.

공개된 v0.2 runtime은 tag와 downstream exact-pin digest로 동결합니다. 이후
`dev`의 공용 source가 달라져도 v0.2 generated runtime을 다시 쓰지 않으며,
federated 기능 변경은 새 semver와 동일한 승격·consumer Gate로 진행합니다.

## Emergency fixes

공개 기준선의 긴급 수정도 먼저 `dev`에 반영하고 같은 승격 순서를 거칩니다.
이미 공개된 immutable tag나 asset을 교체하지 않으며 새 patch version으로
발급합니다.
