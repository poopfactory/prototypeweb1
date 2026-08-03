# Tact — 웹캠 기반 웨어러블 뮤직 컨트롤러 (웹 프로토타입)

Tact는 양손 손목에 착용하는 팔찌형 뮤직 컨트롤 디바이스 컨셉입니다. 이 저장소는 실제 하드웨어 대신
**웹캠 + 손 추적(MediaPipe Hand Landmarker)** 으로 양손 핀치 제스처를 인식하고, 그 결과로
**Web Audio API**를 실시간 제어하여 재생·볼륨·리버브·딜레이·필터·피치/속도를 조작하는 **작동 가능한**
프로토타입입니다. 백엔드 없이 브라우저 안에서 모든 기능이 동작하며, 카메라 영상과 선택한 음원 파일은
브라우저 밖으로 전송되지 않습니다.

## 1. 빠른 시작

```bash
cd tact
npm install
npm run dev
```

터미널에 표시되는 `http://localhost:5173` 주소를 브라우저(Chrome/Edge 권장)로 엽니다.

- **최초 로딩 시 인터넷 연결이 필요합니다.** 손 추적 모델(MediaPipe wasm 런타임 + `hand_landmarker.task`
  모델 파일)을 CDN에서 1회 내려받아 브라우저 캐시에 저장한 뒤에는 완전히 오프라인으로도 추론이 동작합니다.
  카메라 프레임 자체는 어떤 서버로도 전송되지 않고 기기 안에서만 처리됩니다.
- 음원 파일이 없어도 하단의 **Demo Signal** 토글로 내장 신디사이저 톤을 재생해 이펙트를 바로 테스트할 수
  있고, 카메라가 없거나 권한이 거부된 환경에서도 **Keyboard Simulation** 토글과 각 기능 카드의 버튼/슬라이더로
  모든 기능을 그대로 테스트할 수 있습니다.
- 하단 바의 **TRACKS** 드롭다운에서 `public/tracks/`에 넣어둔 로컬 음원을 바로 선택해 재생할 수 있습니다.
  이 폴더는 저작권이 있는 개인 소장 음원을 위한 자리이므로 `.gitignore`에 포함되어 있어 저장소에 커밋되지
  않습니다 — 직접 이 프로토타입을 테스트할 mp3를 넣고 `src/audio/presetTracks.ts`에 한 줄 추가하면 됩니다.

### 사용 가능한 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 타입 체크(`tsc -b`) 후 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run test` | Vitest 단위 테스트 실행 (핀치 상태 머신, 정규화, 제스처 매핑) |
| `npm run lint` | oxlint 정적 분석 |

## 2. 카메라 권한 / HTTPS·localhost 요구사항

브라우저는 보안 컨텍스트(secure context)에서만 `getUserMedia` 카메라 접근을 허용합니다.

- **로컬 개발**: `http://localhost:5173`는 브라우저가 예외적으로 보안 컨텍스트로 취급하므로 별도 인증서
  없이 카메라 권한 요청이 정상 동작합니다.
- **다른 기기(같은 네트워크의 휴대폰 등)에서 접속**: `http://192.168.x.x:5173`처럼 `localhost`가 아닌
  주소로 접속하면 대부분의 브라우저가 카메라 접근을 차단합니다. 이 경우 `vite preview --host` 등을 HTTPS
  리버스 프록시(예: `mkcert` + `vite-plugin-mkcert`, 또는 `ngrok`) 뒤에 두고 접속해야 합니다.
- **배포 시**: 반드시 HTTPS로 서빙해야 카메라 권한 프롬프트가 나타납니다.
- 카메라 권한이 거부되거나 카메라가 없는 환경에서도 앱은 깨지지 않고, 화면에 안내 메시지를 표시한 뒤
  키보드/버튼 시뮬레이션 모드로 전환해 계속 사용할 수 있습니다.

## 3. 지원하는 제스처

엄지(손끝 4번)와 각 손가락 끝(검지 8 / 중지 12 / 약지 16 / 소지 20) 사이의 거리를 손바닥 크기로
정규화하여 핀치를 판정합니다. 카메라 화면은 보기 편하도록 좌우 반전되어 표시되지만, 손의 좌/우
판별(handedness)은 반전되지 않은 원본 프레임 기준으로 계산한 뒤 보정하므로 화면 위치와 무관하게 항상
해부학적으로 올바른 손을 인식합니다.

