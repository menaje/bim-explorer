# Contributing

Thank you for improving BIM Explorer. Start with an issue for changes that
alter a public contract, dependency, file-format claim, product boundary, or
release artifact.

## Development

Node.js 24 and npm 11 are required.

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
