# Federated BIM Surface VS Code

`*.bimfed.json` federation 문서를 실제 VS Code Webview에서 여는 read-only
Surface v0.2 제품 entrypoint입니다.

제품 코드는 private `@bim-explorer/federated-bim-surface@0.2.0` candidate의
generated zero-runtime-dependency ESM을 사용하며 clean VSIX가 같은 runtime을
포함하는지 검증합니다.

- extension host가 manifest와 같은 폴더의 1–8개 IFC/glTF/GLB를 symlink 없이
  bounded read하고 source 경로나 파일 이름을 Webview report에 전달하지 않습니다.
- source마다 격리된 local Worker/session과 caller-provided role, explicit
  alignment, native revision/identity를 유지합니다.
- actual WebGL2 depth를 exact display geometry와 대조해 derived source-local
  point, winding normal과 triangle-barycentric locator를 만들 수 있습니다.
- close는 Surface, replay cache, transferred session/Worker, CPU 임시 geometry와
  GPU allocation을 순서대로 회수합니다.

이 entrypoint는 native face, source precision, CRS/datum, Workspace, Canonical
Entity, 편집, acceptance, publish 또는 export authority를 갖지 않습니다.
candidate qualification은 public tag, release asset 또는 Spatial compatibility를
발급하지 않습니다.
