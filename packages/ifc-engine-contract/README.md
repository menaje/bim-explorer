# IFC engine contract

IfcOpenShell과 web-ifc가 같은 qualification report를 출력하도록 하는
engine-neutral 계약입니다.

이 package는 IFC engine object나 source path를 노출하지 않습니다. report는
source digest, semantic/geometry 관찰값, capability 상태, 성능 측정값과
cleanup receipt만 포함합니다.

Capability 상태의 의미:

- `native`: engine이 해당 의미를 직접 제공하고 fixture assertion을 통과
- `mapped`: engine 결과를 손실 없이 공통 계약으로 정규화
- `opaque`: 원본 식별자나 payload만 보존하고 의미를 해석하지 않음
- `lossy`: 알려진 정보 손실이 있음
- `blocked`: 미구현, 미검증 또는 release Gate 때문에 사용하지 않음

Fingerprint는 시간·메모리·diagnostic을 제외한 안정 projection으로 계산합니다.
따라서 같은 engine/version/options/source 결과의 반복 실행이 동일해야 합니다.
