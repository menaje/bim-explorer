---
type: qualification
status: active
authority:
  - product-review-toolbar-manual-checklist
  - product-review-unit-disclosure
last_reviewed: 2026-08-12
---

# 3D 검토 도구 수동 체크리스트

이 체크리스트는 standalone Browser와 VS Code Custom Editor가 공유하는 3D 검토
도구 모음을 사람이 확인하는 절차입니다. IFC와 glTF/GLB mesh source에 적용하며
E57/LAS/LAZ point profile은 별도 point selection·LOD qualification을 따릅니다.

검토에 쓰는 모델은 사용 권한이 있는 로컬 파일이어야 합니다. 고객 모델, 파일명,
경로와 원본 bytes를 이슈, evidence, Git 또는 배포물에 넣지 않습니다.

## 모델 열기와 배치

- 모델을 열었을 때 3D viewport가 가운데 주 작업 영역에 보이고 `Layout`에서
  model tree와 properties를 각각 접었다가 복원할 수 있어야 합니다.
- `Viewport focus`를 켜면 tree, properties, search result가 숨겨지고 viewport가
  전체 작업 폭을 사용해야 합니다. 다시 누르면 이전 panel 표시 상태로
  돌아가야 합니다.
- 좁은 창에서도 `Camera`, `Views`, `Selection`, `Section`, `Measure`, `Layout`
  기능에 접근할 수 있고 메뉴가 viewport 밖으로 잘리지 않아야 합니다.

## Camera와 표준 시점

- canvas click 후 primary drag는 orbit, Shift-primary/right/middle drag는 pan,
  wheel 또는 `+`/`-`는 zoom이어야 합니다. 화살표는 orbit, Shift+화살표는
  pan이어야 합니다.
- `Fit all` 또는 `F`는 전체 model bounds를 맞추고 `Fit selection` 또는
  `Shift+F`는 현재 선택 객체 bounds를 맞춰야 합니다.
- `Front`, `Back`, `Left`, `Right`, `Top`, `Bottom` 또는 `1`–`6`은 Z-up 기준
  표준 시점으로 이동하면서 전체 모델을 맞춰야 합니다.
- `Projection` 또는 `P`를 두 번 실행하면 perspective→orthographic→perspective로
  돌아와야 합니다. `Reset` 또는 `0`, canvas의 `Home`은 source-open camera로
  돌아가야 합니다.

## 선택과 가시성

- viewport의 두 위치에서 서로 다른 객체를 직접 선택하고 tree 선택, properties,
  3D highlight가 같은 source revision identity를 가리키는지 확인합니다.
- `Hide selected`는 선택 객체를 숨기고 product selection을 지워야 합니다.
- `Isolate selected`는 선택 객체만 남기고 `Show all`은 모든 객체를 복원해야
  합니다.
- `Clear selection`은 tree·properties·3D highlight를 함께 지우되 visibility와
  source revision을 변경하지 않아야 합니다. 이후 viewport나 tree에서 다시
  선택할 수 있어야 합니다.

## 단면과 측정

- `Clip X`는 model center의 X clipping plane을 켜고 다시 누르면 해제해야
  합니다. `Section box`는 inset box를 적용하며 `Clear section`은 plane과 box를
  모두 제거해야 합니다.
- `Distance` 또는 `D`를 누르고 서로 다른 두 visible point를 선택하면 거리가
  표시되어야 합니다. `Angle` 또는 `G`, `Area` 또는 `A`는 서로 다른 세 점을
  요구합니다. `Escape` 또는 `Clear measurement`는 partial point와 active tool을
  함께 지워야 합니다.
- 거리와 면적은 `source-coordinate units (unqualified)`로 표시해야 합니다.
  source metadata를 별도로 검증하지 않은 상태에서 metre, millimetre 또는
  surveyed coordinate로 해석하면 실패입니다. 각도만 수학적 degree로
  표시합니다.

## 성능과 종료

- 대표 IFC에서 camera·selection·section 명령 뒤 UI가 입력을 계속 받아야 하며,
  체감 지연은 모델 규모, 장비, 명령과 함께 기록합니다. 한 장비의 결과를
  production 또는 전체 플랫폼 지원으로 승격하지 않습니다.
- source switch와 `Close model` 뒤 이전 selection, partial measurement, section,
  Worker, range와 GPU allocation이 남지 않아야 합니다.

자동 회귀는 `npm run qualify:product:web`과
`npm run qualify:product:web:public`이 actual Browser WebGL2에서 도구 모음,
camera, selection, visibility, clipping, distance measurement, layout와 cleanup을
확인합니다. VS Code 배포 후보는 별도로 `npm run qualify:product:vscode`와
`npm run qualify:product:vscode-install`을 모두 통과해야 합니다.
