---
type: specification
status: draft
authority:
  - browser-product-host
  - vscode-readonly-custom-editor
  - local-source-worker-lifecycle
  - path-free-host-bridge
last_reviewed: 2026-08-04
---

# BIM product hosts v0.1

## 상태와 범위

Browser shell과 VS Code `.ifc` Custom Editor가 같은 source Worker,
`BimModelSource`, 3D renderer와 semantic explorer를 실행하는 내부
read-only draft입니다. public Viewer Core, Spatial authority, marketplace
release와 write operation을 정의하지 않습니다.

## 공통 lifecycle

```text
idle
-> source admission
-> isolated Worker conversion
-> immutable snapshot
-> renderer + semantic explorer mount
-> ready
-> source switch | cancel | editor close
-> session + Worker + GPU dispose
```

source switch는 generation을 증가시켜 이전 session을 stale로 만들고 이전
Worker를 종료합니다. open timeout은 30초, operation timeout은 10초이며
source는 최대 64 MiB, 단일 range read는 최대 1 MiB입니다. tree/search
aggregate와 DOM projection도 생성 시 고정한 상한을 넘지 않습니다.

## Browser Host

Browser는 명시적인 local `File`/`Blob`만 읽습니다. 읽기 전후 byte length를
확인하고 filename, path와 credential을 Worker/report에 넣지 않습니다.
loopback server는 allowlist route, same-origin CSP와 no-store response만
제공합니다. generated qualification fixture는 명시적인
`--fixture synthetic`에서만 노출됩니다.

## VS Code Host

`bimExplorer.ifcEditor`는 `*.ifc`에 연결된 read-only Custom Editor입니다.
extension host만 source `file:` URI를 보유합니다.

- regular non-symlink file만 exact URI로 읽습니다.
- 읽기 전후 type, size와 mtime을 검사합니다.
- webview에는 `ArrayBuffer`, generation, bounded setting만 전달합니다.
- webview report는 fingerprint와 수치 field allowlist로 다시 투영합니다.
- arbitrary URI/path를 webview message로 받지 않습니다.
- file watcher는 동일 URI 변경에만 새 generation을 보냅니다.

VS Code webview 보안 모델에서는 local resource URL을 Worker에 직접 사용할
수 없으므로, package에 고정한 Worker bundle과 web-ifc module/WASM을
webview가 읽은 뒤 bounded `blob:` URL로 격리 Worker에 제공합니다. CSP는
extension resource와 해당 blob만 허용합니다. source bytes와 resource
blob은 서로 다른 capability이며 source path는 blob에 포함되지 않습니다.

## Host message

`bim-explorer-product-host-message/0.1`은 다음 private message만 사용합니다.

- webview → host: `ready`, `retry`, path-free `report`
- host → webview: `source-bytes`, `source-error`, `cancel`,
  `show-diagnostics`, `dispose`

이 message는 public Viewer/Agent protocol이 아니며 다른 제품이 직접
호출하는 integration surface로 안정화하지 않습니다.

## Packaging

`npm run package:vscode`는 공용 runtime, exact web-ifc 0.0.77 module/WASM,
third-party notice와 Worker bundle을 독립 staging한 뒤 VSIX를 생성합니다.
package manifest는 Coni Spatial이나 sibling checkout dependency를
포함하지 않습니다. `npm run qualify:product:vscode-install`은 빈 user data와
extension directory에 VSIX를 설치해 association과 runtime 파일 digest를
확인합니다.

## 현재 보류

- public Viewer Core artifact와 cross-repository conformance
- public representative model의 end-to-end product scale
- physical GPU와 cross-platform GPU/memory qualification
- license, signing과 marketplace release
