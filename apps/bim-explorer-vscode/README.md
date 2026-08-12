# BIM Explorer for VS Code

`.ifc`, `.gltf`, `.glb`, `.e57`, `.las`, `.laz`를 같은 `bim-explorer-web`
application, isolated source Worker와 WebGL2 renderer로 여는 read-only
Custom Editor host입니다.
IFC는 Browser와 같은 host-neutral `bim-surface/0.1` runtime으로
`BimModelSource`, bounded 3D host와 semantic explorer를 합성하고, glTF/GLB는
source-native reference mesh explorer를 사용합니다. 두 경로의 renderer range,
selection과 lifecycle은 exact public Viewer Core product adapter를 통과합니다.
mesh canvas의 pointer, wheel과 keyboard camera 조작은 Browser와 같은 runtime을
사용합니다. focus된 canvas에서 화살표는 orbit, Shift+화살표는 pan,
`+`/`-`는 zoom, `Home`은 최초 fit으로 복귀하며 animation 없이 frame을
직렬화합니다. `Fit selection`은 현재 시점 방향을 유지하면서 선택 객체 bounds로
이동하고, 같은 camera queue와 rollback 경로를 사용합니다. bounded tree 창 밖의
3D selection은 마지막 행에 고정되어 highlight와 inspector identity를 유지합니다.
단일-source `.gltf` Custom Editor는 JSON에 명시된 최대 16개의 동일 폴더 ASCII
leaf-name `.bin`, `.png`, `.jpg`, `.jpeg`를 extension host에서만 해결합니다.
document와 sidecar 합산
64MiB, regular non-symlink, 읽기 전후 size/mtime을 검사하며 resource 변경도
watch합니다. webview에는 경로가 아닌 resource name과 transferable bytes만 보내고
누락·중복·미사용 sidecar, separator/`..`/scheme/query/fragment/percent URI와
runtime network를 거부합니다. 외부 PNG/JPEG, exact glTF PNG/JPEG data URI,
GLB PNG/JPEG bufferView 또는 명시적 local `.bin`의 glTF image bufferView는
OPAQUE `baseColorTexture`, `TEXCOORD_0`과 표준 sampler에만 허용합니다. JPEG는
bounded baseline sequential profile만 허용하고 data URI buffer 기반 image
bufferView는 거부합니다. 제품 file-open에서 progressive JPEG, 비-OPAQUE
alpha와 다른 선택적 material texture role은 geometry를 유지하면서 bounded
omission으로 진단합니다. malformed image, unsafe URI와 hard budget 위반은
fail-closed입니다. required extension은 `KHR_mesh_quantization`과
`EXT_meshopt_compression` `FILTER_NONE`만 bounded decode하며 Draco·다른 meshopt
filter와 그 밖의 required extension은 거부합니다.
이 bundle 경로는 single-source Custom Editor에만 적용되며 immutable federated
Surface v0.2의 `*.bimfed.json` source admission에는 소급 적용하지 않습니다.
LAS/LAZ는 8 MiB·
500,000-point 한도, E57 multiple-scan은 최대 32 MiB·2,000,000-point의 명시적
상한 안에서 source-neutral point range로 엽니다. `point:n` 선택은 exact source
revision과 root range digest 안의 파생 순서 identity입니다. 대형 point range는
`BIM Explorer: Refine Point Detail` command로 제품 로컬 octree/chunk LOD를 다음
단계로 전환합니다. 이는 CRS, surveyed datum, source-native hierarchy,
source-declared point semantics 또는 BIM semantic authority를 주장하지 않습니다.

별도 `*.bimfed.json` Custom Editor는 1–8개의 같은 폴더 IFC/glTF/GLB를
source-scoped `bim-surface/0.2`로 합성합니다. manifest의 file 값은 separator가
없는 leaf 이름만 허용하고 extension host가 manifest/source symlink, 읽기 중
변경, source별 64 MiB와 합산 64 MiB 상한을 검사합니다. 경로와 파일 이름은
Webview report로 보내지 않으며 source마다 독립 Worker/session을 사용합니다.
예시는 다음과 같습니다.

```json
{
  "schema": "bim-explorer-federation-document/0.1",
  "federationId": "federation:local-coordination",
  "sources": [
    {
      "federationSourceId": "source-slot:architecture",
      "sourceRole": "semantic-base",
      "file": "architecture.ifc",
      "sourceToFederation": [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]
    }
  ]
}
```

