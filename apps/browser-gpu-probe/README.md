# Browser GPU probe

공개 대표 IFC에서 만들어진 source-neutral 첫 geometry range를 실제
Chromium WebGL2 context에 올려 첫 frame과 disposal을 확인하는 로컬
qualification surface입니다.

```bash
npm run probe:browser-gpu
```

기본 주소는 `http://127.0.0.1:4174`입니다. 서버는 공개 fixture를
on-demand cache에서 읽고 adapter/source artifact를 메모리에서 만든 뒤
첫 range를 1 MiB 이하 HTTP Range 응답으로만 제공합니다.

이 surface는 production Browser shell이 아닙니다. 실제 WebGL2 API upload,
draw, non-background pixel과 resource release만 검증하며 physical GPU,
camera visibility, interaction, picking이나 Host conformance를 주장하지
않습니다.
