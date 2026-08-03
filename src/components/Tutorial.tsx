import { useAppStore } from '../state/useAppStore'
import './Tutorial.css'

const STEPS = [
  {
    title: '1. 카메라 권한 허용',
    body: '브라우저가 카메라 접근을 요청하면 허용해주세요. 영상은 기기 안에서만 처리되고 저장되거나 전송되지 않습니다.',
  },
  {
    title: '2. 양손을 카메라 안에 보여주기',
    body: '카메라 화면 안에 양손이 모두 보이도록 위치를 조정하세요. 각 손 위에 L(왼손) 또는 R(오른손) 라벨이 표시됩니다.',
  },
  {
    title: '3. 핀치 캘리브레이션',
    body: '엄지와 검지를 짧게 맞닿아 보세요. 손가락 사이에 색이 채워진 원이 나타나면 핀치가 인식된 것입니다. 하단의 Gesture Sensitivity 슬라이더로 민감도를 조절할 수 있습니다.',
  },
  {
    title: '4. 왼손 / 오른손 기능',
    body: '왼손은 재생·볼륨(엄지+검지=재생/일시정지, 엄지+중지=볼륨업, 엄지+약지=볼륨다운)을 담당합니다. 오른손은 이펙트(엄지+검지=리버브, 엄지+중지=딜레이, 엄지+약지=피치/속도, 엄지+소지=필터)를 담당합니다. 피치/속도와 필터는 딜레이처럼 손을 놓아도 값이 그대로 유지되니, 다시 핀치해서 이어서 조절하면 됩니다.',
  },
  {
    title: '5. 오디오 선택 후 시작',
    body: '하단의 "Choose audio file"로 로컬 음원을 선택하거나, 음원이 없다면 "Demo Signal"을 켜서 바로 제스처를 테스트해보세요.',
  },
]

export function Tutorial() {
  const tutorialOpen = useAppStore((s) => s.tutorialOpen)
  const step = useAppStore((s) => s.tutorialStep)
  const setStep = useAppStore((s) => s.setTutorialStep)
  const close = useAppStore((s) => s.closeTutorial)

  if (!tutorialOpen) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-label="Tact 온보딩 튜토리얼">
      <div className="tutorial-card">
        <div className="tutorial-card__progress">
          {STEPS.map((s, i) => (
            <span key={s.title} className={`tutorial-card__dot ${i === step ? 'tutorial-card__dot--active' : ''}`} />
          ))}
        </div>
        <h2>{current.title}</h2>
        <p>{current.body}</p>
        <div className="tutorial-card__actions">
          <button type="button" className="tutorial-card__ghost" onClick={close}>
            건너뛰기
          </button>
          <div className="tutorial-card__nav">
            {step > 0 && (
              <button type="button" className="tutorial-card__ghost" onClick={() => setStep(step - 1)}>
                이전
              </button>
            )}
            <button type="button" className="tutorial-card__primary" onClick={() => (isLast ? close() : setStep(step + 1))}>
              {isLast ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
