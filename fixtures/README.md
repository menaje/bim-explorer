# Fixtures

공개 qualification에는 repository-authored synthetic generator와
redistribution 상태가 명시된 manifest만 사용합니다.

`.ifc`, `.ifczip`, `.rvt` 등 model artifact 자체는 Git에서 차단합니다.
fixture command가 임시 디렉터리에 결정적으로 생성하고 종료 시 삭제합니다.

현재 fixture:

- `ifc/synthetic-small`: IFC4 Project/Site/Building/Storey/Space/Wall,
  extrusion geometry, property, type와 material relation
- `ifc/synthetic-mapped`: 두 Wall이 하나의 representation map을 재사용하며
  quantity, classification과 Express ID mapping을 포함
- `ifc/synthetic-performance`: 1,024 Wall이 하나의 representation map을
  사용하는 388,316-byte bounded Browser scale step

performance fixture는 project-authored generated source이며 artifact를
추적하지 않습니다. 대표 대형 성능 fixture는 별도 redistribution·privacy
manifest와 download digest Gate가 생기기 전 지원 근거로 추가하지 않습니다.
