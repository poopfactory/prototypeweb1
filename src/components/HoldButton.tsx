import { useRef } from 'react'

interface HoldButtonProps {
  className?: string
  label: string
  pressedLabel?: string
  active?: boolean
  onPress: () => void
  onTap?: () => void
  onRelease: () => void
  disabled?: boolean
}

/**
 * A button that fires onPress on press-start and onRelease on press-end,
 * for simulating "hold to continuously adjust" gestures (volume, delay
 * mix, filter, speed) from mouse, touch, or keyboard alike.
 */
export function HoldButton({ className, label, pressedLabel, active, onPress, onTap, onRelease, disabled }: HoldButtonProps) {
  const isDown = useRef(false)

  const start = () => {
    if (disabled || isDown.current) return
    isDown.current = true
    onPress()
  }
  const end = () => {
    if (!isDown.current) return
    isDown.current = false
    onRelease()
    onTap?.()
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-pressed={!!active}
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start()
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') end()
      }}
    >
      {active && pressedLabel ? pressedLabel : label}
    </button>
  )
}
