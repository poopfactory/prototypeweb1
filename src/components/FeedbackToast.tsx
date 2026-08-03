import { useEffect, useState } from 'react'
import './FeedbackToast.css'

interface FeedbackToastProps {
  feedback: { message: string; at: number } | null
}

export function FeedbackToast({ feedback }: FeedbackToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!feedback) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 1400)
    return () => clearTimeout(timer)
  }, [feedback])

  if (!feedback || !visible) return null

  return (
    <div className="feedback-toast" role="status" aria-live="polite">
      {feedback.message}
    </div>
  )
}
