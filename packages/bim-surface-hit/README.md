# BIM Surface Hit

공개 BIM renderer v0.1을 변경하지 않고 depth-backed WebGL2 pick을 exact
geometry range와 대조하는 내부 v0.2 보조 계약입니다.

- GPU가 선택한 exact source revision과 Pick ID 안에서만 삼각형을 찾습니다.
- renderer에 실제 resident인 range만 bounded read하고 SHA-256을 다시
  검증합니다.
- 가장 가까운 단일 삼각형의 projection-local point, winding normal,
  triangle index와 barycentric coordinate를 반환합니다.
- GPU의 15-bit depth quantization 오차 범위 밖이거나 동일 거리의 교차가
  모호하면 surface hit를 만들지 않습니다.
- 임시 geometry bytes는 pick 완료 또는 실패 시 모두 0으로 지우며 retained
  CPU geometry cache를 만들지 않습니다.

이 receipt는 derived display projection의 근거일 뿐 native face, source
precision, CRS/datum 또는 편집 권한을 주장하지 않습니다.
