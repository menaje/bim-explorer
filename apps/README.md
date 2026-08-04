# Apps

제품 shell만 둡니다.

예정 경계:

- `bim-explorer-web`: local Browser diagnostic surface
- `bim-explorer-vscode`: `.ifc` read-only Custom Editor

App은 IFC parser, source identity authority나 generic 3D implementation을
직접 소유하지 않습니다. Host capability와 lifecycle을 package/adapters에
주입하고 다른 제품 extension 설치를 요구하지 않습니다.

현재 [`browser-worker-probe`](browser-worker-probe/README.md)는 web-ifc
Browser Worker의 bounded local-file admission, source-session lifecycle과
model-opened checkpoint cooperative cleanup, generated 1,024-Wall
performance budget을 확인하는 experimental surface입니다. 제품 shell,
대표 대형 모델 또는 packaging 지원 약속이 아닙니다.

[`browser-gpu-probe`](browser-gpu-probe/README.md)는 공개 대표 IFC에서
투영한 첫 geometry range를 실제 Chromium WebGL2 API로 upload·draw하고
non-background pixel, camera/visibility view sequence와 disposal을 확인하는
별도 qualification surface입니다. physical GPU, pointer/picking interaction
이나 production Browser shell을 의미하지 않습니다.

[`semantic-explorer-probe`](semantic-explorer-probe/README.md)는 generated
semantic IFC의 같은 source session을 bounded semantic query와 WebGL2
renderer에 연결합니다. spatial hierarchy, property/relation/search,
실제 3D pick selection sync, 키보드·ARIA, DOM bound와 cleanup을 검증하는
qualification surface이며 제품 shell은 아닙니다.
