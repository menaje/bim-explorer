---
type: release-policy
status: accepted
authority:
  - bim-surface-package-release
  - bim-surface-supply-chain
last_reviewed: 2026-08-09
---

# BIM Surface package release

`@bim-explorer/bim-surface`는 BIM Explorer 전체 제품 릴리스와 독립된 공개
재사용 경계입니다. 공식 package tag는 `bim-surface-v<semver>`, GitHub Release
이름은 `BIM Surface v<semver>`를 사용합니다. Community의 `v<semver>` tag,
release asset과 latest 상태는 변경하지 않습니다.

## Publication boundary

- 저장소 manifest는 `private: true`를 유지해 우발적인 registry publish를
  차단합니다.
- 공개 배포 채널은 exact-version GitHub Release tarball입니다.
- release는 experimental prerelease이며 npm registry package나 stable support를
  주장하지 않습니다.
- tarball은 source session, bounded mesh renderer host, semantic explorer와
  authority-free optional Spatial provider contract만 포함합니다.
- Coni Spatial private package, Workspace capability, mutation, accept, publish,
  export authority와 experimental point-reference runtime은 포함하지 않습니다.

## Reproducible build

Node version은 [`.node-version`](../.node-version), dependency graph는
[`package-lock.json`](../package-lock.json)에 고정합니다. clean checkout에서 다음
명령으로 package qualification과 release bundle을 만듭니다.

```bash
npm ci
npm run check
npm run release:bim-surface
```

`release:bim-surface`는 package를 독립 stage에서 다시 만들고 기존 qualification
digest와 일치하는지 확인합니다. Linux와 macOS tag job이 만든 전체 bundle은
[`compare-bim-surface-release.mjs`](../scripts/compare-bim-surface-release.mjs)가
파일 inventory, `SHA256SUMS`와 모든 byte를 비교합니다.

## Publication and provenance

[`bim-surface-release.yml`](../.github/workflows/bim-surface-release.yml)은 다음
순서로만 공개합니다.

1. exact package tag와 version을 확인합니다.
2. 두 OS에서 full conformance, audit와 deterministic bundle build를 수행합니다.
3. 두 bundle의 byte identity를 확인합니다.
4. executable tarball, SPDX와 release manifest에 GitHub build attestation을
   생성합니다.
5. 모든 asset을 draft에 올린 뒤 prerelease로 공개합니다.
6. GitHub immutable release attestation과 tarball asset을 다시 검증합니다.

저장소의 immutable release 설정은 공개 뒤 tag와 asset 변경을 차단합니다.
실패한 workflow를 재실행할 때 이미 공개된 동일 release가 있으면 asset을
덮어쓰지 않고, 내려받은 전체 bundle의 byte identity만 확인합니다.

## Consumer verification

```bash
gh release verify bim-surface-v0.1.0 \
  --repo menaje/bim-explorer
gh release download bim-surface-v0.1.0 \
  --repo menaje/bim-explorer \
  --pattern 'bim-explorer-bim-surface-0.1.0.tgz'
gh release verify-asset bim-surface-v0.1.0 \
  bim-explorer-bim-surface-0.1.0.tgz \
  --repo menaje/bim-explorer
gh attestation verify \
  --repo menaje/bim-explorer \
  bim-explorer-bim-surface-0.1.0.tgz
```

Spatial 같은 실제 consumer는 URL과 SHA-256을 exact-pin하고 자신의 composition
conformance를 별도로 통과해야 합니다. 해당 consumer evidence가 없으면 Spatial
호환성과 production support Gate는 계속 held입니다.

## v0.1.0 publication evidence

첫 package release의 exact tag, 9개 asset digest, 익명 download, hosted
macOS/Linux 337/337 conformance, cross-platform byte identity와 두 attestation
검증 결과는
[release evidence](../compatibility/evidence/bim-surface-release-v0.1.0-2026-08-09.json)가
소유합니다.
