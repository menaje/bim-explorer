# web-ifc platform qualification stage

이 package template은 exact `web-ifc` Node/WASM adapter를 macOS와 Linux의
깨끗한 임시 환경에서 재설치하고 실행하기 위한 qualification 전용
stage입니다.

`npm run qualify:ifc:platform-package`가 다음 파일만 stage에 조립합니다.

- IFC inspect adapter
- IFC engine report contract
- `web-ifc@0.0.77` Node API와 Node single-thread WASM
- package metadata, third-party notice와 MPL-2.0 license text

생성한 tgz는 public release package가 아닙니다. source는 MPL-2.0이고 npm
오게시는 `private`로 차단합니다. 공식 Community 배포는 별도 VSIX/source
bundle, SBOM, signing/provenance와 redistribution Gate를 통과해야 합니다.
