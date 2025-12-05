import type React from 'react'
import { useRef } from 'react'
import type { RiftboundCard } from '../../data/riftboundCards'
import type { CardKey } from '../../game/boardConfig'

export type InteractiveCardProps = {
  cardKey: CardKey
  card: RiftboundCard
  rotation: number
  isOwn: boolean
  onRotate: (key: CardKey, isOwn: boolean) => void
  onContextMenu: (
    key: CardKey,
    isOwn: boolean,
  ) => (e: React.MouseEvent<HTMLDivElement>) => void
  onHoverStart: (card: RiftboundCard, x: number, y: number) => void
  onHoverEnd: () => void
  onBeginDrag: (
    key: CardKey,
    card: RiftboundCard,
    rotation: number,
    x: number,
    y: number,
  ) => void
  draggingKey: CardKey | null
  /** optional extra layout styles for stacking (marginLeft etc.) */
  stackStyle?: React.CSSProperties
}

/**
 * InteractiveCard
 *
 * Handles:
 * - hover preview (big image on the side)
 * - click-to-rotate (left click, no drag)
 * - drag start (left click + move beyond threshold)
 * - right-click context menu (discard / send to deck)
 *
 * All board-level logic (moving between zones, animating ghost, etc.)
 * stays in GameBoardLayout.
 */
export function InteractiveCard({
  cardKey,
  card,
  rotation,
  isOwn,
  onRotate,
  onContextMenu,
  onHoverStart,
  onHoverEnd,
  onBeginDrag,
  draggingKey,
  stackStyle,
}: InteractiveCardProps) {
  const isDraggingThis = draggingKey === cardKey

  // --- click vs drag detection (no time-based delay) ---
  const isPressingRef = useRef(false)
  const dragStartedRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)

  const DRAG_THRESHOLD_PX = 4 // small movement before we treat it as a drag

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isOwn) return
    if (e.button !== 0) return // left click only

    isPressingRef.current = true
    dragStartedRef.current = false
    startPosRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isOwn) return
    if (e.button !== 0) return

    // If we never started a drag, treat as a click -> rotate
    if (!dragStartedRef.current) {
      onRotate(cardKey, isOwn)
    }

    isPressingRef.current = false
    dragStartedRef.current = false
    startPosRef.current = null
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isOwn) return
    if (!isPressingRef.current || dragStartedRef.current) return

    const start = startPosRef.current
    if (!start) return

    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const distanceSq = dx * dx + dy * dy

    if (distanceSq < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      return
    }

    // Movement exceeded threshold -> start drag immediately
    dragStartedRef.current = true
    onHoverEnd() // kill hover preview when we start dragging

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const startX = rect.left + rect.width / 2
    const startY = rect.top + rect.height / 2

    onBeginDrag(cardKey, card, rotation, startX, startY)
  }

  const handleMouseLeave = () => {
    // Stop hover when leaving. We still allow press+move outside
    // to continue dragging via the board-level handlers.
    onHoverEnd()
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const xRight = rect.right + 16 // preview to the right of the card
    const centerY = rect.top + rect.height / 2
    onHoverStart(card, xRight, centerY)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onContextMenu={onContextMenu(cardKey, isOwn)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        aspectRatio: '63 / 88',
        transform: `rotate(${rotation}deg)`,
        opacity: isDraggingThis ? 0 : 1,
        ...(stackStyle ?? {}),
      }}
      className={`rb-card relative z-10 w-auto overflow-visible rounded-md border border-amber-400/70 bg-slate-950 shadow-lg transition-transform duration-150 ease-out ${
        isOwn ? 'rb-card-own hover:scale-[1.03]' : 'rb-card-opponent opacity-90'
      }`}
    >
      <img
        src={card.images.large}
        alt={card.name}
        className="h-full w-full object-cover"
      />
    </div>
  )
}
