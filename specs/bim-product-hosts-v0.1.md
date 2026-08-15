---
type: specification
status: draft
authority:
  - browser-product-host
  - vscode-readonly-custom-editor
  - local-source-worker-lifecycle
  - path-free-host-bridge
last_reviewed: 2026-08-11
---

# BIM product hosts v0.1

## 상태와 범위

Browser shell과 VS Code Custom Editor가 같은 source Worker와 3D renderer를
실행하는 내부 read-only draft입니다. IFC는 `BimModelSource`와 semantic
explorer로, bounded glTF/GLB는 source-native reference mesh explorer로
분기합니다. bounded E57/LAS/LAZ는 source-neutral point range와 `POINTS`
renderer로 분기합니다. public Viewer Core, Spatial authority, marketplace release와
write operation을 정의하지 않습니다.

## 공통 lifecycle

```text
idle
-> source admission
-> isolated Worker conversion
-> immutable snapshot
-> renderer + role-specific explorer mount
-> ready
-> optional point LOD refine + prior range release
-> source switch | cancel | editor close
-> session + Worker + GPU dispose
```

source switch는 generation을 증가시켜 이전 session을 stale로 만들고 이전
Worker를 종료합니다. open timeout은 30초, operation timeout은 10초이며
source는 최대 64 MiB이고 LAS/LAZ는 별도 8 MiB·500,000-point cap,
multiple-scan E57은 32 MiB·2,000,000-point cap을 적용합니다. 단일 BIM range
read는 최대 1 MiB입니다. tree/search
aggregate와 DOM projection도 생성 시 고정한 상한을 넘지 않습니다.
`.gltf` local resource bundle은 source와 최대 16개 same-folder ASCII leaf-name
`.bin`/`.png`/`.jpg`/`.jpeg`를 합산 64MiB 안에서 받습니다. 외부 PNG/JPEG,
exact glTF PNG/JPEG data URI 또는 GLB PNG/JPEG bufferView texture는 저장 방식
전체에 encoded 8MiB, decoded RGBA 16MiB, 축당 2,048px와 256:1 ratio를 추가
적용합니다. JPEG는 bounded baseline sequential profile만 허용합니다.

## Browser Host

Browser는 명시적인 local `File`/`Blob`만 읽습니다. 읽기 전후 byte length를
확인하고 filename, path와 credential을 Worker/report에 넣지 않습니다.
loopback server는 allowlist route, same-origin CSP와 no-store response만
제공합니다. generated qualification fixture는 명시적인
`--fixture synthetic`에서만 노출됩니다.

## VS Code Host

backward-compatible view type `bimExplorer.ifcEditor`는 `*.ifc`, `*.gltf`,
`*.glb`, `*.e57`, `*.las`, `*.laz`에 연결된 read-only Custom Editor입니다.
extension host만 source
`file:` URI를 보유합니다.

- regular non-symlink file만 exact URI로 읽습니다.
- 읽기 전후 type, size와 mtime을 검사합니다.
- webview에는 `ArrayBuffer`, normalized format, generation, bounded
  setting만 전달합니다.
- webview report는 fingerprint와 수치 field allowlist로 다시 투영합니다.
- arbitrary URI/path를 webview message로 받지 않습니다.
- file watcher는 동일 URI 변경에만 새 generation을 보냅니다.

VS Code webview 보안 모델에서는 local resource URL을 Worker에 직접 사용할
수 없으므로, package에 고정한 Worker bundle과 web-ifc module/WASM을
webview가 읽은 뒤 bounded `blob:` URL로 격리 Worker에 제공합니다. point
source는 별도 classic Worker bundle, strict-CSP `laz-perf` glue와 exact WASM을
같은 방식으로 주입합니다. CSP는 extension resource, 해당 blob과 WASM
compile만 허용하고 `unsafe-eval`은 허용하지 않습니다. source bytes와
resource blob은 서로 다른 capability이며 source path는 blob에 포함되지
않습니다.

## Host message

`bim-explorer-product-host-message/0.1`은 다음 private message만 사용합니다.

- webview → host: `ready`, `retry`, path-free `report`
- host → webview: `source-bytes`, `source-error`, `cancel`,
  `show-diagnostics`, `refine-point-lod`, `dispose`

이 message는 public Viewer/Agent protocol이 아니며 다른 제품이 직접
호출하는 integration surface로 안정화하지 않습니다.

## Packaging

`npm run package:vscode`는 공용 runtime, exact web-ifc 0.0.77 module/WASM,
exact `laz-perf@0.0.6` WASM과 strict-CSP glue, third-party notice와 Worker
bundle을 독립 staging한 뒤 VSIX를 생성합니다.
package manifest는 Coni Spatial이나 sibling checkout dependency를
포함하지 않습니다. `npm run qualify:product:vscode-install`은 빈 user data와
extension directory에 VSIX를 설치한 뒤 설치본 Custom Editor로 generated
IFC, on-demand 공개 IFC와 Khronos Box GLB를 엽니다. 별도 LAS/LAZ 제품 Gate는
cache-only pair를 staged와 clean-installed runtime에서 엽니다. association과 runtime
digest뿐 아니라 format별 source/render projection, 실제 VS Code Chromium
WebGL2, path-free bridge와 editor close cleanup을 확인합니다. 공개 IFC와
GLB 및 E57/LAS/LAZ sample은 package에 포함하지 않습니다. 별도
`qualify:point-cloud:lod` Gate는 Browser, staged Custom Editor와 clean-installed
VSIX에서 파생 hierarchy/LOD 전환과 exact cleanup을 비교합니다.

## 현재 보류

- stable/production Viewer Core와 Marketplace conformance
- Linux/Windows physical GPU와 cross-platform OS-level GPU/memory qualification
- arbitrary glTF URI, data URI buffer 기반 glTF image bufferView, progressive/arithmetic/lossless
  JPEG·투명/다중 material texture, Draco와 승인되지 않은 required extension;
  bounded same-folder `.bin`/`.png`/`.jpg`/`.jpeg`, 외부/data-URI/GLB-bufferView와
  local `.bin`-backed glTF bufferView OPAQUE PNG/baseline JPEG `baseColorTexture`,
  `KHR_mesh_quantization`, `EXT_meshopt_compression` `FILTER_NONE` 제품 Gate는
  통과
- E57/LAS/LAZ CRS/surveyed datum, source-native hierarchy·point semantics와
  format admission; 파생 `point:n` pick과 제품 로컬 octree/chunk LOD는 exact
  revision/root range에만 유효
- license, signing과 marketplace release

공개 IFC2X3 product-scale open은 통과했지만 engine/profile admission으로
승격하지 않습니다. glTF/GLB 제품 open도 bounded local read-only reference
profile만 통과했으며 BIM semantic authority를 부여하지 않습니다.
