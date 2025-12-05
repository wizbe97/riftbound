import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { RiftboundCard } from '../../data/riftboundCards'
import { useStackedCardLayout } from '../../hooks/useStackedCardLayout'
import { useCardHoverPreview } from '../../hooks/useCardHoverPreview'
import {
    InteractiveCard,
    type CardInteractionIntent,
    type CardInteractionRules,
} from '../cards/InteractiveCard'
import { CardHoverPreview } from '../cards/CardHoverPreview'

/* ------------------------------------------------------------------ */
/* Types exported for page + other consumers                          */
/* ------------------------------------------------------------------ */

export type Role = 'p1' | 'p2' | 'spectator' | 'none'

export type CardKey = 'p1Legend' | 'p1Champion' | 'p2Legend' | 'p2Champion'

export const CARD_KEYS: CardKey[] = [
    'p1Legend',
    'p1Champion',
    'p2Legend',
    'p2Champion',
]

export type BoardZoneId =
    | 'p1LegendZone'
    | 'p1ChampionZone'
    | 'p1Base'
    | 'p1RuneChannel'
    | 'p1RuneDeck'
    | 'p1Discard'
    | 'p1Deck'
    | 'p2LegendZone'
    | 'p2ChampionZone'
    | 'p2Base'
    | 'p2RuneChannel'
    | 'p2RuneDeck'
    | 'p2Discard'
    | 'p2Deck'
    | 'battlefieldLeftP1'
    | 'battlefieldLeftP2'
    | 'battlefieldRightP1'
    | 'battlefieldRightP2'

export type BoardCardPlacement = {
    zoneId: BoardZoneId
    rotation: number // 0 or 90
}

export type BoardState = Record<CardKey, BoardCardPlacement>

export const DEFAULT_BOARD_STATE: BoardState = {
    p1Legend: { zoneId: 'p1LegendZone', rotation: 0 },
    p1Champion: { zoneId: 'p1ChampionZone', rotation: 0 },
    p2Legend: { zoneId: 'p2LegendZone', rotation: 0 },
    p2Champion: { zoneId: 'p2ChampionZone', rotation: 0 },
}

/** Zones a given role is allowed to drop into */
const OWN_ZONES: Record<'p1' | 'p2', BoardZoneId[]> = {
    p1: [
        'p1LegendZone',
        'p1ChampionZone',
        'p1Base',
        'p1RuneChannel',
        'p1RuneDeck',
        'p1Discard',
        'p1Deck',
        'battlefieldLeftP1',
        'battlefieldRightP1',
    ],
    p2: [
        'p2LegendZone',
        'p2ChampionZone',
        'p2Base',
        'p2RuneChannel',
        'p2RuneDeck',
        'p2Discard',
        'p2Deck',
        'battlefieldLeftP2',
        'battlefieldRightP2',
    ],
}

const PILE_ZONES: BoardZoneId[] = ['p1Discard', 'p1Deck', 'p2Discard', 'p2Deck']

export const isPileZone = (zoneId: BoardZoneId): boolean =>
    PILE_ZONES.includes(zoneId)

const canRoleUseZone = (role: Role, zoneId: BoardZoneId): boolean => {
    if (role !== 'p1' && role !== 'p2') return false
    return OWN_ZONES[role].includes(zoneId)
}

/**
 * Centralized rotation rule when moving cards between zones.
 * - If override specified → use that.
 * - If pile zone → force upright (0°).
 * - Otherwise 0° → 90°, else keep as-is.
 */
export const getNextRotationForZone = (
    previousRotation: number,
    zoneId: BoardZoneId,
    rotationOverride?: number,
): number => {
    if (typeof rotationOverride === 'number') return rotationOverride
    if (isPileZone(zoneId)) return 0
    return previousRotation === 0 ? 90 : previousRotation
}

/* ------------------------------------------------------------------ */
/* Board layout                                                       */
/* ------------------------------------------------------------------ */

type BoardCardInstance = {
    key: CardKey
    card: RiftboundCard | null
    zoneId: BoardZoneId
    rotation: number
    isOwn: boolean
}

export type MatchGameBoardProps = {
    viewerIsP1: boolean
    viewerRole: Role
    topName?: string
    bottomName?: string
    boardState: BoardState
    cardsByKey: Record<CardKey, RiftboundCard | null>
    onMoveCard: (
        key: CardKey,
        zone: BoardZoneId,
        rotationOverride?: number,
    ) => void
    onRotateCard: (key: CardKey) => void
}

