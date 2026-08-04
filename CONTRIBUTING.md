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
