# Viewer Core BIM consumer

공용 Viewer Core의 source를 복사하지 않고 BIM Explorer의 3D consumer
행동을 검증하는 release-pinned consumer package입니다.

포함 범위:

- 실제 `BimModelSource`의 immutable 3D snapshot adapter
- `3d` layer와 bounded binary range
- source fingerprint에 묶인 GlobalId external identity
- ordered 3D tombstone/upsert delta와 stale replay
- 실제 bounded 3D renderer mount와 backend injection
- Browser/VS Code 형태의 Host lifecycle
- Browser와 VS Code 제품 IFC/glTF/GLB entrypoint용 public RenderSource adapter
- public selection event와 source/session/Worker의 단일 소유 cleanup
- stale snapshot/pick과 deterministic disposal probe

package manifest와 root lock은 공개 prerelease의 immutable GitHub Release
asset을 직접 고정합니다.

```text
@menaje/viewer-core@0.1.2
@menaje/viewer-render-protocol@0.1.2
protocol menaje-viewer-render-protocol/0.1.0
tag commit e225c2c8531e1f5e9677238d85adf6f686203026
```

`npm run qualify:viewer-core`는 설치 content digest와 license metadata,
upstream source/delta conformance, 실제 IFC4 BIM source, headless 3D
renderer, Browser/VS Code host disposal을 검증합니다.

`npm run build:viewer-core-product`는 내부 product source/session을 공개
RenderSource로 투영하는 `runtime/product.mjs`를 재현합니다. `npm run
qualify:viewer-core:product`는 실제 Browser, staged VS Code와 clean-installed
local VSIX에서 공개 IFC 및 glTF/GLB의 range read, 양방향 selection과
source/session/Worker/Host cleanup을 확인합니다. 제품 shell은 public runtime이
원본 Worker 소유권을 갖는 동안 기존 BIM Surface에 no-op borrowed lease만
전달하므로 자원을 정확히 한 번 정리합니다. point-cloud entrypoint는 이
계약의 대상이 아닙니다.

`npm run qualify:product:representative:physical-gpu`는 같은 현재 제품
entrypoint를 software fallback이 비활성화된 Apple M2 Metal에서 실제 Browser,
staged VS Code와 clean-installed local VSIX로 다시 검증합니다. 공개 IFC와
product-scale GLB의 exact range bytes, selection event와 terminal cleanup을
포함하며 Linux/Windows hardware, 동시 합성, OS-level peak GPU memory나 VSIX
publication을 승인하지 않습니다.

상태는 public preview입니다. 제품 entrypoint adoption Gate는 통과했지만
upstream stable release, Marketplace publication과 production support는
주장하지 않습니다.

기존 sibling checkout command는 역사적 local evidence 재현 전용입니다.
public compatibility authority는 release qualification만 사용합니다.

```bash
node scripts/qualify-viewer-core-local.mjs \
  --viewer-core /absolute/path/to/viewer-core/src/index.mjs \
  --conformance /absolute/path/to/viewer-core/src/conformance.mjs
```
