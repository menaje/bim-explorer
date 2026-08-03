# Viewer Core consumer probe

공용 Viewer Core의 source를 복사하지 않고 BIM Explorer의 3D consumer
행동을 검증하기 위한 pre-conformance package입니다.

포함 범위:

- immutable BIM mock source snapshot
- `3d` layer와 bounded binary range
- source fingerprint에 묶인 GlobalId external identity
- ordered 3D tombstone/upsert delta와 stale replay
- 3D presentation mount와 camera/backend injection
- Browser/VS Code 형태의 Host lifecycle
- stale snapshot/pick과 deterministic disposal probe

이 package는 upstream dependency를 선언하지 않습니다. durable Viewer Core
artifact가 준비되면 upstream `openViewerRuntime`,
`openRenderSource`와 `runRenderSourceConformance`를 qualification command에
주입합니다.

현재 sibling checkout을 사용하는 command는 local evidence 전용입니다.
그 결과는 public compatibility나 clean-install 성공으로 간주하지 않습니다.

```bash
node scripts/qualify-viewer-core-local.mjs \
  --viewer-core /absolute/path/to/viewer-core/src/index.mjs \
  --conformance /absolute/path/to/viewer-core/src/conformance.mjs
```
