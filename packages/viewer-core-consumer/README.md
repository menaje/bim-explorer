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
renderer, Browser/VS Code host disposal을 검증합니다. 상태는 public
preview이며 stable upstream release, physical GPU와 제품 entrypoint 채택을
주장하지 않습니다.

기존 sibling checkout command는 역사적 local evidence 재현 전용입니다.
public compatibility authority는 release qualification만 사용합니다.

```bash
node scripts/qualify-viewer-core-local.mjs \
  --viewer-core /absolute/path/to/viewer-core/src/index.mjs \
  --conformance /absolute/path/to/viewer-core/src/conformance.mjs
```
