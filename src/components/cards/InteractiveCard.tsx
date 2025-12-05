import React, { useEffect, useRef, useState } from 'react'
import type { RiftboundCard } from '../../data/riftboundCards'

export type CardInteractionIntent =
  | { type: 'rotate'; cardKey: string }
  | {
      type: 'dragStart'
      cardKey: string
      card: RiftboundCard
      rotation: number
      x: number
      y: number
    }
  | { type: 'contextDiscard'; cardKey: string }
  | { type: 'contextToDeck'; cardKey: string }

export type CardInteractionRules = {
  canRotate: boolean
  canDrag: boolean
  canContextMenu: boolean
  canDiscard: boolean
  canSendToDeck: boolean
}

type InteractiveCardProps = {
  cardKey: string
  card: RiftboundCard
  /** Current zone id, just for data/debug attributes */
  zoneId: string
  /** Is this card controlled by the local player? */
  isOwn: boolean
  /** Current rotation (0 or 90) from the board state */
  rotation: number
  /** Key of the card currently being dragged (for ghost/opacity toggling) */
  draggingKey?: string
  /** Extra inline styles used for stacking layout (marginLeft, etc.) */
  stackStyle?: React.CSSProperties
  /** Allows the board to configure what this card is allowed to do */
  interactionRules: CardInteractionRules
  /** High-level interaction callback (rotate / dragStart / context actions) */
  onInteraction: (intent: CardInteractionIntent) => void
  /** Global hover preview handlers (board owns the preview overlay) */
  onHoverStart: (card: RiftboundCard, x: number, y: number) => void
  onHoverEnd: () => void
  /** Optional: enable hover wobble/scale for own cards */
  wobble?: boolean
}

/**
 * Single interactive card:
 * - All card-level interaction lives here:
 *   - click => rotate (if allowed)
 *   - drag => emitted as dragStart as soon as the mouse moves past a small threshold
 *   - right-click => per-card context menu (discard / send to deck) with rules
 *   - hover => preview hooks
 *
 * It does NOT know about Firestore or zones; it only emits interaction intents upwards.
 */
