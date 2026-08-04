# Security

## Supported versions

The latest Community release receives best-effort security fixes. Preview
contracts and older releases are unsupported after a replacement release is
published. Community support has no SLA or warranty.

## Reporting

공개 issue에 credential, 고객 BIM, 실제 local path, proprietary model
metadata 또는 재현 가능한 민감 payload를 올리지 마십시오. 저장소
maintainer에게 GitHub의
[private vulnerability reporting](https://github.com/menaje/bim-explorer/security/advisories/new)으로
보고하고 공개 가능한 synthetic reproduction을 별도로 준비합니다.

보고에는 영향받는 exact release/commit, 관찰한 capability, 민감하지 않은
진단, 완화 가능 여부를 포함하십시오. 고객 모델이나 credential 자체는
첨부하지 마십시오. 수신 확인, 수정 시점과 공개 일정은 영향도와 재현
가능성을 확인한 뒤 비공개 advisory에서 조율합니다.

## Trust boundary

- IFC/native/WASM adapter output은 신뢰하지 않는 입력으로 검증합니다.
- Viewer와 Host event는 Spatial 권한을 발급하지 않습니다.
- source fingerprint, range budget, cancellation과 disposal scope가 없는
  model data는 public Viewer boundary로 전달하지 않습니다.
- 고객 IFC/RVT/NWD, generated cache, Context payload와 credential은 Git에
  추적하지 않습니다.
- production write, external URL fetch와 cloud upload는 명시적으로
  qualification되기 전 지원하지 않습니다.

## Release verification

공식 배포 파일은 GitHub Release asset과 `SHA256SUMS`, SPDX SBOM, artifact
attestation이 일치해야 합니다. 검증 방법과 source 재현 명령은
[`docs/community-release.md`](docs/community-release.md)를 따릅니다.
