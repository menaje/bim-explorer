# web-ifc qualification adapter

`web-ifc`의 Node/WASM build를 별도 process로 실행하고 공통 IFC engine
qualification report만 stdout으로 반환합니다.

```sh
node adapters/web-ifc/src/inspect.mjs \
  --input /temporary/source.ifc \
  --fixture-id synthetic-small-ifc4
```

이 adapter는 현재 실험용입니다. 작은 synthetic fixture의 local Browser
Worker smoke는 통과했지만 실제 file lifecycle, cancellation, corrupt input,
대형 모델 memory, clean package와 production redistribution은 아직
검증하지 않았습니다. engine object와 source path는 report에 포함하지
않습니다.

Dependency pin과 upstream license는
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)에 기록합니다.
