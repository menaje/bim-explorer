# `@bim-explorer/bim-surface`

`bim-surface`는 BIM Explorer의 source session, bounded 3D host와 semantic
explorer를 하나의 host-neutral read-only 수명주기로 합성합니다. Browser와
VS Code 제품이 이 표면을 사용하며, 외부 소비자는 단일 ESM entrypoint에서
같은 source identity와 cleanup 계약을 사용할 수 있습니다.

이 패키지는 DOM, 파일 선택, 네트워크, Coni Spatial private package 또는
Workspace capability를 소유하지 않습니다. Canonical Entity ID, revision
mutation, accept, publish와 export authority도 발급하지 않습니다. optional
Spatial handoff factory는 포함하지만 실제 Workspace bridge와 권한은 소비자가
명시적으로 제공해야 합니다.

저장소의 `package.json`은 우발적인 npm publish를 막기 위해 `private: true`를
유지합니다. 공식 배포 채널은 `bim-surface-v<semver>` immutable GitHub Release의
exact-version tarball입니다. `npm run qualify:bim-surface:package`가
license/source-offer를 포함한 package를 두 번 만들고 digest parity 및 offline
clean install을 검증하며, `npm run release:bim-surface`가 checksum, SPDX와
release manifest를 합성합니다. 이 채널은 npm registry publication을 의미하지
않습니다.

```bash
npm install \
  https://github.com/menaje/bim-explorer/releases/download/bim-surface-v0.1.0/bim-explorer-bim-surface-0.1.0.tgz
```

```js
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
  createBimSurface,
  createBounded3dRenderer,
  createHeadless3dBackend,
} from "@bim-explorer/bim-surface";

const source = createBimModelSource(artifact);
const opened = await source.open({
  protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
});
const surface = createBimSurface({
  kind: "browser",
  renderer: createBounded3dRenderer({
    backend: createHeadless3dBackend(),
  }),
  storage: null,
});

await surface.open({
  session: opened.session,
  snapshot: opened.snapshot,
});
await surface.dispose();
await source.dispose();
```