| 손 | 손가락(엄지+) | 동작 | 명령 |
| --- | --- | --- | --- |
| 왼손 | 검지 | 짧은 핀치 → 재생/일시정지 토글 | `PLAY_PAUSE` |
| 왼손 | 중지 | 핀치 유지 → 볼륨 점진 증가 (최대 100%) | `VOLUME_UP_START/END` |
| 왼손 | 약지 | 핀치 유지 → 볼륨 점진 감소 (최소 0%) | `VOLUME_DOWN_START/END` |
| 왼손 | 소지 | 미사용 (이번 버전) | – |
| 오른손 | 검지 | 짧은 핀치 → 리버브 On/Off (dry/wet 부드럽게 전환) | `REVERB_TOGGLE` |
| 오른손 | 중지 | 짧은 핀치 → 딜레이 On/Off, 핀치 유지 후 상하 이동 → wet mix 조절 | `DELAY_TOGGLE`, `DELAY_AMOUNT` |
| 오른손 | 약지 | 핀치 시작 지점 기준, 위/아래 이동 → 속도+피치 동시 변화 (0.75x~1.35x). **딜레이처럼 손을 놓아도 값이 그대로 유지**되며, 다시 핀치해 이어서 조절 | `SPEED_CHANGE` |
| 오른손 | 소지 | 핀치 시작 지점 기준, 위로 이동 → 하이패스 / 아래로 이동 → 로우패스. **딜레이처럼 손을 놓아도 값이 그대로 유지**되며, 다시 핀치해 이어서 조절 | `FILTER_CHANGE` |

오작동 방지를 위해 다음을 구현했습니다: 진입/해제 서로 다른 임계값(히스테리시스), 최소 유지 시간,
토글 디바운스/쿨다운, 3~5프레임 이동평균 스무딩, 손이 일시적으로 사라져도 값이 유지/안전 해제되는 처리,
같은 핀치 유지 중 토글이 반복되지 않는 rising-edge 판정. 민감도는 하단 바의 **Gesture Sensitivity**
슬라이더로 조절할 수 있습니다.

### 키보드 시뮬레이션 단축키 (Keyboard Simulation On 상태에서)

| 키 | 동작 | 키 | 동작 |
| --- | --- | --- | --- |
| `1` | Play/Pause | `Q` | Reverb Toggle |
| `2` (누르고 있기) | Volume Up | `W` | Delay Toggle |
| `3` (누르고 있기) | Volume Down | `T` | Speed → 빠르게 (그대로 유지) |
| `E` | Filter → High-pass (그대로 유지) | `G` | Speed → 느리게 (그대로 유지) |
| `R` | Filter → Low-pass (그대로 유지) | | |

왼쪽/오른쪽 패널의 각 기능 카드 자체도 클릭 가능한 버튼이며, Delay wet mix / Filter / Speed는 카드 안의
슬라이더로도 직접 조절할 수 있습니다. 모든 컨트롤에는 접근 가능한 라벨이 있고, 상태는 텍스트/아이콘으로도
함께 표시되어 색상에만 의존하지 않습니다.

## 4. 기술 구조

```
src/
  gesture/          손 추적과 무관한 순수 로직 (테스트 대상)
    types.ts             Landmark, Handedness, 손가락 인덱스 정의
    normalize.ts         거리 계산, 손바닥 크기 정규화, 좌표 스무딩(LandmarkSmoother)
    pinchStateMachine.ts 히스테리시스 + 최소 유지시간 + 쿨다운을 갖춘 핀치 상태 머신
    gestureMapper.ts     손별 4손가락 상태 머신을 소유하고 시맨틱 명령으로 변환

  commands/
    commandBus.ts        제스처/시뮬레이션이 공통으로 사용하는 타입 안전 pub/sub 명령 버스
                          (PLAY_PAUSE, VOLUME_UP_START 등 하드웨어 무관 명령 어휘)

  audio/
    AudioEngine.ts       Web Audio 그래프 구성 + 명령 처리 + tick() 기반 파라미터 램프
    AdaptiveAudio.ts     AnalyserNode 기반 "AI Adaptive Simulation" 휴리스틱
    impulseResponse.ts   리버브용 impulse response를 코드로 생성 (외부 음원 불필요)
    useAudioEngine.ts    AudioEngine을 React에 연결하는 훅

  handtracking/
    loadHandLandmarker.ts MediaPipe HandLandmarker 초기화/캐싱
    useHandTracking.ts    카메라 획득 + 프레임별 추론 + 스무딩 + 좌우 판정 보정 + 제스처 컨트롤러 구동
    handConnections.ts    스켈레톤 오버레이용 랜드마크 연결 정의

  state/
    useAppStore.ts        UI 상태(zustand): 민감도, 카메라 on/off, 튜토리얼, 데모 신호 등

  components/            카메라, 좌/우 패널, 하단 바, 튜토리얼, 시뮬레이션 컨트롤 등 UI 전용
```

