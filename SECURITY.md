# Security

## Reporting

공개 issue에 credential, 고객 BIM, 실제 local path, proprietary model
metadata 또는 재현 가능한 민감 payload를 올리지 마십시오. 저장소
maintainer에게 비공개 채널로 보고하고 공개 가능한 synthetic reproduction을
별도로 준비합니다.

## Trust boundary

- IFC/native/WASM adapter output은 신뢰하지 않는 입력으로 검증합니다.
- Viewer와 Host event는 Spatial 권한을 발급하지 않습니다.
- source fingerprint, range budget, cancellation과 disposal scope가 없는
  model data는 public Viewer boundary로 전달하지 않습니다.
- 고객 IFC/RVT/NWD, generated cache, Context payload와 credential은 Git에
  추적하지 않습니다.
- production write, external URL fetch와 cloud upload는 명시적으로
  qualification되기 전 지원하지 않습니다.