`BIM Explorer: Verify Visible Federated Anchors`는 actual WebGL2 depth와 exact
display geometry를 대조해 source-local point·normal과 derived
triangle-barycentric anchor를 확인합니다. 이는 native face, source precision,
CRS/datum, Workspace, mutation, acceptance, publish 또는 export authority가
아닙니다. `npm run qualify:bim-surface:v0.2:vscode`가 staged 확장과
clean-installed VSIX의 동일 composition과 전체 자원 정리를 검증합니다.
Webview는 private `@bim-explorer/federated-bim-surface@0.2.0` candidate의
generated runtime을 직접 사용하며 VSIX도 같은 파일을 stage합니다. 이 결합은
public v0.2 tag나 Spatial consumer support를 승인하지 않습니다.

- source URI는 extension host 안에서만 사용하며 webview message와
  diagnostics에 넣지 않습니다.
- `file:` URI, regular file, non-symlink와 최대 64 MiB를 읽기 전후에
  검증하며 LAS/LAZ에는 8 MiB, E57에는 32 MiB cap을 적용합니다.
- source 변경은 exact URI watcher가 새 generation을 보내 기존 Worker와
  fingerprint-scoped cache를 무효화합니다.
- cancel, retry, diagnostics와 `BIM Explorer: Close Model` command는 active
  editor에만 전달합니다. Close Model은 webview source/session/Worker/Host를
  먼저 정리해 terminal 영수증을 남기고 editor close와 분리합니다.
- editor close는 webview Worker/GPU를 파기하고 extension-side watcher와
  path-free report를 정리합니다.
- 계정, telemetry, upload와 Coni Spatial 설치가 필요하지 않습니다.

개발 소스는 저장소 공용 runtime을 직접 사용합니다. `npm run
package:vscode`는 동일 파일을 staging한 뒤 독립 설치 가능한 VSIX를
생성합니다. clean-install 검증은 빈 profile에 설치된 확장 자체로 generated
IFC, on-demand 공개 IFC와 Khronos Box GLB를 다시 열어 source/render
projection과 close cleanup까지 확인하며, 공개 fixture를 VSIX에 포함하지
않습니다. 42.98MB `A Beautiful Game` GLB도 staged Custom Editor와
clean-installed VSIX에서 49개 source-native entity·573,952 unique triangles,
bounded WebGL2 projection과 close cleanup을 재현합니다. 이 검증은
`npm run qualify:gltf:product-scale:vscode`와
`npm run qualify:gltf:product-scale:vscode-install`로 실행하며 원본 GLB를
package에 포함하지 않습니다. glTF/GLB bridge는 정규화된 format과 bytes만
보내며 local URI나 IFC GlobalId를 전달하거나 합성하지 않습니다. cache-only
Khronos `Box.gltf + Box0.bin`은 `npm run
qualify:gltf:external-resource-products`에서 staged Custom Editor와
clean-installed local VSIX를 Browser와 함께 Apple M2 Metal로 검증하며 sample은
package에 포함하지 않습니다. `npm run
qualify:gltf:mesh-quantization-products`는 cache-only Box-derived
`KHR_mesh_quantization` GLB를 같은 세 Apple M2 Metal 제품 표면과 공식
Validator/headless renderer에서 검증합니다. 이 single-source 기능은 immutable
federated Surface v0.2에 소급 반영하지 않습니다.
`npm run qualify:gltf:texture-products`는 cache-only Khronos BoxTextured의 외부
PNG bundle과 embedded PNG GLB를 staged Custom Editor와 clean-installed local
VSIX에서도 actual WebGL2 sRGB texture로 검증합니다. 각 Browser 경로를 포함한
6개 Apple M2 Metal 제품 표면이며 sample은 package에 포함하지 않습니다.
`npm run qualify:gltf:jpeg-texture-products`는 cache-only baseline JPEG derivation을
staged Custom Editor와 clean-installed local VSIX에서도 actual WebGL2 sRGB
texture로 검증합니다. Browser를 포함한 Apple M2 Metal 3개 제품 표면에서
1,756-byte geometry-range v3·22,836-byte total upload·terminal cleanup을
재현하며 sample은 package에 포함하지 않습니다.
package 안에는 MPL-2.0, third-party notice, exact source 제공 경로와 release
검증 정책이 포함됩니다. VSIX stage는 generated single-source `bim-surface`
runtime과 private federated 0.2.0 candidate runtime을 모두 명시적으로 포함하며
두 stale bundle 검사를 먼저 통과해야 합니다. 또한 generated Viewer Core
product runtime과 exact upstream package manifest, MPL-2.0 LICENSE/NOTICE를
stage하고 bundle/disclosure byte parity를 검사합니다.

