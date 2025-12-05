// src/hooks/useCardHoverPreview.ts
import { useEffect, useState } from 'react'
import type { RiftboundCard } from '../data/riftboundCards'

export type CardHoverPreviewState = {
  card: RiftboundCard
  x: number
  y: number
} | null

export function useCardHoverPreview(disabled: boolean = false) {
  const [hover, setHover] = useState<CardHoverPreviewState>(null)

  useEffect(() => {
    if (disabled) setHover(null)
  }, [disabled])

  const handleHoverStart = (
    card: RiftboundCard,
    x: number,
    yCenter: number,
  ) => {
    if (disabled) return

    // SSR / tests safeguard
    if (typeof window === 'undefined') {
      setHover({ card, x, y: yCenter })
      return
    }

    const margin = 8
    const viewportH = window.innerHeight || 800
    const maxPreviewH = viewportH * 0.7
    const half = maxPreviewH / 2

    let centerY = yCenter

    if (centerY - half < margin) {
      centerY = margin + half
    }
    if (centerY + half > viewportH - margin) {
      centerY = viewportH - margin - half
    }

    setHover({ card, x, y: centerY })
  }

  const handleHoverEnd = () => setHover(null)

  return { hover, handleHoverStart, handleHoverEnd }
}