손 추적은 카메라 프레임마다 `HandGestureController`(왼손/오른손 각 1개)를 갱신하고, 그 결과로 발생한
`PLAY_PAUSE`, `FILTER_CHANGE` 같은 **시맨틱 명령만** `CommandBus`에 실어 보냅니다. `AudioEngine`은
이 명령이 제스처에서 왔는지, 화면 버튼/키보드 시뮬레이션에서 왔는지 전혀 구분하지 않습니다 — 두 입력이
완전히 동일한 명령 어휘를 사용하기 때문입니다.

### 오디오 그래프

```
source(파일 또는 데모 톤) → 필터(고역/저역, 항상 in-series) → 딜레이 dry/wet 합성
  → 리버브 dry/wet 합성(Convolver + 생성된 impulse response) → 적응형 게인 보정
  → 마스터 볼륨 → 리미터(DynamicsCompressor) → 분석용 AnalyserNode → 스피커
```

딜레이 피드백은 항상 안전 범위로 고정되어 있고, 최종 출력단에는 항상 리미터가 걸려 있어 어떤 이펙트
조합에서도 출력이 과도하게 커지지 않습니다.

## 5. "AI Adaptive Simulation" 안내

**중요: 이 기능은 실제로 학습된 AI 모델이 아닙니다.** 화면에도 명시적으로 "AI Adaptive Simulation"이라고
표시됩니다. `AnalyserNode`로 현재 재생 중인 음원의 대략적인 음량(RMS)과 저역 에너지, 스펙트럼 분포를 읽어
다음과 같은 규칙 기반(rule-based) 보정을 프레임마다 적용하는 **시뮬레이션**입니다.

- 음원이 크거나 복잡할수록 리버브/딜레이의 wet 상한을 낮춤
- 저역 에너지가 강할 때 딜레이 피드백과 wet 상한을 추가로 억제
- 모든 보정값은 프레임 간 선형 보간(lerp)으로 스무딩되어 급격히 변하지 않음
- 이펙트로 인한 출력 레벨 차이를 상쇄하는 자동 게인 보정
- 모든 오디오 파라미터 변화는 `AudioParam.setTargetAtTime` 램프를 사용해 클릭/펑 소리 방지
- 최종 출력에는 항상 리미터(DynamicsCompressor)가 걸려 있음 (Adaptive 토글과 무관하게 항상 켜져 있는
  안전장치)

하단 바의 **AI Adaptive Simulation** 토글로 이 자동 보정 레이어만 켜고 끌 수 있습니다.

## 6. 브라우저별 제한 사항

- **손 추적(MediaPipe tasks-vision)**: 최신 Chrome, Edge에서 WASM+WebGL 백엔드로 가장 안정적으로
  동작합니다. Safari/iOS에서는 GPU delegate 지원이 불안정할 수 있어 자동으로 느려지거나 실패할 수
  있으며, 이 경우 화면에 오류가 표시되고 키보드/버튼 시뮬레이션으로 대체됩니다.
- **`playbackRate` + pitch 비보존**: 속도/피치 연동 효과를 위해 `HTMLMediaElement.preservesPitch`
  (및 벤더 접두사 `mozPreservesPitch`, `webkitPreservesPitch`)를 명시적으로 `false`로 설정합니다.
  이 속성을 지원하지 않는 아주 오래된 브라우저에서는 브라우저 기본값(피치 보존)이 적용되어 DJ 스타일
  효과가 약해질 수 있습니다.
- **모바일 브라우저의 카메라 해상도/프레임레이트**: 기기 성능에 따라 추적 FPS가 낮아질 수 있습니다.
  화면 상단의 FPS 표시로 확인할 수 있습니다.
- **AudioContext 자동 재생 정책**: 대부분의 브라우저는 사용자 제스처(클릭) 없이 오디오 재생을 차단합니다.
  Play 버튼을 누르면 자동으로 `AudioContext.resume()`을 호출하며, 컨텍스트가 `suspended` 상태이면
  화면에 재개 배너가 표시됩니다.

