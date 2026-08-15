# Retained overlay Browser probe

이 probe는 generated IFC/GLB 3-source Federated Surface에 bounded retained
geometry packet을 적용하고 actual Chrome WebGL2의 off-screen stage, synchronous
atomic commit, pixel, projected Pick ID, checkpoint, tombstone와 terminal cleanup을
측정합니다.

서버는 기존 generated Surface HTML/CSS를 재사용하고 app과 fixture를 localhost
메모리 응답으로만 제공합니다. 외부 origin, 사용자 파일, telemetry와 upload는
사용하지 않습니다. masked/headless WebGL2 결과를 physical GPU 증거로 해석하지
않습니다.
