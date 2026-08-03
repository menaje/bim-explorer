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
실행 중인 synchronous engine 호출의 선점, corrupt input, GPU/render
first-frame, clean package와 production redistribution은 아직 검증하지
않았습니다. engine object, source path와 파일명은 report에 포함하지
않습니다.

```sh
npm run fetch:ifc:public
npm run qualify:ifc:public
```

Dependency pin과 upstream license는
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)에 기록합니다.

`createWebIfcSourceArtifact`는 raw bytes를 내부
`bim-explorer-bim-source-artifact/0.1`로 투영합니다. geometry payload는
shared definition을 한 번 저장하고 occurrence transform을 metadata에
분리합니다. 호출자는 이 adapter를 isolated process 또는 Worker 경계에
두어야 합니다. 현재 source-artifact evidence는 generated mapped IFC의
Node synthetic vertical slice에 한정하며 production Browser packaging을
의미하지 않습니다.
