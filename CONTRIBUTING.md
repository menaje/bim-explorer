# Contributing

Thank you for improving BIM Explorer. Start with an issue for changes that
alter a public contract, dependency, file-format claim, product boundary, or
release artifact.

## Development

Node.js 24 and npm 11 are required.

일상 개발은 `dev`에서 진행합니다. 공개 package prerelease는 `dev`를
`prerelease`로 승격한 뒤 그 브랜치의 exact HEAD에서 발급하고, 정식 release는
`prerelease`를 `main`으로 승격한 뒤 발급합니다. 자세한 Gate는
[`Branch and release workflow`](docs/branch-release-workflow.md)를 따릅니다.

```bash
npm ci
npm run check
```

Do not commit customer/private BIM, credentials, local paths, generated caches,
or proprietary fixtures. Use the deterministic synthetic generators or the
on-demand public fixture described under `fixtures/`.

Pull requests should:

- keep exact dependency versions and registry integrity;
- add a fail-closed test for new input or capability boundaries;
- update compatibility evidence only from a documented qualification command;
- preserve the read-only Community and Coni Spatial authority boundary;
- state whether a change affects source format, cache, protocol, or migration.

`prerelease` 대상 promotion PR의 source는 `dev`, `main` 대상 promotion PR의
source는 `prerelease`여야 합니다. 별도 승인 전에는 새 VSIX를 Marketplace나
Open VSX에 게시하지 않습니다.

Unless explicitly stated otherwise, implementation contributions are submitted
under MPL-2.0. Contributions under `specs/` are submitted under Apache-2.0.
Third-party material must retain its original license and attribution.

Security vulnerabilities and sensitive model findings must follow
[`SECURITY.md`](SECURITY.md), not a public issue.

새 reference format 제안은
[`Reference format qualification`](.github/ISSUE_TEMPLATE/reference-format-qualification.yml)
issue form을 사용합니다. 고객 모델이나 private download URL을 올리지 말고,
비공개 사용자·측량 evidence는 원문 대신 SHA-256 reference만 기록합니다.
완전한 intake도 별도 codec/SDK qualification 전에는 format admission이나
write/round-trip 지원이 아닙니다.
