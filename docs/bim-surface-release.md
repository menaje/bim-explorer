---
type: release-policy
status: accepted
authority:
  - bim-surface-package-release
  - bim-surface-supply-chain
last_reviewed: 2026-08-11
---

# BIM Surface package release

`@bim-explorer/bim-surface`는 BIM Explorer 전체 제품 릴리스와 독립된 공개
재사용 경계입니다. 공식 package tag는 `bim-surface-v<semver>`, GitHub Release
이름은 `BIM Surface v<semver>`를 사용합니다. Community의 `v<semver>` tag,
release asset과 latest 상태는 변경하지 않습니다.

브랜치 승격은 [`dev` → `prerelease` → `main`](branch-release-workflow.md)을
따릅니다. experimental package tag는 `prerelease`의 exact HEAD에서만
발급하며 이 release workflow는 VSIX나 Marketplace/Open VSX publication을
포함하지 않습니다.

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

## Federated v0.2.0 release-ready Gate

`@bim-explorer/federated-bim-surface@0.2.0`은
`bim-surface-v0.2.0` experimental prerelease를 준비합니다. 기존 v0.1 package와
tag는 변경하지 않습니다.

```bash
npm run qualify:bim-surface:v0.2:package
npm run release:bim-surface:v0.2
```

이 package는 actual Spatial consumer가 이전 private candidate의 runtime과
contract를 exact-pin한 증거와 release-ready 97,623-byte tgz SHA-256
`3bdb747d…c63cb`를 다시 검증한 증거를 가집니다. 이에 따라 package-only
prerelease의 `publicationAuthorized`는 true입니다. 공개 범위는 tgz, SPDX,
checksum, source offer, manifest와 provenance이며 새 VSIX는 포함하지 않습니다.
발급된 immutable public asset에 대한 Spatial Phase B exact-pin도 anonymous
download와 offline clean install을 통해 통과했습니다. 이는 Spatial VSIX BIM
runtime, Spatial 제품의 실제 BIM UI/GPU 또는 production support를 승인하지
않습니다.

`bim-surface-v0.2.0`은 `prerelease` exact HEAD의 annotated tag로 공개됐습니다.
macOS/Linux 각각 380개 conformance, zero runtime vulnerability, 9개 asset의
cross-platform byte identity와 release/build attestation을 통과했습니다. tgz는
97,623 bytes, SHA-256 `3bdb747d…c63cb`이며 Community `v0.1.0`의 Latest 상태는
유지합니다.

Spatial commit `55d96e8…975e`의 public-artifact consumer evidence는 같은 tgz,
runtime, tag commit과 Explorer release evidence를 고정하고 GLB+IFC+Spatial
overlay, 양방향 selection, anchor exact→stale/no-remap과 cleanup을 재현합니다.
macOS arm64 local 362/362와 conformance 66/66은 통과했지만 hosted CI 두 attempt는
runner 배정 전에 종료됐으므로 cross-platform consumer claim은 없습니다.

## Post-release physical GPU qualification

후속 `dev` 기준선은 package/runtime bytes를 바꾸지 않고 generated
GLB–IFC–GLB Surface를 software fallback이 비활성화된 Apple M2 Metal에서
검증했습니다. actual Chrome 151 Browser 2회와 VS Code 1.132 staged 확장 및
clean-installed local VSIX가 동일한 3-source composition, 8,286 pixels,
1,608-byte upload, surface hit/anchor 3개와 terminal cleanup을 재현했습니다.

이 결과는 기존 `bim-surface-v0.2.0` asset이나 새 VSIX를 게시하지 않습니다.
Linux/Windows physical GPU, 실제 고객 모델, OS-level peak GPU memory, Spatial
VSIX BIM runtime과 production support는 계속 별도 Gate입니다.

## Immutable v0.2 runtime after release

`packages/federated-bim-surface/runtime/index.mjs`는 공개 tag와 Spatial Phase B가
고정한 461,431 bytes, SHA-256 `22e243fa…1847`를 유지합니다. `--check`는 현재
개발 source에서 runtime을 다시 만들지 않고 이 exact release digest를 검사합니다.
일반 v0.2 build는 현재 source가 release tag와 같은 runtime을 만들 때만 쓸 수
있으며, post-release source가 달라졌다면 기존 파일을 덮어쓰지 않고 새 package
version을 시작하라는 오류로 종료합니다.

따라서 single-source `.gltf + .bin`이나 `KHR_mesh_quantization` 같은 후속 기능은
v0.2 package에 자동 backport하지 않습니다. federated runtime/API에 포함하려면 새 semver, `dev →
prerelease` 승격, exact package evidence와 Spatial consumer admission을 다시
통과해야 합니다.
