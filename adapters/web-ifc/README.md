# web-ifc qualification adapter

`web-ifc`의 Node/WASM build를 별도 process로 실행하고 공통 IFC engine
qualification report만 stdout으로 반환합니다.

```sh
node adapters/web-ifc/src/inspect.mjs \
  --input /temporary/source.ifc \
  --fixture-id synthetic-small-ifc4
```

이 adapter는 현재 실험용입니다. 작은 synthetic fixture의 local Browser
Worker smoke, bounded local-file/source-session과 model-opened checkpoint
cooperative cleanup, 1,024-Wall bounded Browser performance prototype은
통과했습니다. CC BY 4.0 public IFC2X3에서는 별도 compact adapter로
46.77MB source의 parse/geometry와 isolated process peak RSS를 측정합니다.
세 가지 repository-authored malformed/truncated input은 별도 process에서
두 번씩 거부하고 model close·engine dispose 뒤 정상 IFC 복구를
확인했습니다. 같은 corpus는 실제 Chromium Worker에서도 통과했습니다.
공개 IFC call-start 뒤 process 강제 종료를 두 번, 실제 Chromium Worker
강제 종료를 한 번 수행하고 각각 fresh runtime 복구를 확인했습니다.
engine-cooperative cancellation, 강제 종료 뒤 내부 close/dispose,
resource exhaustion, physical GPU memory, clean package와 production
redistribution은 아직 검증하지 않았습니다. engine object, source path와
파일명은 report에 포함하지 않습니다.

```sh
npm run fetch:ifc:public
npm run qualify:ifc:public
npm run qualify:ifc:negative
npm run qualify:ifc:cancel-in-call
npm run qualify:bim-source:public
npm run qualify:renderer:public
```

Dependency pin과 upstream license는
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)에 기록합니다.

`createWebIfcSourceArtifact`는 raw bytes를 내부
`bim-explorer-bim-source-artifact/0.2`로 투영합니다. geometry payload는
shared definition을 한 번 저장하고 occurrence transform을 metadata에
분리하며 quantity/material/classification detail은 별도 digest range로
분할합니다. 호출자는 이 adapter를 isolated process 또는 Worker 경계에
두어야 합니다. generated mapped IFC 외에 고정된 46.77MB 공개 IFC2X3
source artifact도 격리 process에서 두 번 검사합니다. 이 공개 단계는 3개
bounded geometry range와 6개 semantic detail range, detail 0-byte의 첫
range read, 선택 entity의 exact detail slice, tree/property/Render/Pick
identity와 empty tessellation diagnostic까지 측정합니다. property-set
value payload, IFC2X3 profile admission과 Viewer Core conformance를
의미하지 않습니다.

`qualify:renderer:public`은 같은 source snapshot의 첫 range를 별도
consumer decoder와 headless backend에 mount해 geometry/instance/draw-call
accounting과 dispose를 확인합니다. `rendered: false`, `actualGpu: false`이며
GPU 성능 evidence가 아닙니다.
