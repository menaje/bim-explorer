# Federated BIM Surface

`@bim-explorer/federated-bim-surface@0.3.0`은 host-neutral read-only
`bim-explorer-bim-surface/0.2` 계약과 additive
`bim-explorer-federated-retained-overlay/0.1` 계약을 제공하는 experimental
package candidate입니다.

- 1–8개의 aligned IFC 또는 qualified glTF/GLB source slot을 하나의 bounded
  renderer projection에 합성합니다.
- `semantic-base`, `geometric-reference`, `observation-reference`,
  `consumer-overlay` 역할은 caller가 제공한 composition metadata로만
  유지합니다.
- selection과 anchor는 source slot, exact native revision과 native identity를
  유지하며 source 사이의 같은 GlobalId를 병합하지 않습니다.
- `transferred` resource만 실패·refresh·dispose에서 회수하고 `borrowed`
  resource는 건드리지 않습니다.
- 실제 WebGL2 depth pick은 projection-local hit를 exact source-local anchor로
  변환하며, 모호하거나 locator가 없는 경우 object selection으로 제한합니다.

v0.3.0은 `consumer-overlay` source에 versioned `BEXOVL01` retained geometry
packet을 적용합니다. adapter는 bounded CPU/GPU staging을 비동기로 준비하고,
동기 `commit()` 하나로 geometry, visibility, Pick map과 overlay revision을 함께
전환합니다. rollback, cancellation, stale/out-of-order packet과 allocation
failure는 현재 frame과 revision을 보존합니다. checkpoint는 native source range를
다시 읽거나 parse/upload하지 않습니다.

`runtime/index.mjs`는 BIM source, bounded renderer, federation, reference anchor,
surface hit와 retained overlay를 합친 zero-runtime-dependency ESM입니다.

```bash
npm run build:bim-surface:v0.3
npm run qualify:bim-surface:v0.3:package
npm run release:bim-surface:v0.3
```

qualification은 독립 stage 두 곳에서 byte-identical tarball을 만들고 빈 offline
consumer에 설치합니다. consumer는 artifact import만으로 retained packet
encode/decode, prepare, atomic commit, checkpoint와 terminal cleanup을
재현합니다. 저장소와 staged manifest는 `private: true`로 유지해 npm registry
publication을 차단합니다.

공개 package prerelease tag는 `bim-surface-v0.3.0`이며 `dev`에서 승격된
`prerelease` branch의 exact HEAD에서만 발급합니다. 이 package는 native source
mutation, Workspace, Canonical identity, acceptance, publish 또는 export authority를
발급하지 않습니다. VSIX·Marketplace publication, published Viewer Core 0.1.3
artifact, cross-platform physical GPU와 production support는 이 release 범위가
아닙니다.