`npm run qualify:viewer-core:product`는 public IFC와 small/product-scale GLB를
staged VS Code 및 빈 profile의 clean-installed local VSIX에서 열어 공개 range
read, selection event와 source/session/Worker/Host cleanup을 검증합니다. 이
로컬 VSIX는 Marketplace나 Open VSX에 게시하지 않습니다.

`npm run qualify:product:representative:physical-gpu`는 cache-only 공개 IFC와
product-scale GLB를 software fallback이 비활성화된 Apple M2 Metal에서 각각
actual Browser, staged VS Code와 clean-installed local VSIX로 엽니다. 현재 exact
public Viewer Core 0.1.2 adapter의 range read, selection event와 terminal
source/session/Worker/Host cleanup도 같은 hardware run에서 검증합니다. 두
모델은 합산 source bytes가 64MiB 제품 상한을 넘으므로 같은 federation 세션에
넣지 않습니다. 검증 결과는 macOS arm64 대표 제품 범위이며 VSIX publication,
Linux/Windows, OS-level peak GPU memory와 production support를 승인하지
않습니다.

`npm run qualify:las-laz:product:vscode`는 cache-only paired LAS/LAZ를
staged Custom Editor와 빈 profile에 clean-installed VSIX에서 각각 열어
point-range/visible projection, path-free bridge와 cleanup을 비교합니다.
VSIX는 exact `laz-perf@0.0.6` WASM과 Apache-2.0 license를 포함하고,
Webview의 `unsafe-eval`을 허용하지 않도록 Emscripten dynamic Function
construction을 동등한 closure로 치환한 generated glue를 사용합니다.
샘플 binary는 package나 Git에 포함하지 않습니다.

`npm run qualify:e57:product:vscode`는 single-scan Cartesian XYZ/RGB
default-BitPack E57을 staged Custom Editor와 clean-installed VSIX에서 열어
동일한 7,680-point range, visible projection, path-free bridge와 cleanup을
확인합니다. 자체 JavaScript decoder와 audit reference의 MIT license text는
VSIX에 포함하지만 공개 E57 샘플은 포함하지 않습니다. CRS, scan pose,
surveyed datum과 E57 format admission은 계속 별도 Gate입니다.
`npm run qualify:e57:spherical:product:vscode`는 같은 packaged runtime으로
spherical RAE/intensity/RGB sample의 155,201-point projection을 staged와
clean-installed VSIX에서 비교합니다. intensity omission은 lossy로 유지하고
sample은 VSIX에 포함하지 않습니다.

`npm run qualify:e57:multiple-scan:product:vscode`는 22,146,048-byte
cache-only E57의 다섯 scan과 1,213,990 points를 staged Custom Editor 및
clean-installed VSIX에서 동일한 pose-applied point range로 엽니다. 네 explicit
pose와 한 implicit identity pose는 local registration으로만 취급하며, CRS나
surveyed datum authority 및 E57 format admission으로 승격하지 않습니다.

`npm run qualify:point-cloud:picking:vscode`는 E57/LAS/LAZ point selection을
staged VS Code 1.131.0과 빈 profile에 clean-installed VSIX에서 동일하게
재현하고 path-free bridge와 transient pick target cleanup을 검증합니다.
`npm run qualify:point-cloud:lod`는 five-scan E57의 51개 파생 chunk와
31,971→242,821→1,213,990-point 전환, root identity 보존 및 Worker/GPU cleanup을
staged와 clean-installed runtime에서 검증합니다.

`npm run qualify:product:point-cloud:physical-gpu`는 LAS·LAZ·E57·다중 스캔
E57을 software fallback이 비활성화된 Apple M2 Metal에서 actual Chrome,
staged VS Code와 clean-installed local VSIX로 검증합니다. 이 Gate는
point format admission, CRS·surveyed datum, Linux/Windows hardware 또는 VSIX
publication을 승인하지 않습니다.
