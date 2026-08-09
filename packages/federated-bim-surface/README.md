# Federated BIM Surface

기존 공개 `@bim-explorer/bim-surface@0.1.0`을 변경하지 않고
`bim-explorer-bim-surface/0.2` multi-source 계약을 구현하는 내부 draft입니다.

- 1–8개의 aligned IFC 또는 qualified glTF/GLB source slot을 한 bounded
  renderer projection에 올립니다.
- caller-provided `semantic-base`, `geometric-reference`,
  `observation-reference`, `consumer-overlay` 역할은 composition metadata로만
  유지합니다.
- semantic explorer는 실제 bounded semantic session이 있는 source에서만
  source-scoped로 제공합니다.
- selection과 anchor는 source slot, exact native revision과 native identity를
  유지하며 source 사이의 GlobalId를 합치지 않습니다.
- `transferred` resource만 실패·refresh·dispose에서 회수하고 `borrowed`
  resource는 건드리지 않습니다.
- 한 source refresh는 그 source의 selection과 anchor, 이를 포함한 saved view만
  stale로 만듭니다.

내부 `@bim-explorer/bim-surface-hit` wrapper를 사용하면 actual WebGL2 depth
pick을 exact revision geometry와 대조해 projection-local point, winding normal,
triangle index와 barycentric locator를 만든 뒤 source-local anchor로 변환합니다.
임시 CPU geometry는 즉시 지우며 native face나 source precision은 주장하지
않습니다. wrapper가 없거나 교차가 모호하면 object selection을 유지하고
`unsupported` diagnostic을 반환합니다. generated GLB–IFC–GLB actual Browser와
staged/clean-installed VS Code Webview qualification은 통과했습니다. 실제
Spatial consumer와 public v0.2 release는 별도 Gate입니다.
