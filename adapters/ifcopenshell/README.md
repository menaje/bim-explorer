# IfcOpenShell qualification adapter

IfcOpenShell Python package를 별도 process에서 실행하고 공통 IFC engine
qualification report를 stdout으로 반환합니다.

```sh
python3 adapters/ifcopenshell/qualify.py \
  --input /temporary/source.ifc \
  --fixture-id synthetic-small-ifc4
```

Python environment와 IfcOpenShell wheel은 저장소 package에 포함하지 않습니다.
qualification harness에는 `--python <venv-python>`으로 exact environment를
주입합니다.

IfcOpenShell Python object에는 이 probe가 사용할 명시적 close/dispose API가
없으므로 cleanup은 child process 종료 경계에서 판정합니다. 세 가지
repository-authored malformed/truncated input은 두 번씩 거부하고 model
reference release·process exit 뒤 정상 IFC recovery를 확인했습니다.
synchronous in-call cancellation, resource exhaustion, large-model resource
budget과 production redistribution은 아직 검증하지 않았습니다.

Dependency와 upstream license 사실은
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)에 기록합니다.
