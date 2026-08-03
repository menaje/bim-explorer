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

현재 qualification 구현:

- [`web-ifc`](web-ifc/README.md): exact npm/WASM dependency의 Node process probe
- [`IfcOpenShell`](ifcopenshell/README.md): 주입된 Python environment의 native
  process probe

둘 다
[`ifc-engine-contract`](../packages/ifc-engine-contract/README.md)의 같은
report를 출력합니다.
