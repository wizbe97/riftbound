// src/hooks/useStackedCardLayout.ts
import { useEffect, useRef, useState, type CSSProperties } from 'react'

export type StackedCardLayout = {
  // NOTE: allow null here so it's compatible with useRef<HTMLDivElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  getStyleForIndex: (index: number) => CSSProperties
}

/**
 * Given a number of cards, computes margin-left so cards don't overlap
 * until space runs out, then gradually overlap.
 *
 * Reusable for hand, piles, battlefield, etc.
 */
export function useStackedCardLayout(cardCount: number): StackedCardLayout {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState({
    containerWidth: 0,
    cardWidth: 0,
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const compute = () => {
      const rect = el.getBoundingClientRect()
      const cardEl = el.querySelector('.rb-card') as HTMLElement | null
      const cardRect = cardEl?.getBoundingClientRect()

      setLayout({
        containerWidth: rect.width,
        cardWidth: cardRect?.width ?? 0,
      })
    }

    compute()

    if (typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(() => compute())
    ro.observe(el)

    return () => {
      ro.disconnect()
    }
  }, [cardCount])

  const getStyleForIndex = (index: number): CSSProperties => {
    const { containerWidth, cardWidth } = layout
    const count = cardCount

    if (count <= 1 || !containerWidth || !cardWidth) {
      return index === 0 ? {} : { marginLeft: 8 }
    }

    const idealGap = 8 // px
    const idealSpacing = cardWidth + idealGap
    const maxSpacing = (containerWidth - cardWidth) / (count - 1)
    const spacing = Math.min(idealSpacing, maxSpacing)

    const marginLeft = index === 0 ? 0 : spacing - cardWidth
    return { marginLeft }
  }

  return { containerRef, getStyleForIndex }
}
