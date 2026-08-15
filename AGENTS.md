# BIM Explorer 저장소 에이전트 지침

## 시작 전

상위 `../AGENTS.md`와 이 문서를 읽고 `dev` 브랜치인지 확인한 뒤 작업한다.
변경 영역에 따라 다음 문서를 먼저 읽는다.

- 제품 개요와 개발 기준선: `README.md`
- 제품·저장소 책임: `docs/product-boundary.md`
- 시스템 구성: `docs/system-architecture.md`
- 문서 authority: `docs/README.md`
- branch와 release 승격: `docs/branch-release-workflow.md`
- format/engine 상태: 관련 `compatibility/*.json`
- normative contract: 관련 `specs/*.md`

## 저장소 책임

이 저장소가 소유하는 범위:

- local-first IFC와 admitted glTF/GLB reference source
- qualified E57/LAS/LAZ experimental point source
- BIM source snapshot, source-local identity, index와 bounded query
- generic 3D renderer, model tree, property/relation/search/section/measure
- standalone Browser와 VS Code BIM Explorer product shell
- host-neutral BIM Surface와 source-scoped handoff/anchor contract

이 저장소가 소유하지 않는 범위:

- 공용 Viewer Core/UI와 render protocol: `dwg-viewer`
- 저장소 외부의 canonical authoring identity, Agent authoring, revision/diff,
  reconcile과 accept/publish authority
- account, billing, entitlement issuance와 commercial operation

Viewer Core 또는 protocol 변경이 필요하면 공개 `dwg-viewer` 이슈를 생성하거나
갱신한다. 그 밖의 저장소 외부 consumer와 authority 변경은 이 저장소에서
구현하지 않는다. 공개 이슈가 필요하면 아래 공개 이슈 규칙에 따라 이 저장소만의
독립 요구사항으로 작성하며 현재 작업에서 다른 저장소 코드를 수정하지 않는다.

## 구현 규칙

- Explorer는 account나 별도 authoring 제품 없이 독립적으로 raw BIM을 열 수
  있어야 한다.
- source-local identity를 저장소 외부의 canonical authoring identity로
  승격하지 않는다.
- read-only source가 Agent change, revision 또는 publish authority를 갖는 것처럼
  만들지 않는다.
- 새 입력 형식·extension·codec은 명시적 size/resource bound, fail-closed
  negative test, cleanup과 compatibility manifest를 포함한다.
- Browser와 VS Code가 같은 source fingerprint와 contract를 사용하도록 한다.
- exact dependency version과 registry integrity를 유지한다.
- checked-in generated runtime은 소유 build script로만 갱신하고 `--check` 경로로
  재현성을 확인한다. 임시 `dist`, cache와 임의 evidence는 커밋하지 않는다.

## 공개 이슈 작성

이 저장소의 공개 이슈를 생성하거나 수정할 때 제목, 본문, 댓글, checklist,
첨부물과 log에 비공개 저장소명, 비공개 제품명, URL, 이슈·PR, commit, branch,
tag, package namespace, 내부 코드명과 roadmap을 기록하지 않는다.

비공개 요구에서 파생된 작업도 이 저장소가 독립적으로 소유하는 format,
source, renderer 또는 product 결과만 기술한다. public 이슈에 private origin,
dependency, backlink나 양쪽 관계를 적지 않으며, 교차 링크는 비공개 저장소
쪽에만 둔다. 비공개 맥락 없이 정확하게 설명할 수 없으면 공개 이슈를 만들거나
갱신하지 않는다.

## 로컬 개발과 검증

Node.js 24와 npm 11을 사용한다.

```bash
npm ci
npm run check
```

작업 중에는 관련 package test와 `package.json`의 해당 `qualify:*` 명령을 먼저
실행한다. Browser, VS Code, physical GPU, product-scale 또는 public fixture
지원 주장을 변경했다면 그 주장을 소유하는 qualification도 실행한다.

GitHub workflow 결과는 로컬 검사를 대체하지 않는다. 로컬에서 실행하지 못한
플랫폼 qualification은 통과로 간주하지 않고 완료 보고에 남긴다.

## 입력 자료, 라이선스와 배포

- 고객/private BIM, credential, private download URL, 로컬 경로와 proprietary
  fixture를 커밋하거나 공개 이슈에 첨부하지 않는다.
- public fixture는 redistribution 권리, 출처, checksum과 license를 확인한다.
- 구현은 기본적으로 MPL-2.0, `specs/`는 Apache-2.0 경계를 유지한다.
- 보안 취약점과 민감한 모델 발견은 `SECURITY.md`를 따른다.

일반 개발은 `dev`에서 수행한다. `dev`가 `prerelease`에 병합된 exact HEAD에서만
prerelease를 배포하고, `prerelease`가 `main`에 병합된 exact HEAD에서만 정식
release를 배포한다. `dev`에서 `main`으로 직접 승격하지 않는다. PR 생성,
미병합 종료, direct push, branch/tag 생성, 수동 workflow와 dry-run은 독립적인
배포 권한이 아니다. tag나 workflow가 배포 구현에 필요해도 앞선 병합으로
승인된 exact HEAD만 처리한다.

promotion 병합과 tag, GitHub release, package/VSIX, Marketplace 또는 Open VSX
게시는 사용자가 명시적으로 요청한 경우에만 수행한다. 긴급 수정도
`dev -> prerelease -> main` 순서를 따르며 세부 Gate는
`docs/branch-release-workflow.md`를 따른다.

## 완료 보고

수정 파일, 실행한 검사와 qualification, format/protocol/license 영향, 실행하지
못한 플랫폼 Gate, 생성·갱신한 교차 저장소 이슈를 보고한다.