export function InteractiveCard({
  cardKey,
  card,
  zoneId,
  isOwn,
  rotation,
  draggingKey,
  stackStyle,
  interactionRules,
  onInteraction,
  onHoverStart,
  onHoverEnd,
  wobble,
}: InteractiveCardProps) {
  const isDraggingThis = draggingKey === cardKey

  // Click vs drag detection
  const isPressingRef = useRef(false)
  const dragStartedRef = useRef(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)

  // We attach a temporary window mousemove listener while deciding click vs drag
  const moveListenerRef = useRef<((e: MouseEvent) => void) | null>(null)

  // Simple per-card context menu
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const detachMoveListener = () => {
    if (moveListenerRef.current) {
      window.removeEventListener('mousemove', moveListenerRef.current)
      moveListenerRef.current = null
    }
  }

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      detachMoveListener()
    }
  }, [])

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!menuOpen) return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!menuRef.current) return
      if (target && menuRef.current.contains(target)) {
        // Click is inside the menu – ignore.
        return
      }
      setMenuOpen(false)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const DRAG_THRESHOLD = 4 // px – small movement before we treat it as drag

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isOwn) return
    if (e.button !== 0) return // left click only

    isPressingRef.current = true
    dragStartedRef.current = false
    startXRef.current = e.clientX
    startYRef.current = e.clientY

    // If this card cannot drag, we don't start the drag-detection listener
    if (!interactionRules.canDrag) return

    const handleMoveWhileDeciding = (ev: MouseEvent) => {
      if (!isPressingRef.current || dragStartedRef.current) return

      const dx = ev.clientX - startXRef.current
      const dy = ev.clientY - startYRef.current
      const distSq = dx * dx + dy * dy

      if (distSq >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
        // This is now a drag, not a click.
        dragStartedRef.current = true
        onHoverEnd()

        onInteraction({
          type: 'dragStart',
          cardKey,
          card,
          rotation,
          // Start the ghost exactly under the cursor
          x: ev.clientX,
          y: ev.clientY,
        })

        // Once we've promoted to drag, we don't need this listener anymore.
        detachMoveListener()
      }
    }

    // Attach the decision listener for this press.
    moveListenerRef.current = handleMoveWhileDeciding
    window.addEventListener('mousemove', handleMoveWhileDeciding)
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isOwn) return
    if (e.button !== 0) return

    // Release the decision listener regardless
    detachMoveListener()

    // If we never started a drag, treat as a click => rotate (if allowed)
    if (!dragStartedRef.current && interactionRules.canRotate) {
      onInteraction({
        type: 'rotate',
        cardKey,
      })
    }

    isPressingRef.current = false
    dragStartedRef.current = false
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const xRight = rect.right + 16 // preview appears to the right
    const centerY = rect.top + rect.height / 2
    onHoverStart(card, xRight, centerY)
  }

  const handleMouseLeave = () => {
    onHoverEnd()
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    // Always suppress the browser context menu on cards.
    e.preventDefault()

    if (!isOwn || !interactionRules.canContextMenu) return
    // If there are no actions, don't open a tiny empty menu.
    if (!interactionRules.canDiscard && !interactionRules.canSendToDeck) return

    const { clientX, clientY } = e

    // Clamp menu into viewport to avoid off-screen / scroll weirdness.
    const viewportWidth =
      typeof window !== 'undefined' ? window.innerWidth : 1920
    const viewportHeight =
      typeof window !== 'undefined' ? window.innerHeight : 1080

    // Rough menu size estimates (we just need "good enough" to keep it on-screen).
    const hasTwoOptions =
      interactionRules.canDiscard && interactionRules.canSendToDeck
    const estimatedMenuWidth = 200
    const estimatedMenuHeight = hasTwoOptions ? 64 : 36

    const margin = 8

    const x = Math.max(
      margin,
      Math.min(clientX, viewportWidth - estimatedMenuWidth - margin),
    )
    const y = Math.max(
      margin,
      Math.min(clientY, viewportHeight - estimatedMenuHeight - margin),
    )

    setMenuPos({ x, y })
    setMenuOpen(true)
  }

  const handleMenuClick = (action: 'discard' | 'toDeck') => {
    if (action === 'discard' && interactionRules.canDiscard) {
      onInteraction({ type: 'contextDiscard', cardKey })
    } else if (action === 'toDeck' && interactionRules.canSendToDeck) {
      onInteraction({ type: 'contextToDeck', cardKey })
    }
    setMenuOpen(false)
  }

  const baseClasses =
    'rb-card relative z-10 w-auto overflow-visible rounded-md border border-amber-400/70 bg-slate-950 shadow-lg transition-transform duration-150 ease-out'
  const ownershipClasses = isOwn
    ? wobble
      ? 'rb-card-own hover:scale-[1.03]'
      : 'rb-card-own'
    : 'rb-card-opponent opacity-90'

  return (
    <>
      <div
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        style={{
          aspectRatio: '63 / 88',
          transform: `rotate(${rotation}deg)`,
          opacity: isDraggingThis ? 0 : 1,
          ...(stackStyle ?? {}),
        }}
        className={`${baseClasses} ${ownershipClasses}`}
        data-zone={zoneId}
      >
        <img
          src={card.images.large}
          alt={card.name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>

      {menuOpen && menuPos && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl"
          style={{ top: menuPos.y, left: menuPos.x }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {interactionRules.canDiscard && (
            <button
              type="button"
              onClick={() => handleMenuClick('discard')}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-100 hover:bg-slate-800"
            >
              Discard
            </button>
          )}
          {interactionRules.canSendToDeck && (
            <button
              type="button"
              onClick={() => handleMenuClick('toDeck')}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-100 hover:bg-slate-800"
            >
              Send to bottom of deck
            </button>
          )}
        </div>
      )}
    </>
  )
}
