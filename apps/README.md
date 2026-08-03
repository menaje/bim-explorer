# Apps

제품 shell만 둡니다.

예정 경계:

- `bim-explorer-web`: local Browser diagnostic surface
- `bim-explorer-vscode`: `.ifc` read-only Custom Editor

App은 IFC parser, source identity authority나 generic 3D implementation을
직접 소유하지 않습니다. Host capability와 lifecycle을 package/adapters에
주입하고 다른 제품 extension 설치를 요구하지 않습니다.

현재 [`browser-worker-probe`](browser-worker-probe/README.md)는 web-ifc
Browser Worker의 bounded local-file admission과 source-session lifecycle을
확인하는 experimental surface입니다. 제품 shell 또는 packaging 지원
약속이 아닙니다.