/* Drag state – same behaviour as before refactor */

type DragPhase = 'dragging' | 'animatingToSlot'

type DragState = {
    key: CardKey
    card: RiftboundCard
    x: number
    y: number
    fromRotation: number
    toRotation: number
    targetX?: number
    targetY?: number
    phase: DragPhase
} | null

type CardInteractionHandler = (intent: CardInteractionIntent) => void
type InteractionRulesResolver = (inst: BoardCardInstance) => CardInteractionRules

/* ------------------------------------------------------------------ */
/* Main board component                                               */
/* ------------------------------------------------------------------ */

export function MatchGameBoard({
    viewerIsP1,
    viewerRole,
    boardState,
    cardsByKey,
    onMoveCard,
    onRotateCard,
}: MatchGameBoardProps) {
    const [drag, setDrag] = useState<DragState>(null)
    // Hover preview is disabled while dragging
    const { hover, handleHoverStart, handleHoverEnd } = useCardHoverPreview(
        !!drag,
    )

    const allCards: BoardCardInstance[] = useMemo(() => {
        return CARD_KEYS.map((key) => {
            const placement = boardState[key] ?? DEFAULT_BOARD_STATE[key]
            const card = cardsByKey[key] ?? null
            const isOwn =
                viewerRole === 'p1'
                    ? key.startsWith('p1')
                    : viewerRole === 'p2'
                        ? key.startsWith('p2')
                        : false

            return {
                key,
                card,
                zoneId: placement.zoneId,
                rotation: placement.rotation ?? 0,
                isOwn,
            }
        })
    }, [boardState, cardsByKey, viewerRole])

    const setDraggingCursor = (active: boolean) => {
        if (typeof document === 'undefined') return
        document.body.classList.toggle('rb-dragging-cursor', active)
    }

    // NEW: no card-type rules anymore – every own card can be right-clicked.
    const getInteractionRulesForInstance: InteractionRulesResolver = (
        inst: BoardCardInstance,
    ): CardInteractionRules => {
        const inPile = isPileZone(inst.zoneId)

        if (!inst.isOwn) {
            return {
                canRotate: false,
                canDrag: false,
                canContextMenu: false,
                canDiscard: false,
                canSendToDeck: false,
            }
        }

        return {
            canRotate: !inPile, // still keep "no rotation in piles" as a zone rule
            canDrag: true,
            canContextMenu: true,
            canDiscard: true,
            canSendToDeck: true,
        }
    }

    const getOwnerFromCardKey = (key: CardKey): 'p1' | 'p2' =>
        key.startsWith('p1') ? 'p1' : 'p2'

    const getDiscardZoneForCard = (key: CardKey): BoardZoneId =>
        getOwnerFromCardKey(key) === 'p1' ? 'p1Discard' : 'p2Discard'

    const getDeckZoneForCard = (key: CardKey): BoardZoneId =>
        getOwnerFromCardKey(key) === 'p1' ? 'p1Deck' : 'p2Deck'

    const handleCardInteraction: CardInteractionHandler = (
        intent: CardInteractionIntent,
    ) => {
        const key = intent.cardKey as CardKey

        switch (intent.type) {
            case 'rotate':
                onRotateCard(key)
                return

            case 'dragStart':
                setDrag({
                    key,
                    card: intent.card,
                    x: intent.x,
                    y: intent.y,
                    fromRotation: intent.rotation,
                    toRotation: intent.rotation,
                    phase: 'dragging',
                })
                handleHoverEnd()
                setDraggingCursor(true)
                return

            case 'contextDiscard': {
                const zoneId = getDiscardZoneForCard(key)
                onMoveCard(key, zoneId)
                return
            }

            case 'contextToDeck': {
                // No more rune-specific logic: always send to the main deck for that player.
                const zoneId = getDeckZoneForCard(key)
                onMoveCard(key, zoneId)
                return
            }
        }
    }

    // Global mousemove while dragging for real-time tracking.
    useEffect(() => {
        if (!drag || drag.phase !== 'dragging') return

        const handleMove = (e: MouseEvent) => {
            if (e.clientX === 0 && e.clientY === 0) return
            setDrag((prev) =>
                prev && prev.phase === 'dragging'
                    ? {
                        ...prev,
                        x: e.clientX,
                        y: e.clientY,
                    }
                    : prev,
            )
        }

        const handleUp = () => {
            setDrag((prev) => {
                if (!prev || prev.phase !== 'dragging') return prev
                return null
            })
            setDraggingCursor(false)
        }

        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mouseup', handleUp)

        return () => {
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
        }
    }, [drag])

    const handleCardEndDragCancel = () => {
        if (!drag) return
        setDrag(null)
        setDraggingCursor(false)
    }

    const cardsInZone = (zoneId: BoardZoneId) =>
        allCards.filter((c) => c.zoneId === zoneId && c.card)

    const handleZoneMouseUp = (
        zoneId: BoardZoneId,
        e: React.MouseEvent<HTMLDivElement>,
    ) => {
        e.stopPropagation()
        if (!drag || drag.phase !== 'dragging') return

        const key = drag.key

        // Only allow dropping into zones this role owns
        if (!canRoleUseZone(viewerRole, zoneId)) {
            handleCardEndDragCancel()
            return
        }

        const cardInstance = allCards.find((c) => c.key === key)
        if (!cardInstance || !cardInstance.isOwn || !cardInstance.card) {
            handleCardEndDragCancel()
            return
        }

        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const targetX = rect.left + rect.width / 2
        const targetY = rect.top + rect.height / 2

        const currentRotation = cardInstance.rotation
        const nextRotation = getNextRotationForZone(currentRotation, zoneId)

        // Animate ghost from current position to slot center + rotate
        setDrag((prev): DragState => {
            if (!prev || prev.key !== key) return prev
            return {
                ...prev,
                phase: 'animatingToSlot',
                targetX,
                targetY,
                fromRotation: currentRotation,
                toRotation: nextRotation,
            }
        })

        setDraggingCursor(false)

        // Commit move immediately so logical state + real card rotation update now
        onMoveCard(key, zoneId, nextRotation)

        // Clear ghost shortly after animation
        window.setTimeout(() => {
            setDrag((prev) => {
                if (!prev || prev.key !== key) return prev
                return null
            })
        }, 160)
    }

    // Map physical zones -> top/bottom rows depending on POV
    const topZones = viewerIsP1
        ? {
            runeDeck: 'p2RuneDeck' as BoardZoneId,
            runeChannel: 'p2RuneChannel' as BoardZoneId,
            base: 'p2Base' as BoardZoneId,
            legend: 'p2LegendZone' as BoardZoneId,
            champion: 'p2ChampionZone' as BoardZoneId,
            discard: 'p2Discard' as BoardZoneId,
            deck: 'p2Deck' as BoardZoneId,
            bfLeftTop: 'battlefieldLeftP2' as BoardZoneId,
            bfLeftBottom: 'battlefieldLeftP1' as BoardZoneId,
            bfRightTop: 'battlefieldRightP2' as BoardZoneId,
            bfRightBottom: 'battlefieldRightP1' as BoardZoneId,
        }
        : {
            runeDeck: 'p1RuneDeck' as BoardZoneId,
            runeChannel: 'p1RuneChannel' as BoardZoneId,
            base: 'p1Base' as BoardZoneId,
            legend: 'p1LegendZone' as BoardZoneId,
            champion: 'p1ChampionZone' as BoardZoneId,
            discard: 'p1Discard' as BoardZoneId,
            deck: 'p1Deck' as BoardZoneId,
            bfLeftTop: 'battlefieldLeftP1' as BoardZoneId,
            bfLeftBottom: 'battlefieldLeftP2' as BoardZoneId,
            bfRightTop: 'battlefieldRightP1' as BoardZoneId,
            bfRightBottom: 'battlefieldRightP2' as BoardZoneId,
        }

    const bottomZones = viewerIsP1
        ? {
            runeDeck: 'p1RuneDeck' as BoardZoneId,
            runeChannel: 'p1RuneChannel' as BoardZoneId,
            base: 'p1Base' as BoardZoneId,
            legend: 'p1LegendZone' as BoardZoneId,
            champion: 'p1ChampionZone' as BoardZoneId,
            discard: 'p1Discard' as BoardZoneId,
            deck: 'p1Deck' as BoardZoneId,
        }
        : {
            runeDeck: 'p2RuneDeck' as BoardZoneId,
            runeChannel: 'p2RuneChannel' as BoardZoneId,
            base: 'p2Base' as BoardZoneId,
            legend: 'p2LegendZone' as BoardZoneId,
            champion: 'p2ChampionZone' as BoardZoneId,
            discard: 'p2Discard' as BoardZoneId,
            deck: 'p2Deck' as BoardZoneId,
        }

    const draggingKey = drag?.key ?? null

    const handleBoardMouseUp = () => {
        // Mouse released in board but not over a zone -> cancel drag
        if (drag && drag.phase === 'dragging') {
            handleCardEndDragCancel()
        }
    }

    const currentGhostRotation =
        drag?.phase === 'animatingToSlot' ? drag.toRotation : drag?.fromRotation

    return (
        <div
            className="rb-game-board relative flex h-full flex-col justify-center gap-5 rounded-xl bg-slate-950/80 px-4 py-2"
            onMouseUp={handleBoardMouseUp}
        >
            {/* TOP ROW */}
            <div className="flex items-stretch gap-5">
                <PlayerRow
                    orientation="top"
                    runeDeckZone={topZones.runeDeck}
                    runeChannelZone={topZones.runeChannel}
                    baseZone={topZones.base}
                    legendZone={topZones.legend}
                    championZone={topZones.champion}
                    discardZone={topZones.discard}
                    deckZone={topZones.deck}
                    cardsInZone={cardsInZone}
                    onZoneMouseUp={handleZoneMouseUp}
                    getInteractionRulesForInstance={getInteractionRulesForInstance}
                    onCardInteraction={handleCardInteraction}
                    onCardHoverStart={handleHoverStart}
                    onCardHoverEnd={handleHoverEnd}
                    draggingKey={draggingKey}
                />
            </div>

            {/* MIDDLE: two shared battlefields, each split into top/bottom halves */}
            <div className="flex items-stretch justify-center gap-5">
                <BattlefieldRect
                    topZone={topZones.bfLeftTop}
                    bottomZone={topZones.bfLeftBottom}
                    topLabel="top_battle1"
                    bottomLabel="bot_battle1"
                    cardsInZone={cardsInZone}
                    onZoneMouseUp={handleZoneMouseUp}
                    getInteractionRulesForInstance={getInteractionRulesForInstance}
                    onCardInteraction={handleCardInteraction}
                    onCardHoverStart={handleHoverStart}
                    onCardHoverEnd={handleHoverEnd}
                    draggingKey={draggingKey}
                />
                <BattlefieldRect
                    topZone={topZones.bfRightTop}
                    bottomZone={topZones.bfRightBottom}
                    topLabel="top_battle2"
                    bottomLabel="bot_battle2"
                    cardsInZone={cardsInZone}
                    onZoneMouseUp={handleZoneMouseUp}
                    getInteractionRulesForInstance={getInteractionRulesForInstance}
                    onCardInteraction={handleCardInteraction}
                    onCardHoverStart={handleHoverStart}
                    onCardHoverEnd={handleHoverEnd}
                    draggingKey={draggingKey}
                />
            </div>

            {/* BOTTOM ROW */}
            <div className="rb-player-row-bottom flex items-stretch gap-5">
                <PlayerRow
                    orientation="bottom"
                    runeDeckZone={bottomZones.runeDeck}
                    runeChannelZone={bottomZones.runeChannel}
                    baseZone={bottomZones.base}
                    legendZone={bottomZones.legend}
                    championZone={bottomZones.champion}
                    discardZone={bottomZones.discard}
                    deckZone={bottomZones.deck}
                    cardsInZone={cardsInZone}
                    onZoneMouseUp={handleZoneMouseUp}
                    getInteractionRulesForInstance={getInteractionRulesForInstance}
                    onCardInteraction={handleCardInteraction}
                    onCardHoverStart={handleHoverStart}
                    onCardHoverEnd={handleHoverEnd}
                    draggingKey={draggingKey}
                />
            </div>

            {/* Hover preview */}
            <CardHoverPreview hover={hover} />

            {/* Floating dragging card ghost that moves + rotates to slot */}
            {drag && currentGhostRotation != null && (
                <div
                    className={`rb-card-dragging-ghost ${drag.phase === 'animatingToSlot' ? 'rb-card-ghost-animate' : ''
                        }`}
                    style={{
                        left:
                            drag.phase === 'animatingToSlot' && drag.targetX != null
                                ? drag.targetX
                                : drag.x,
                        top:
                            drag.phase === 'animatingToSlot' && drag.targetY != null
                                ? drag.targetY
                                : drag.y,
                        transform: `translate(-50%, -50%) rotate(${currentGhostRotation}deg)`,
                    }}
                >
                    <img
                        src={drag.card.images.large}
                        alt={drag.card.name}
                        className="rb-card rounded-md border border-amber-400/70 shadow-xl"
                    />
                </div>
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Player row                                                         */
/* ------------------------------------------------------------------ */

type PlayerRowProps = {
    orientation: 'top' | 'bottom'
    runeDeckZone: BoardZoneId
    runeChannelZone: BoardZoneId
    baseZone: BoardZoneId
    legendZone: BoardZoneId
    championZone: BoardZoneId
    discardZone: BoardZoneId
    deckZone: BoardZoneId
    cardsInZone: (z: BoardZoneId) => BoardCardInstance[]
    onZoneMouseUp: (
        z: BoardZoneId,
        e: React.MouseEvent<HTMLDivElement>,
    ) => void
    getInteractionRulesForInstance: InteractionRulesResolver
    onCardInteraction: CardInteractionHandler
    onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
    onCardHoverEnd: () => void
    draggingKey: CardKey | null
}

function PlayerRow({
    orientation,
    runeDeckZone,
    runeChannelZone,
    baseZone,
    legendZone,
    championZone,
    discardZone,
    deckZone,
    cardsInZone,
    onZoneMouseUp,
    getInteractionRulesForInstance,
    onCardInteraction,
    onCardHoverStart,
    onCardHoverEnd,
    draggingKey,
}: PlayerRowProps) {
    const isTop = orientation === 'top'
    const prefix = isTop ? 'top' : 'bot'

    if (isTop) {
        return (
            <div className="flex w-full flex-col gap-1">
                {/* Row 1: deck + discard */}
                <div className="flex w-full justify-start">
                    <div className="flex items-stretch gap-2 rb-piles-top-lower">
                        <ZoneCardSlot
                            zoneId={deckZone}
                            cards={cardsInZone(deckZone)}
                            onZoneMouseUp={onZoneMouseUp}
                            getInteractionRulesForInstance={getInteractionRulesForInstance}
                            onCardInteraction={onCardInteraction}
                            onCardHoverStart={onCardHoverStart}
                            onCardHoverEnd={onCardHoverEnd}
                            draggingKey={draggingKey}
                            debugLabel="top_deck"
                        />
                        <ZoneCardSlot
                            zoneId={discardZone}
                            cards={cardsInZone(discardZone)}
                            onZoneMouseUp={onZoneMouseUp}
                            getInteractionRulesForInstance={getInteractionRulesForInstance}
                            onCardInteraction={onCardInteraction}
                            onCardHoverStart={onCardHoverStart}
                            onCardHoverEnd={onCardHoverEnd}
                            draggingKey={draggingKey}
                            debugLabel="top_discard"
                        />
                    </div>
                </div>

                {/* Row 2: legend | champion | base | rune_channel | runes */}
                <div className="flex w-full items-stretch gap-3">
                    <div className="flex flex-none items-stretch">
                        <ZoneCardSlot
                            zoneId={legendZone}
                            cards={cardsInZone(legendZone)}
                            onZoneMouseUp={onZoneMouseUp}
                            getInteractionRulesForInstance={getInteractionRulesForInstance}
                            onCardInteraction={onCardInteraction}
                            onCardHoverStart={onCardHoverStart}
                            onCardHoverEnd={onCardHoverEnd}
                            draggingKey={draggingKey}
                            debugLabel="top_legend"
                        />
                    </div>
                    <div className="flex flex-none items-stretch">
                        <ZoneCardSlot
                            zoneId={championZone}
                            cards={cardsInZone(championZone)}
                            onZoneMouseUp={onZoneMouseUp}
                            getInteractionRulesForInstance={getInteractionRulesForInstance}
                            onCardInteraction={onCardInteraction}
                            onCardHoverStart={onCardHoverStart}
                            onCardHoverEnd={onCardHoverEnd}
                            draggingKey={draggingKey}
                            debugLabel="top_champion"
                        />
                    </div>
                    <div className="flex flex-1 items-stretch">
                        <ZoneRect
                            zoneId={baseZone}
                            cards={cardsInZone(baseZone)}
                            onZoneMouseUp={onZoneMouseUp}
                            getInteractionRulesForInstance={getInteractionRulesForInstance}
                            onCardInteraction={onCardInteraction}
                            onCardHoverStart={onCardHoverStart}
                            onCardHoverEnd={onCardHoverEnd}
                            draggingKey={draggingKey}
                            debugLabel={`${prefix}_base`}
                        />
                    </div>
                    <div className="flex flex-1 items-stretch">
                        <ZoneRect
                            zoneId={runeChannelZone}
                            cards={cardsInZone(runeChannelZone)}
                            onZoneMouseUp={onZoneMouseUp}
                            getInteractionRulesForInstance={getInteractionRulesForInstance}
                            onCardInteraction={onCardInteraction}
                            onCardHoverStart={onCardHoverStart}
                            onCardHoverEnd={onCardHoverEnd}
                            draggingKey={draggingKey}
                            debugLabel={`${prefix}_rune_channel`}
                        />
                    </div>
                    <div className="flex flex-none items-stretch">
                        <ZoneCardSlot
                            zoneId={runeDeckZone}
                            cards={cardsInZone(runeDeckZone)}
                            onZoneMouseUp={onZoneMouseUp}
                            getInteractionRulesForInstance={getInteractionRulesForInstance}
                            onCardInteraction={onCardInteraction}
                            onCardHoverStart={onCardHoverStart}
                            onCardHoverEnd={onCardHoverEnd}
                            draggingKey={draggingKey}
                            debugLabel={`${prefix}_runes`}
                        />
                    </div>
                </div>
            </div>
        )
    }

    /* BOTTOM layout */
    return (
        <div className="flex w-full flex-row items-stretch gap-3">
            {/* Rune Deck */}
            <div className="flex flex-none items-stretch">
                <ZoneCardSlot
                    zoneId={runeDeckZone}
                    cards={cardsInZone(runeDeckZone)}
                    onZoneMouseUp={onZoneMouseUp}
                    getInteractionRulesForInstance={getInteractionRulesForInstance}
                    onCardInteraction={onCardInteraction}
                    onCardHoverStart={onCardHoverStart}
                    onCardHoverEnd={onCardHoverEnd}
                    draggingKey={draggingKey}
                    debugLabel={`${prefix}_runes`}
                />
            </div>

            {/* Rune Channel */}
            <div className="flex flex-1 items-stretch">
                <ZoneRect
                    zoneId={runeChannelZone}
                    cards={cardsInZone(runeChannelZone)}
                    onZoneMouseUp={onZoneMouseUp}
                    getInteractionRulesForInstance={getInteractionRulesForInstance}
                    onCardInteraction={onCardInteraction}
                    onCardHoverStart={onCardHoverStart}
                    onCardHoverEnd={onCardHoverEnd}
                    draggingKey={draggingKey}
                    debugLabel={`${prefix}_rune_channel`}
                />
            </div>

            {/* Base */}
            <div className="flex flex-1 items-stretch">
                <ZoneRect
                    zoneId={baseZone}
                    cards={cardsInZone(baseZone)}
                    onZoneMouseUp={onZoneMouseUp}
                    getInteractionRulesForInstance={getInteractionRulesForInstance}
                    onCardInteraction={onCardInteraction}
                    onCardHoverStart={onCardHoverStart}
                    onCardHoverEnd={onCardHoverEnd}
                    draggingKey={draggingKey}
                    debugLabel={`${prefix}_base`}
                />
            </div>

            {/* Piles cluster */}
            <div className="flex flex-none flex-col items-stretch gap-1">
                {/* Legend + Champion */}
                <div className="flex w-full items-stretch justify-end gap-2">
                    <ZoneCardSlot
                        zoneId={legendZone}
                        cards={cardsInZone(legendZone)}
                        onZoneMouseUp={onZoneMouseUp}
                        getInteractionRulesForInstance={getInteractionRulesForInstance}
                        onCardInteraction={onCardInteraction}
                        onCardHoverStart={onCardHoverStart}
                        onCardHoverEnd={onCardHoverEnd}
                        draggingKey={draggingKey}
                        debugLabel="bot_legend"
                    />
                    <ZoneCardSlot
                        zoneId={championZone}
                        cards={cardsInZone(championZone)}
                        onZoneMouseUp={onZoneMouseUp}
                        getInteractionRulesForInstance={getInteractionRulesForInstance}
                        onCardInteraction={onCardInteraction}
                        onCardHoverStart={onCardHoverStart}
                        onCardHoverEnd={onCardHoverEnd}
                        draggingKey={draggingKey}
                        debugLabel="bot_champion"
                    />
                </div>

                {/* Deck + Discard */}
                <div className="flex w-full items-stretch justify-start gap-2 rb-piles-bottom-lower">
                    <PileSlotWithLabel
                        debugLabel="bot_deck"
                        zoneId={deckZone}
                        cards={cardsInZone(deckZone)}
                        onZoneMouseUp={onZoneMouseUp}
                        getInteractionRulesForInstance={getInteractionRulesForInstance}
                        onCardInteraction={onCardInteraction}
                        onCardHoverStart={onCardHoverStart}
                        onCardHoverEnd={onCardHoverEnd}
                        draggingKey={draggingKey}
                    />
                    <PileSlotWithLabel
                        debugLabel="bot_discard"
                        zoneId={discardZone}
                        cards={cardsInZone(discardZone)}
                        onZoneMouseUp={onZoneMouseUp}
                        getInteractionRulesForInstance={getInteractionRulesForInstance}
                        onCardInteraction={onCardInteraction}
                        onCardHoverStart={onCardHoverStart}
                        onCardHoverEnd={onCardHoverEnd}
                        draggingKey={draggingKey}
                    />
                </div>
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Battlefield rect                                                   */
/* ------------------------------------------------------------------ */

type BattlefieldRectProps = {
    topZone: BoardZoneId
    bottomZone: BoardZoneId
    topLabel: string
    bottomLabel: string
    cardsInZone: (z: BoardZoneId) => BoardCardInstance[]
    onZoneMouseUp: (
        z: BoardZoneId,
        e: React.MouseEvent<HTMLDivElement>,
    ) => void
    getInteractionRulesForInstance: InteractionRulesResolver
    onCardInteraction: CardInteractionHandler
    onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
    onCardHoverEnd: () => void
    draggingKey: CardKey | null
}

function BattlefieldRect({
    topZone,
    bottomZone,
    topLabel,
    bottomLabel,
    cardsInZone,
    onZoneMouseUp,
    getInteractionRulesForInstance,
    onCardInteraction,
    onCardHoverStart,
    onCardHoverEnd,
    draggingKey,
}: BattlefieldRectProps) {
    return (
        <div className="rb-battlefield-rect relative flex flex-1 flex-col overflow-visible rounded-xl border border-amber-500/40 bg-slate-900/40">
            {/* Divider line in the center */}
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-px bg-amber-500/30" />

            <div className="flex-1 overflow-visible border-b border-transparent">
                <InnerBattlefieldHalf
                    zoneId={topZone}
                    cards={cardsInZone(topZone)}
                    onZoneMouseUp={onZoneMouseUp}
                    getInteractionRulesForInstance={getInteractionRulesForInstance}
                    onCardInteraction={onCardInteraction}
                    onCardHoverStart={onCardHoverStart}
                    onCardHoverEnd={onCardHoverEnd}
                    draggingKey={draggingKey}
                    debugLabel={topLabel}
                />
            </div>
            <div className="flex-1 overflow-visible">
                <InnerBattlefieldHalf
                    zoneId={bottomZone}
                    cards={cardsInZone(bottomZone)}
                    onZoneMouseUp={onZoneMouseUp}
                    getInteractionRulesForInstance={getInteractionRulesForInstance}
                    onCardInteraction={onCardInteraction}
                    onCardHoverStart={onCardHoverStart}
                    onCardHoverEnd={onCardHoverEnd}
                    draggingKey={draggingKey}
                    debugLabel={bottomLabel}
                />
            </div>
        </div>
    )
}

type InnerBattlefieldHalfProps = {
    zoneId: BoardZoneId
    cards: BoardCardInstance[]
    onZoneMouseUp: (
        z: BoardZoneId,
        e: React.MouseEvent<HTMLDivElement>,
    ) => void
    getInteractionRulesForInstance: InteractionRulesResolver
    onCardInteraction: CardInteractionHandler
    onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
    onCardHoverEnd: () => void
    draggingKey: CardKey | null
    debugLabel?: string
}

function InnerBattlefieldHalf({
    zoneId,
    cards,
    onZoneMouseUp,
    getInteractionRulesForInstance,
    onCardInteraction,
    onCardHoverStart,
    onCardHoverEnd,
    draggingKey,
    debugLabel,
}: InnerBattlefieldHalfProps) {
    const { containerRef, getStyleForIndex } = useStackedCardLayout(cards.length)

    return (
        <div
            onMouseUp={(e) => onZoneMouseUp(zoneId, e)}
            ref={containerRef}
            className="rb-battlefield-half relative flex w-full items-center justify-center overflow-visible px-3"
        >
            {debugLabel && <span className="rb-zone-label">{debugLabel}</span>}
            {cards.map((c, index) =>
                c.card ? (
                    <InteractiveCard
                        key={c.key}
                        cardKey={c.key}
                        card={c.card}
                        zoneId={zoneId}
                        isOwn={c.isOwn}
                        rotation={c.rotation}
                        draggingKey={draggingKey ?? undefined}
                        stackStyle={getStyleForIndex(index)}
                        interactionRules={getInteractionRulesForInstance(c)}
                        onInteraction={onCardInteraction}
                        onHoverStart={onCardHoverStart}
                        onHoverEnd={onCardHoverEnd}
                        wobble
                    />
                ) : null,
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Rectangular zone (base / rune channel)                             */
/* ------------------------------------------------------------------ */

type ZoneRectProps = {
    zoneId: BoardZoneId
    cards: BoardCardInstance[]
    onZoneMouseUp: (
        z: BoardZoneId,
        e: React.MouseEvent<HTMLDivElement>,
    ) => void
    getInteractionRulesForInstance: InteractionRulesResolver
    onCardInteraction: CardInteractionHandler
    onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
    onCardHoverEnd: () => void
    draggingKey: CardKey | null
    debugLabel?: string
}

function ZoneRect({
    zoneId,
    cards,
    onZoneMouseUp,
    getInteractionRulesForInstance,
    onCardInteraction,
    onCardHoverStart,
    onCardHoverEnd,
    draggingKey,
    debugLabel,
}: ZoneRectProps) {
    const { containerRef, getStyleForIndex } = useStackedCardLayout(cards.length)

    return (
        <div
            onMouseUp={(e) => onZoneMouseUp(zoneId, e)}
            ref={containerRef}
            className="rb-zone-rect relative flex w-full items-center justify-center overflow-visible rounded-xl border border-amber-500/40 bg-slate-900/40 px-3"
        >
            {debugLabel && <span className="rb-zone-label">{debugLabel}</span>}
            {cards.map((c, index) =>
                c.card ? (
                    <InteractiveCard
                        key={c.key}
                        cardKey={c.key}
                        card={c.card}
                        zoneId={zoneId}
                        isOwn={c.isOwn}
                        rotation={c.rotation}
                        draggingKey={draggingKey ?? undefined}
                        stackStyle={getStyleForIndex(index)}
                        interactionRules={getInteractionRulesForInstance(c)}
                        onInteraction={onCardInteraction}
                        onHoverStart={onCardHoverStart}
                        onHoverEnd={onCardHoverEnd}
                        wobble
                    />
                ) : null,
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* Card-sized slot (legend / champion / rune deck / discard / deck)   */
/* ------------------------------------------------------------------ */

type ZoneCardSlotProps = {
    zoneId: BoardZoneId
    cards: BoardCardInstance[]
    onZoneMouseUp: (
        z: BoardZoneId,
        e: React.MouseEvent<HTMLDivElement>,
    ) => void
    getInteractionRulesForInstance: InteractionRulesResolver
    onCardInteraction: CardInteractionHandler
    onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
    onCardHoverEnd: () => void
    draggingKey: CardKey | null
    debugLabel?: string
}

function ZoneCardSlot({
    zoneId,
    cards,
    onZoneMouseUp,
    getInteractionRulesForInstance,
    onCardInteraction,
    onCardHoverStart,
    onCardHoverEnd,
    draggingKey,
    debugLabel,
}: ZoneCardSlotProps) {
    const { containerRef, getStyleForIndex } = useStackedCardLayout(cards.length)

    return (
        <div className="relative flex h-full w-full flex-col items-center gap-1">
            <div
                onMouseUp={(e) => onZoneMouseUp(zoneId, e)}
                ref={containerRef}
                className="rb-zone-card-slot-inner relative flex w-full items-center justify-center overflow-visible rounded-lg border border-amber-500/40 bg-slate-900/60"
            >
                {debugLabel && <span className="rb-zone-label">{debugLabel}</span>}
                {cards.map((c, index) =>
                    c.card ? (
                        <InteractiveCard
                            key={c.key}
                            cardKey={c.key}
                            card={c.card}
                            zoneId={zoneId}
                            isOwn={c.isOwn}
                            rotation={c.rotation}
                            draggingKey={draggingKey ?? undefined}
                            stackStyle={getStyleForIndex(index)}
                            interactionRules={getInteractionRulesForInstance(c)}
                            onInteraction={onCardInteraction}
                            onHoverStart={onCardHoverStart}
                            onHoverEnd={onCardHoverEnd}
                            wobble
                        />
                    ) : null,
                )}
            </div>
        </div>
    )
}

type PileSlotWithLabelProps = ZoneCardSlotProps & { debugLabel: string }

function PileSlotWithLabel({
    debugLabel,
    ...slotProps
}: PileSlotWithLabelProps) {
    return (
        <div className="flex w-1/2 flex-col items-stretch">
            <ZoneCardSlot {...slotProps} debugLabel={debugLabel} />
        </div>
    )
}
