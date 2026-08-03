import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export interface DragPosition {
  x: number
  y: number
}

/**
 * Minimal pointer-drag helper for a `position: fixed` panel. Starts
 * anchored wherever CSS places it (no inline position) until the user
 * drags it once, after which position is tracked in pixels and clamped
 * to stay fully on-screen.
 */
export function useDraggable(margin = 8) {
  const [position, setPosition] = useState<DragPosition | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top }
    panel.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || !panel || drag.pointerId !== e.pointerId) return

    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const w = panel.offsetWidth
    const h = panel.offsetHeight

    const x = clamp(drag.originX + dx, margin, window.innerWidth - w - margin)
    const y = clamp(drag.originY + dy, margin, window.innerHeight - h - margin)
    setPosition({ x, y })
  }, [margin])

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
    panelRef.current?.releasePointerCapture(e.pointerId)
  }, [])

  return { panelRef, position, dragHandlers: { onPointerDown, onPointerMove, onPointerUp } }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