## 7. 실제 Tact 하드웨어 연동 시 교체할 계층

이 프로토타입은 처음부터 **입력 계층을 하드웨어와 무관하게 분리**해 두었습니다. 실제 팔찌형 센서(예:
IMU + 정전용량 터치 또는 근접 센서)로 교체할 때 손댈 곳은 다음과 같습니다.

1. **`src/handtracking/*`** — 이 디렉터리 전체가 카메라/MediaPipe 기반 입력입니다. 실제 하드웨어에서는
   BLE/USB로 들어오는 센서 스트림을 파싱하는 모듈로 통째로 대체됩니다.
2. **`src/gesture/gestureMapper.ts`** — `HandGestureController.update(landmarks, now)`가 받는
   `landmarks`(21개 포인트) 대신, 하드웨어가 보내는 "핀치 강도/접촉 여부" 같은 값을 같은 인터페이스로
   `PinchStateMachine.update(ratio, now)`에 넣어주기만 하면 나머지 로직(히스테리시스, 디바운스,
   좌/우 매핑)은 그대로 재사용할 수 있습니다.
3. **`src/commands/commandBus.ts`** — 여기서부터 `AudioEngine`까지는 완전히 입력 방식과 무관합니다.
   `PLAY_PAUSE`, `FILTER_CHANGE` 같은 시맨틱 명령만 동일하게 `bus.emit(...)`으로 보내면, 화면
   시뮬레이션 버튼이 이미 증명하듯 오디오 엔진은 아무 수정 없이 그대로 동작합니다.

즉, 하드웨어 연동은 "새 입력 어댑터를 만들어 `CommandBus`에 같은 명령을 보내는 것"으로 요약됩니다.

## 8. 테스트

```bash
npm run test
```

`src/gesture/*.test.ts`에 가짜(fake) 랜드마크 데이터를 사용한 단위 테스트 31개가 있습니다.

- `normalize.test.ts`: 손바닥 크기 정규화, 카메라 거리 불변성, 좌표 스무딩
- `pinchStateMachine.test.ts`: 히스테리시스, 최소 유지 시간, 토글 디바운스/쿨다운, 손이 사라졌을 때의
  안전한 유지/해제, rising-edge 판정
- `gestureMapper.test.ts`: 왼손/오른손 명령 매핑이 서로 섞이지 않는지, 데드존, 손이 사라졌을 때
  `DELAY_AMOUNT` 같은 연속 값이 멈추는지 등 통합 시나리오

빌드와 타입 체크는 `npm run build`(`tsc -b && vite build`)로 함께 검증됩니다.

## 9. 검증 체크리스트

아래 항목은 구현 후 직접 확인했습니다.

- [x] 왼손/오른손이 화면상 좌우 위치와 무관하게 항상 올바른 기능에 매핑됨 (원본 미러링되지 않은 프레임
      기준으로 handedness를 계산 후 보정)
- [x] 핀치를 유지해도 토글이 반복 실행되지 않음 (rising-edge, 단위 테스트로 검증)
- [x] 손이 잠시 사라져도 볼륨/딜레이 wet 등 연속 값이 즉시 변하지 않고 유지됨 (단위 테스트로 검증)
- [x] 여러 손가락이 동시에 가까워져도 각 손가락별 독립된 상태 머신 + 쿨다운으로 과도한 명령 발생을 억제
- [x] 오디오 파일을 여러 번 교체해도 이전 `MediaElementAudioSourceNode`/Object URL을 정리한 뒤 새로
      연결 (`AudioEngine.teardownFileSource`)
- [x] 카메라를 껐다 켜도 스트림을 정리 후 재요청하여 정상 복구
- [x] 데스크톱/모바일 반응형 레이아웃 (980px 이하에서 1열 스택)
- [x] `npm run build`(타입 체크 포함), `npm run test`, `npm run lint` 모두 통과 — 실제 브라우저에서
      데모 신호 재생, Reverb/Delay/Filter/Speed 토글 및 슬라이더, 키보드 시뮬레이션까지 수동으로 조작해
      Web Audio 그래프가 실제로 반응하는 것을 확인

## 10. 개인정보 안내

카메라 영상은 브라우저 안에서만 처리되며 어떤 서버에도 업로드되거나 저장되지 않습니다. 선택한 음원
파일도 로컬 재생에만 사용됩니다. 앱 하단에 항상 이 안내 문구가 표시됩니다.
