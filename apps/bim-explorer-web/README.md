# BIM Explorer Web

local IFC, bounded glTF/GLB 또는 bounded E57/LAS/LAZ를 Browser에서 선택해 Worker-isolated
source snapshot과 WebGL2 renderer로 여는 standalone read-only product
shell입니다. IFC는 host-neutral `bim-surface/0.1`이 `BimModelSource`, bounded
3D host와 semantic explorer의 수명주기를 합성하고, glTF/GLB는
source-native reference mesh explorer로, E57/LAS/LAZ는 source-neutral point
range와 `POINTS` renderer로 분기합니다.

- IFC/glTF/GLB는 64 MiB, E57은 32 MiB, LAS/LAZ는 8 MiB admission limit 뒤
  Worker로 전달합니다.
- 파일명, local path, credential을 Worker/report에 넣지 않습니다.
- source switch와 cancel은 prior Worker를 종료해 stale result를 차단합니다.
- tree, property, search와 3D pick은 같은 fingerprint/revision을 사용합니다.
- glTF/GLB는 `nativeId`만 사용하고 IFC GlobalId나 BIM semantic authority를
  합성하지 않습니다.
- LAS/LAZ와 single-scan E57은 기본 8 MiB·500,000-point 한도를 유지하고,
  multiple-scan E57만 명시적 32 MiB·2,000,000-point 한도와 전용 one-shot
  Worker를 사용합니다. source/range CPU buffer와 GPU allocation을 닫을 때
  회수합니다. point pick의 `point:n`은 exact source revision과 root range
  digest의 파생 순서 identity입니다. 대형 range는 파생 octree leaf chunk와
  coarse-to-full LOD로 열고, 각 전환에서 이전 GPU range/identity map을 회수한
  뒤 full detail에서 Worker hierarchy를 종료합니다. 이는 CRS, surveyed datum,
  source-native hierarchy·semantics 또는 BIM semantic authority를 제공하지
  않습니다.
- timing과 source/geometry/metadata/range budget을 diagnostics로 표시합니다.
- account, telemetry, 외부 upload를 요구하지 않습니다.

`npm run start:web`은 loopback-only local server를 실행합니다. generated
qualification fixture는 `--fixture synthetic`을 명시한 경우에만 노출합니다.
`npm run qualify:product:web:public`은 고정 digest의 공개 IFC를 실제 local
file input으로 선택하며 server가 모델 bytes를 제공하지 않습니다. 공개
fixture와 실제 고객 IFC는 package에 포함하거나 Git에 추적하지 않습니다.
`npm run qualify:gltf:product`는 고정 Khronos Box GLB를 실제 local file
input으로 선택하고 staged VS Code와 clean-installed VSIX까지 같은 bounded
reference projection을 확인합니다. 공개 GLB도 package나 Git에 포함하지
않습니다. `npm run qualify:gltf:product-scale:web`은 on-demand cache의
42.98MB `A Beautiful Game` GLB를 실제 Browser local file input으로 열어
bounded Worker/renderer, 검색·3D pick과 close cleanup을 확인합니다.
`npm run qualify:gltf:product-scale:vscode`와
`npm run qualify:gltf:product-scale:vscode-install`은 같은 파일을 staged
Custom Editor와 빈 profile에 설치한 VSIX에서 열어 동일한 bounded reference
projection과 editor cleanup을 확인합니다.
`npm run qualify:las-laz:product:web`은 cache-only 공개 LAS/LAZ pair를 각각
실제 Browser local file input으로 열어 exact point-range/visual parity,
`laz-perf@0.0.6` Worker isolation과 source/Worker/CPU/GPU cleanup을 확인합니다.
`npm run qualify:las-laz:product:vscode`는 같은 projection을 staged VS Code와
clean-installed VSIX에서 다시 확인합니다. 샘플은 Git, package 또는 release에
포함하지 않습니다.
`npm run qualify:e57:product:web`은 cache-only 공개 E57을 실제 Browser local
file input으로 열어 7,680-point range, visible projection과
source/Worker/CPU/GPU cleanup을 확인합니다. `npm run
qualify:e57:product:vscode`는 같은 projection을 staged VS Code와
clean-installed VSIX에서 재현합니다. E57 샘플도 재배포하지 않습니다.
`npm run qualify:e57:spherical:product:web`과
`npm run qualify:e57:spherical:product:vscode`는 155,201개 유효점을 만드는
spherical RAE/intensity/RGB profile을 같은 세 제품 경로에서 검증합니다.
intensity는 display range에서 lossy omitted이며 원본 sample은 cache-only입니다.
`npm run qualify:e57:multiple-scan:product:web`과
`npm run qualify:e57:multiple-scan:product:vscode`는 다섯 scan·1,213,990-point
cache-only E57을 pose-applied range로 열어 Browser, staged VS Code와
clean-installed VSIX의 동일 투영 및 cleanup을 검증합니다. pose는 local
registration으로만 취급합니다.
`npm run qualify:point-cloud:picking:web`은 cache-only LAS, LAZ와 five-scan
E57을 actual Chrome에서 열고 32-bit point selection, 선택 좌표 GPU readback과
transient target/source/Worker/CPU/GPU cleanup을 검증합니다. 샘플은 재배포하거나
제품에 포함하지 않습니다.
`npm run qualify:point-cloud:lod`는 같은 five-scan E57을 Browser, staged VS Code와
clean-installed VSIX에서 51개 chunk·3개 LOD로 전환하고 root-range point identity,
단계별 GPU/identity-map release와 최종 hierarchy cleanup을 검증합니다.
