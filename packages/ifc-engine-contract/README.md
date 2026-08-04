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
GlobalId–Express ID map digest, mapped representation sharing, semantic
quantity/classification과 occurrence별 geometry bounds를 포함하므로 같은
engine/version/options/source 결과의 반복 실행이 동일해야 합니다.

`@bim-explorer/ifc-engine-contract/process-supervisor`는 native/WASM adapter
probe를 별도 process로 실행합니다. 환경 변수와 출력 크기를 제한하고,
timeout·취소·signal·비정상 종료를 구분하는 path-free receipt만 반환합니다.
stderr 내용과 실행 인자는 public error 또는 evidence에 포함하지 않습니다.

이 supervisor의 일반 process lifecycle 검증만으로 특정 IFC engine의
cancellation, 손상 입력 cleanup 또는 Browser Worker disposal 합격을
의미하지 않습니다. 별도 generated negative corpus qualification은 web-ifc의
explicit close/dispose와 IfcOpenShell의 process-exit 경계, 반복 거부와
정상 source recovery를 각각 검증합니다. 실행 중 동기 호출의 선점과 resource
exhaustion은 계속 별도 Gate입니다.
