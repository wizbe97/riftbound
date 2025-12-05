// src/components/cards/CardHoverPreview.tsx
import type { CardHoverPreviewState } from '../../hooks/useCardHoverPreview'

type CardHoverPreviewProps = {
  hover: CardHoverPreviewState
}

export function CardHoverPreview({ hover }: CardHoverPreviewProps) {
  if (!hover) return null

  return (
    <div
      className="pointer-events-none fixed z-40"
      style={{
        left: hover.x,
        top: hover.y,
        transform: 'translateY(-50%)',
      }}
    >
      <img
        src={hover.card.images.large}
        alt={hover.card.name}
        className="max-h-[70vh] max-w-[22rem] rounded-xl shadow-2xl"
      />
    </div>
  )
}
