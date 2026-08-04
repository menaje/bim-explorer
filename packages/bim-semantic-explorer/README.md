# BIM semantic explorer

`BimModelSource`의 immutable snapshot과 bounded semantic query를
tree, search, property, relation, 3D selection 상태로 투영하는 내부
draft입니다.

현재 범위는 다음과 같습니다.

- decomposition과 spatial containment를 구분하는 paged tree
- GlobalId, name, IFC class, property set, quantity, material,
  classification, type, container 검색
- occurrence에서 type, property set, quantity, material,
  classification과 container 탐색
- type에서 occurrence로 돌아오는 relation 탐색
- tree, search, relation, revision-bound 3D pick의 단일 selection
- search result와 selection을 위한 Render ID isolate command
- source/revision에 묶인 local saved view
- bounded loaded tree, search result, relation과 DOM row projection
- lazy property-set primitive value와 opaque, lossy, omitted 정보의
  명시적 상태

이 패키지는 DOM이나 renderer를 소유하지 않습니다. UI shell은
`state.tree.rows`만 렌더링하고, 3D shell은 `setVisibility()`가 반환한
command를 같은 revision의 renderer에 전달합니다. source session의
dispose도 호출자가 소유합니다.

source session이 `getPropertySetValues`를 제공하면 선택 entity의 bounded
property slice를 읽어 occurrence/type primitive value를 표시합니다.
호환 source가 value API를 제공하지 않으면 기존 name-only 상태와
`property-value:lossy` limitation을 유지합니다. host/void/fill과
connection은 source가 아직 제공하지 않아 `opaque`입니다.
