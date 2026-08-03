# Adapters

format/runtime adapter를 제품 shell과 격리합니다.

첫 qualification 후보:

- IfcOpenShell native/process adapter
- web-ifc WASM/Worker adapter

후보 이름은 지원 약속이 아닙니다. adapter는 engine object나 native pointer를
Viewer Core로 노출하지 않고 immutable source snapshot, bounded binary range,
source-local identity와 diagnostic만 제공합니다.

각 adapter는 engine version, license, source fingerprint, cancellation,
memory/time budget, crash isolation과 disposal receipt를 증명해야 합니다.
