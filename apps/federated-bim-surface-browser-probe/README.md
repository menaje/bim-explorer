# Federated BIM Surface Browser Probe

실제 headless Chrome WebGL2에서 내부 BIM Surface v0.2를 여는 qualification
entrypoint입니다.

- generated IFC semantic base, generated GLB geometric reference와 generated
  GLB consumer overlay를 서로 다른 source slot으로 엽니다.
- GPU depth pick을 exact geometry range와 대조해 source-local point/normal 및
  derived triangle-barycentric locator를 만듭니다.
- 세 source의 native identity를 합치지 않고 IFC semantic query를 IFC slot에만
  허용합니다.
- 모든 source session, replay bytes, renderer/GPU와 임시 surface geometry를
  terminal dispose에서 검증합니다.

fixture와 Browser bundle은 qualification 동안 loopback server에서만 제공하며
release에 포함하지 않습니다.
