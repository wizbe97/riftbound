// src/hooks/useCardPointerInteractions.ts
import type React from 'react'
import { useRef } from 'react'
import type { RiftboundCard } from '../data/riftboundCards'

export type CardPointerConfig<Key extends string | number> = {
  key: Key
  card: RiftboundCard
  isOwn: boolean
  rotation: number

  // Callbacks – optional, use what you need
  onRotate?: (key: Key) => void
  onBeginDrag?: (
    key: Key,
    card: RiftboundCard,
    rotation: number,
    startX: number,
    startY: number,
  ) => void
  onHoverStart?: (card: RiftboundCard, x: number, y: number) => void
  onHoverEnd?: () => void
  onContextMenu?: (key: Key, e: React.MouseEvent<HTMLDivElement>) => void

  /** How long to hold before we treat it as a drag (ms). Default: 150. */
  holdToDragDelayMs?: number
}

/**
 * Encapsulates click vs hold-to-drag, hover preview, and context-menu
 * behaviour for a single card.
 */
export function useCardPointerInteractions<Key extends string | number>(
  config: CardPointerConfig<Key>,
) {
  const {
    key,
    card,
    isOwn,
    rotation,
    onRotate,
    onBeginDrag,
    onHoverStart,
    onHoverEnd,
    onContextMenu,
    holdToDragDelayMs = 150,
  } = config

  const pressTimerRef = useRef<number | null>(null)
  const isPressingRef = useRef(false)
  const dragStartedRef = useRef(false)

  const clearPressTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isOwn) return
    if (e.button !== 0) return // left click only

    isPressingRef.current = true
    dragStartedRef.current = false
    clearPressTimer()

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const startX = rect.left + rect.width / 2
    const startY = rect.top + rect.height / 2

    if (!onBeginDrag) return

    pressTimerRef.current = window.setTimeout(() => {
      if (!isPressingRef.current) return
      dragStartedRef.current = true
      onHoverEnd?.()
      onBeginDrag(key, card, rotation, startX, startY)
    }, holdToDragDelayMs)
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isOwn) return
    if (e.button !== 0) return

    clearPressTimer()

    // If we never started a drag, treat as a click → rotate
    if (!dragStartedRef.current && onRotate) {
      onRotate(key)
    }

    isPressingRef.current = false
    dragStartedRef.current = false
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onHoverStart) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const xRight = rect.right + 16 // preview to the right
    const centerY = rect.top + rect.height / 2
    onHoverStart(card, xRight, centerY)
  }

  const handleMouseLeave = () => {
    onHoverEnd?.()
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isOwn || !onContextMenu) return
    e.preventDefault()
    onContextMenu(key, e)
  }

  return {
    handleMouseDown,
    handleMouseUp,
    handleMouseEnter,
    handleMouseLeave,
    handleContextMenu,
  }
}
