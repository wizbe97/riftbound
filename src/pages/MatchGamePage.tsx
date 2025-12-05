// src/pages/MatchGamePage.tsx
import type React from 'react'
import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ALL_CARDS, type RiftboundCard } from '../data/riftboundCards'
import { InteractiveCard } from '../components/cards/InteractiveCard'
import { useLobby } from '../hooks/useLobby'
import { useUserDecks } from '../hooks/useUserDecks'
import { useDeckSelection } from '../hooks/useDeckSelection'
import type { DeckSummary, Role } from '../types/riftboundGame'
import {
  type CardKey,
  CARD_KEYS,
  type BoardZoneId,
  type BoardState,
  DEFAULT_BOARD_STATE,
  isPileZone,
  canRoleUseZone,
} from '../game/boardConfig'
import { db } from '../firebase'
import '../styles/gameplay.css'

/* ------------------------------------------------------------------ */
/* Types for routing                                                  */
/* ------------------------------------------------------------------ */

type RouteParams = {
  lobbyId: string
}

/* ------------------------------------------------------------------ */
/* Board layout types                                                 */
/* ------------------------------------------------------------------ */

type BoardCardInstance = {
  key: CardKey
  card: RiftboundCard | null
  zoneId: BoardZoneId
  rotation: number
  isOwn: boolean
}

type GameBoardLayoutProps = {
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

type HoverPreviewState = {
  card: RiftboundCard
  x: number
  y: number
} | null

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

/* ------------------------------------------------------------------ */
/* Page component                                                     */
/* ------------------------------------------------------------------ */

function MatchGamePage() {
  const { lobbyId } = useParams<RouteParams>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const {
    lobby,
    loading: lobbyLoading,
    error: lobbyError,
    boardState,
    setBoardState,
  } = useLobby(lobbyId)

  const {
    decks,
    loading: decksLoading,
    error: decksError,
  } = useUserDecks(user?.uid)

  /* ------------------------------ Role logic ------------------------------ */

  const role: Role = useMemo(() => {
    if (!profile || !lobby) return 'none'
    if (lobby.p1?.uid === profile.uid) return 'p1'
    if (lobby.p2?.uid === profile.uid) return 'p2'
    if (lobby.spectators.some((s) => s.uid === profile.uid)) return 'spectator'
    return 'none'
  }, [lobby, profile])

  /* --------------------------- Deck selection ----------------------------- */

  const {
    selectedDeckId,
    setSelectedDeckId,
    myDeckLockedIn,
    opponentDeckLockedIn,
    bothDecksLockedIn,
    saveError,
    saving,
    handleConfirmDeck,
  } = useDeckSelection({
    lobby,
    role,
    lobbyId,
    decks,
  })

  // Card lookup map
  const cardById = useMemo(() => {
    const map = new Map<string, RiftboundCard>()
    for (const card of ALL_CARDS) map.set(card.id, card)
    return map
  }, [])

  // if lobby closed, kick back
  useEffect(() => {
    if (!lobby) return
    if (lobby.status === 'closed') navigate('/play')
  }, [lobby, navigate])

  /* -------------------------- Board move / rotate ------------------------- */

  const handleMoveCard = async (
    cardKey: CardKey,
    zoneId: BoardZoneId,
    rotationOverride?: number,
  ) => {
    if (!lobbyId) return

    const current = boardState[cardKey] ?? DEFAULT_BOARD_STATE[cardKey]

    const nextRotation =
      typeof rotationOverride === 'number'
        ? rotationOverride
        : isPileZone(zoneId)
          ? 0
          : current.rotation === 0
            ? 90
            : current.rotation

    const nextLocal = { zoneId, rotation: nextRotation }

    setBoardState((prev) => ({
      ...prev,
      [cardKey]: nextLocal,
    }))

    try {
      const { doc, updateDoc, serverTimestamp } = await import(
        'firebase/firestore'
      )
      const lobbyRef = doc(db, 'lobbies', lobbyId)
      await updateDoc(lobbyRef, {
        [`boardState.${cardKey}`]: {
          zoneId,
          rotation: nextRotation,
        },
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('[MatchGame] failed to move card', err)
    }
  }

  const handleRotateCard = async (cardKey: CardKey) => {
    if (!lobbyId) return

    const current = boardState[cardKey] ?? DEFAULT_BOARD_STATE[cardKey]

    // Cards in deck/discard piles should stay upright and not rotate.
    if (isPileZone(current.zoneId)) {
      return
    }

    const nextRotation = current.rotation === 90 ? 0 : 90
    const nextLocal = {
      ...current,
      rotation: nextRotation,
    }

    setBoardState((prev) => ({
      ...prev,
      [cardKey]: nextLocal,
    }))

    try {
      const { doc, updateDoc, serverTimestamp } = await import(
        'firebase/firestore'
      )
      const lobbyRef = doc(db, 'lobbies', lobbyId)
      await updateDoc(lobbyRef, {
        [`boardState.${cardKey}`]: {
          zoneId: current.zoneId,
          rotation: nextRotation,
        },
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('[MatchGame] failed to rotate card', err)
    }
  }

  /* ----------------------------- Card mapping ----------------------------- */

  const p1Legend =
    lobby?.p1LegendCardId ? cardById.get(lobby.p1LegendCardId) ?? null : null
  const p1Champion =
    lobby?.p1ChampionCardId
      ? cardById.get(lobby.p1ChampionCardId) ?? null
      : null
  const p2Legend =
    lobby?.p2LegendCardId ? cardById.get(lobby.p2LegendCardId) ?? null : null
  const p2Champion =
    lobby?.p2ChampionCardId
      ? cardById.get(lobby.p2ChampionCardId) ?? null
      : null

  const cardsByKey: Record<CardKey, RiftboundCard | null> = {
    p1Legend,
    p1Champion,
    p2Legend,
    p2Champion,
  }

  const viewerIsP1 = role === 'p1' || role === 'none' || role === 'spectator'

  const bottomName =
    viewerIsP1
      ? lobby?.p1?.username ?? 'Player 1'
      : lobby?.p2?.username ?? 'Player 2'
  const topName =
    viewerIsP1
      ? lobby?.p2?.username ?? 'Player 2'
      : lobby?.p1?.username ?? 'Player 1'

  const showDeckSelectionOverlay =
    (role === 'p1' || role === 'p2') && !myDeckLockedIn

  /* ---------------------------- Loading / error --------------------------- */

  if (lobbyLoading) {
    return (
      <section className="rb-game-root flex items-center justify-center">
        <p className="text-sm text-slate-300">Loading match…</p>
      </section>
    )
  }

  if (lobbyError || !lobby) {
    return (
      <section className="rb-game-root flex flex-col items-center justify-center">
        <p className="mb-4 text-sm text-red-300">
          {lobbyError ?? 'Lobby not found.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/play')}
          className="inline-flex items-center rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-amber-400"
        >
          Back to Play
        </button>
      </section>
    )
  }

  /* ------------------------------- Render -------------------------------- */

  return (
    <section className="rb-game-root flex flex-col">
      <div className="flex h-full">
        {/* Main gameplay column (wider) */}
        <div className="rb-game-main flex flex-col gap-2">
          {/* Header under navbar */}
          <div className="flex items-center justify-between px-4 pt-2">
            <div className="text-right text-xs text-slate-400" />
          </div>

          {/* Board */}
          <div className="flex-1 px-2 pb-2">
            <GameBoardLayout
              viewerIsP1={viewerIsP1}
              viewerRole={role}
              topName={topName}
              bottomName={bottomName}
              boardState={boardState}
              cardsByKey={cardsByKey}
              onMoveCard={handleMoveCard}
              onRotateCard={handleRotateCard}
            />
          </div>

          {/* Status banner */}
          {!bothDecksLockedIn && (
            <div className="mx-4 mb-2 rounded-md border border-sky-500/40 bg-sky-950/40 px-3 py-2 text-xs text-sky-100">
              {showDeckSelectionOverlay
                ? 'Select a deck below to begin the match.'
                : opponentDeckLockedIn
                  ? 'Waiting for both decks to be locked in…'
                  : 'Players are selecting decks…'}
            </div>
          )}
        </div>

        {/* Right-side spacer reserved for future chat (narrower than before) */}
        <div className="rb-game-chat-spacer" />
      </div>

      {/* Deck selection overlay */}
      {showDeckSelectionOverlay && (
        <DeckSelectionOverlay
          decks={decks}
          decksLoading={decksLoading}
          decksError={decksError}
          selectedDeckId={selectedDeckId}
          setSelectedDeckId={setSelectedDeckId}
          cardById={cardById}
          saveError={saveError}
          saving={saving}
          onConfirm={handleConfirmDeck}
          onCancel={() => navigate(`/play/private/${lobby.id}`)}
        />
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Deck selection overlay                                             */
/* ------------------------------------------------------------------ */

type DeckSelectionProps = {
  decks: DeckSummary[]
  decksLoading: boolean
  decksError: string | null
  selectedDeckId: string | null
  setSelectedDeckId: (id: string | null) => void
  cardById: Map<string, RiftboundCard>
  saveError: string | null
  saving: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DeckSelectionOverlay({
  decks,
  decksLoading,
  decksError,
  selectedDeckId,
  setSelectedDeckId,
  cardById,
  saveError,
  saving,
  onConfirm,
  onCancel,
}: DeckSelectionProps) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/80">
      <div className="w-full max-w-lg rounded-xl border border-amber-500/50 bg-slate-900 p-5 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-amber-200">
          Choose your deck
        </h2>
        <p className="mb-4 text-xs text-slate-300">
          Select one of your decks to use for this match. You can&apos;t change
          it once the game begins.
        </p>

        {decksLoading ? (
          <div className="py-4 text-sm text-slate-300">Loading decks…</div>
        ) : decksError ? (
          <div className="py-4 text-sm text-red-300">{decksError}</div>
        ) : decks.length === 0 ? (
          <div className="py-4 text-sm text-slate-300">
            You don&apos;t have any decks yet. Create one on the Decks page.
          </div>
        ) : (
          <div className="mb-4 max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
            {decks.map((deck) => {
              const legendCard: RiftboundCard | null = deck.legendCardId
                ? cardById.get(deck.legendCardId) ?? null
                : null
              const championCard: RiftboundCard | null = deck.championCardId
                ? cardById.get(deck.championCardId) ?? null
                : null

              return (
                <label
                  key={deck.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                    selectedDeckId === deck.id
                      ? 'border-amber-400 bg-slate-800/80'
                      : 'border-slate-700 bg-slate-900/60 hover:border-amber-500/70'
                  }`}
                >
                  <input
                    type="radio"
                    name="deck"
                    className="mr-1 h-3 w-3 accent-amber-400"
                    checked={selectedDeckId === deck.id}
                    onChange={() => setSelectedDeckId(deck.id)}
                  />
                  <div className="flex items-center gap-2">
                    <SmallCardPreview card={legendCard} label="Legend" />
                    <SmallCardPreview card={championCard} label="Champion" />
                  </div>
                  <div className="ml-3 flex-1">
                    <div className="text-sm font-semibold text-amber-100">
                      {deck.name}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {deck.cardCount} cards
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {saveError && (
          <div className="mb-3 rounded border border-red-500/60 bg-red-950/60 px-2 py-1 text-[11px] text-red-200">
            {saveError}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          >
            Back to Lobby
          </button>
          <button
            type="button"
            disabled={saving || !selectedDeckId}
            onClick={onConfirm}
            className="rounded-md bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Confirming…' : 'Confirm Deck'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SmallCardPreview({
  card,
  label,
}: {
  card: RiftboundCard | null
  label: string
}) {
  const img = card?.images.small
  return (
    <div className="flex items-center gap-1">
      <div className="h-10 w-7 overflow-hidden rounded-sm bg-slate-800">
        {img && (
          <img
            src={img}
            alt={card?.name ?? label}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Stacking helper: no overlap until needed                           */
/* ------------------------------------------------------------------ */

function useStackedCardLayout(cards: BoardCardInstance[]) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<{
    containerWidth: number
    cardWidth: number
  }>({ containerWidth: 0, cardWidth: 0 })

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

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const ro = new ResizeObserver(() => {
      compute()
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
    }
  }, [cards.length])

  const getStyleForIndex = (index: number): React.CSSProperties => {
    const { containerWidth, cardWidth } = layout
    const count = cards.length

    if (count <= 1 || !containerWidth || !cardWidth) {
      // Single card or unknown sizes: simple small gap
      return index === 0 ? {} : { marginLeft: 8 }
    }

    const idealGap = 8 // px: desired space between cards when possible

    // Ideal total spacing if we had plenty of room
    const idealSpacing = cardWidth + idealGap
    const maxSpacing = (containerWidth - cardWidth) / (count - 1)

    // Choose spacing that fits: either ideal (no overlap) or max that fits
    const spacing = Math.min(idealSpacing, maxSpacing)

    // marginLeft = spacing - cardWidth
    // If spacing < cardWidth, this becomes negative => overlap
    const marginLeft = index === 0 ? 0 : spacing - cardWidth

    return { marginLeft }
  }

  return { containerRef, getStyleForIndex }
}

/* ------------------------------------------------------------------ */
/* Game board layout                                                  */
/* ------------------------------------------------------------------ */

function GameBoardLayout({
  viewerIsP1,
  viewerRole,
  boardState,
  cardsByKey,
  onMoveCard,
  onRotateCard,
}: GameBoardLayoutProps) {
  const [hover, setHover] = useState<HoverPreviewState>(null)
  const [drag, setDrag] = useState<DragState>(null)

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

  const handleHoverStart = (card: RiftboundCard, x: number, yCenter: number) => {
    if (drag) return

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

  const handleCardBeginDrag = (
    key: CardKey,
    card: RiftboundCard,
    rotation: number,
    x: number,
    y: number,
  ) => {
    setDrag({
      key,
      card,
      x,
      y,
      fromRotation: rotation,
      toRotation: rotation,
      phase: 'dragging',
    })
    setHover(null)
    setDraggingCursor(true)
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
    const nextRotation = isPileZone(zoneId)
      ? 0
      : currentRotation === 0
        ? 90
        : currentRotation

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

  const handleCardRotate = (key: CardKey, isOwn: boolean) => {
    if (!isOwn) return
    onRotateCard(key)
  }

  /* ---------------------- Right-click context menu ---------------------- */

  type ContextMenuState = {
    open: boolean
    x: number
    y: number
    cardKey: CardKey | null
  }

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    cardKey: null,
  })

  const handleCardContextMenu =
    (key: CardKey, isOwn: boolean) =>
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isOwn) return
      e.preventDefault()
      setCtxMenu({
        open: true,
        x: e.clientX,
        y: e.clientY,
        cardKey: key,
      })
    }

  const closeContextMenu = () =>
    setCtxMenu({ open: false, x: 0, y: 0, cardKey: null })

  const getOwnerFromCardKey = (key: CardKey): 'p1' | 'p2' =>
    key.startsWith('p1') ? 'p1' : 'p2'

  const getDiscardZoneForCard = (key: CardKey): BoardZoneId =>
    getOwnerFromCardKey(key) === 'p1' ? 'p1Discard' : 'p2Discard'

  const getDeckZoneForCard = (key: CardKey): BoardZoneId =>
    getOwnerFromCardKey(key) === 'p1' ? 'p1Deck' : 'p2Deck'

  const handleContextDiscard = () => {
    if (!ctxMenu.cardKey) return
    const zoneId = getDiscardZoneForCard(ctxMenu.cardKey)
    onMoveCard(ctxMenu.cardKey, zoneId)
    closeContextMenu()
  }

  const handleContextSendToDeck = () => {
    if (!ctxMenu.cardKey) return
    const zoneId = getDeckZoneForCard(ctxMenu.cardKey)
    onMoveCard(ctxMenu.cardKey, zoneId)
    closeContextMenu()
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
      className="rb-game-board relative flex h-full flex-col gap-5 rounded-xl bg-slate-950/80 px-4 py-2"
      onClick={ctxMenu.open ? closeContextMenu : undefined}
      onMouseUp={handleBoardMouseUp}
    >
      {/* Context menu for card actions */}
      {ctxMenu.open && ctxMenu.cardKey && (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleContextDiscard}
            className="block w-full px-3 py-1.5 text-left text-xs text-slate-100 hover:bg-slate-800"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleContextSendToDeck}
            className="block w-full px-3 py-1.5 text-left text-xs text-slate-100 hover:bg-slate-800"
          >
            Send to bottom of deck
          </button>
        </div>
      )}

      {/* TOP ROW */}
      <div className="flex flex-[1.5] items-stretch gap-3">
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
          onCardRotate={handleCardRotate}
          onCardContextMenu={handleCardContextMenu}
          onCardHoverStart={handleHoverStart}
          onCardHoverEnd={handleHoverEnd}
          onCardBeginDrag={handleCardBeginDrag}
          draggingKey={draggingKey}
        />
      </div>

      {/* MIDDLE: two shared battlefields, each split into top/bottom halves */}
      <div className="flex flex-[1.7] items-stretch justify-center gap-5">
        <BattlefieldRect
          topZone={topZones.bfLeftTop}
          bottomZone={topZones.bfLeftBottom}
          topLabel="top_battle1"
          bottomLabel="bot_battle1"
          cardsInZone={cardsInZone}
          onZoneMouseUp={handleZoneMouseUp}
          onCardRotate={handleCardRotate}
          onCardContextMenu={handleCardContextMenu}
          onCardHoverStart={handleHoverStart}
          onCardHoverEnd={handleHoverEnd}
          onCardBeginDrag={handleCardBeginDrag}
          draggingKey={draggingKey}
        />
        <BattlefieldRect
          topZone={topZones.bfRightTop}
          bottomZone={topZones.bfRightBottom}
          topLabel="top_battle2"
          bottomLabel="bot_battle2"
          cardsInZone={cardsInZone}
          onZoneMouseUp={handleZoneMouseUp}
          onCardRotate={handleCardRotate}
          onCardContextMenu={handleCardContextMenu}
          onCardHoverStart={handleHoverStart}
          onCardHoverEnd={handleHoverEnd}
          onCardBeginDrag={handleCardBeginDrag}
          draggingKey={draggingKey}
        />
      </div>

      {/* BOTTOM ROW */}
      <div className="rb-player-row-bottom flex flex-[1.5] items-stretch gap-3">
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
          onCardRotate={handleCardRotate}
          onCardContextMenu={handleCardContextMenu}
          onCardHoverStart={handleHoverStart}
          onCardHoverEnd={handleHoverEnd}
          onCardBeginDrag={handleCardBeginDrag}
          draggingKey={draggingKey}
        />
      </div>

      {/* Hover preview: always to the right, vertically clamped */}
      {hover && (
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
      )}

      {/* Floating dragging card ghost that moves + rotates to slot */}
      {drag && currentGhostRotation != null && (
        <div
          className={`rb-card-dragging-ghost ${
            drag.phase === 'animatingToSlot' ? 'rb-card-ghost-animate' : ''
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

/* Player row */

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
  onCardRotate: (key: CardKey, isOwn: boolean) => void
  onCardContextMenu: (
    key: CardKey,
    isOwn: boolean,
  ) => (e: React.MouseEvent<HTMLDivElement>) => void
  onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
  onCardHoverEnd: () => void
  onCardBeginDrag: (
    key: CardKey,
    card: RiftboundCard,
    rotation: number,
    x: number,
    y: number,
  ) => void
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
  onCardRotate,
  onCardContextMenu,
  onCardHoverStart,
  onCardHoverEnd,
  onCardBeginDrag,
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
              onCardRotate={onCardRotate}
              onCardContextMenu={onCardContextMenu}
              onCardHoverStart={onCardHoverStart}
              onCardHoverEnd={onCardHoverEnd}
              onCardBeginDrag={onCardBeginDrag}
              draggingKey={draggingKey}
              debugLabel="top_deck"
            />
            <ZoneCardSlot
              zoneId={discardZone}
              cards={cardsInZone(discardZone)}
              onZoneMouseUp={onZoneMouseUp}
              onCardRotate={onCardRotate}
              onCardContextMenu={onCardContextMenu}
              onCardHoverStart={onCardHoverStart}
              onCardHoverEnd={onCardHoverEnd}
              onCardBeginDrag={onCardBeginDrag}
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
              onCardRotate={onCardRotate}
              onCardContextMenu={onCardContextMenu}
              onCardHoverStart={onCardHoverStart}
              onCardHoverEnd={onCardHoverEnd}
              onCardBeginDrag={onCardBeginDrag}
              draggingKey={draggingKey}
              debugLabel="top_legend"
            />
          </div>
          <div className="flex flex-none items-stretch">
            <ZoneCardSlot
              zoneId={championZone}
              cards={cardsInZone(championZone)}
              onZoneMouseUp={onZoneMouseUp}
              onCardRotate={onCardRotate}
              onCardContextMenu={onCardContextMenu}
              onCardHoverStart={onCardHoverStart}
              onCardHoverEnd={onCardHoverEnd}
              onCardBeginDrag={onCardBeginDrag}
              draggingKey={draggingKey}
              debugLabel="top_champion"
            />
          </div>
          <div className="flex flex-1 items-stretch">
            <ZoneRect
              zoneId={baseZone}
              cards={cardsInZone(baseZone)}
              onZoneMouseUp={onZoneMouseUp}
              onCardRotate={onCardRotate}
              onCardContextMenu={onCardContextMenu}
              onCardHoverStart={onCardHoverStart}
              onCardHoverEnd={onCardHoverEnd}
              onCardBeginDrag={onCardBeginDrag}
              draggingKey={draggingKey}
              debugLabel={`${prefix}_base`}
            />
          </div>
          <div className="flex flex-1 items-stretch">
            <ZoneRect
              zoneId={runeChannelZone}
              cards={cardsInZone(runeChannelZone)}
              onZoneMouseUp={onZoneMouseUp}
              onCardRotate={onCardRotate}
              onCardContextMenu={onCardContextMenu}
              onCardHoverStart={onCardHoverStart}
              onCardHoverEnd={onCardHoverEnd}
              onCardBeginDrag={onCardBeginDrag}
              draggingKey={draggingKey}
              debugLabel={`${prefix}_rune_channel`}
            />
          </div>
          <div className="flex flex-none items-stretch">
            <ZoneCardSlot
              zoneId={runeDeckZone}
              cards={cardsInZone(runeDeckZone)}
              onZoneMouseUp={onZoneMouseUp}
              onCardRotate={onCardRotate}
              onCardContextMenu={onCardContextMenu}
              onCardHoverStart={onCardHoverStart}
              onCardHoverEnd={onCardHoverEnd}
              onCardBeginDrag={onCardBeginDrag}
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
          onCardRotate={onCardRotate}
          onCardContextMenu={onCardContextMenu}
          onCardHoverStart={onCardHoverStart}
          onCardHoverEnd={onCardHoverEnd}
          onCardBeginDrag={onCardBeginDrag}
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
          onCardRotate={onCardRotate}
          onCardContextMenu={onCardContextMenu}
          onCardHoverStart={onCardHoverStart}
          onCardHoverEnd={onCardHoverEnd}
          onCardBeginDrag={onCardBeginDrag}
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
          onCardRotate={onCardRotate}
          onCardContextMenu={onCardContextMenu}
          onCardHoverStart={onCardHoverStart}
          onCardHoverEnd={onCardHoverEnd}
          onCardBeginDrag={onCardBeginDrag}
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
            onCardRotate={onCardRotate}
            onCardContextMenu={onCardContextMenu}
            onCardHoverStart={onCardHoverStart}
            onCardHoverEnd={onCardHoverEnd}
            onCardBeginDrag={onCardBeginDrag}
            draggingKey={draggingKey}
            debugLabel="bot_legend"
          />
          <ZoneCardSlot
            zoneId={championZone}
            cards={cardsInZone(championZone)}
            onZoneMouseUp={onZoneMouseUp}
            onCardRotate={onCardRotate}
            onCardContextMenu={onCardContextMenu}
            onCardHoverStart={onCardHoverStart}
            onCardHoverEnd={onCardHoverEnd}
            onCardBeginDrag={onCardBeginDrag}
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
            onCardRotate={onCardRotate}
            onCardContextMenu={onCardContextMenu}
            onCardHoverStart={onCardHoverStart}
            onCardHoverEnd={onCardHoverEnd}
            onCardBeginDrag={onCardBeginDrag}
            draggingKey={draggingKey}
          />
          <PileSlotWithLabel
            debugLabel="bot_discard"
            zoneId={discardZone}
            cards={cardsInZone(discardZone)}
            onZoneMouseUp={onZoneMouseUp}
            onCardRotate={onCardRotate}
            onCardContextMenu={onCardContextMenu}
            onCardHoverStart={onCardHoverStart}
            onCardHoverEnd={onCardHoverEnd}
            onCardBeginDrag={onCardBeginDrag}
            draggingKey={draggingKey}
          />
        </div>
      </div>
    </div>
  )
}

/* Battlefield rect */

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
  onCardRotate: (key: CardKey, isOwn: boolean) => void
  onCardContextMenu: (
    key: CardKey,
    isOwn: boolean,
  ) => (e: React.MouseEvent<HTMLDivElement>) => void
  onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
  onCardHoverEnd: () => void
  onCardBeginDrag: (
    key: CardKey,
    card: RiftboundCard,
    rotation: number,
    x: number,
    y: number,
  ) => void
  draggingKey: CardKey | null
}

function BattlefieldRect({
  topZone,
  bottomZone,
  topLabel,
  bottomLabel,
  cardsInZone,
  onZoneMouseUp,
  onCardRotate,
  onCardContextMenu,
  onCardHoverStart,
  onCardHoverEnd,
  onCardBeginDrag,
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
          onCardRotate={onCardRotate}
          onCardContextMenu={onCardContextMenu}
          onCardHoverStart={onCardHoverStart}
          onCardHoverEnd={onCardHoverEnd}
          onCardBeginDrag={onCardBeginDrag}
          draggingKey={draggingKey}
          debugLabel={topLabel}
        />
      </div>
      <div className="flex-1 overflow-visible">
        <InnerBattlefieldHalf
          zoneId={bottomZone}
          cards={cardsInZone(bottomZone)}
          onZoneMouseUp={onZoneMouseUp}
          onCardRotate={onCardRotate}
          onCardContextMenu={onCardContextMenu}
          onCardHoverStart={onCardHoverStart}
          onCardHoverEnd={onCardHoverEnd}
          onCardBeginDrag={onCardBeginDrag}
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
  onCardRotate: (key: CardKey, isOwn: boolean) => void
  onCardContextMenu: (
    key: CardKey,
    isOwn: boolean,
  ) => (e: React.MouseEvent<HTMLDivElement>) => void
  onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
  onCardHoverEnd: () => void
  onCardBeginDrag: (
    key: CardKey,
    card: RiftboundCard,
    rotation: number,
    x: number,
    y: number,
  ) => void
  draggingKey: CardKey | null
  debugLabel?: string
}

function InnerBattlefieldHalf({
  zoneId,
  cards,
  onZoneMouseUp,
  onCardRotate,
  onCardContextMenu,
  onCardHoverStart,
  onCardHoverEnd,
  onCardBeginDrag,
  draggingKey,
  debugLabel,
}: InnerBattlefieldHalfProps) {
  const { containerRef, getStyleForIndex } = useStackedCardLayout(cards)

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
            rotation={c.rotation}
            isOwn={c.isOwn}
            onRotate={onCardRotate}
            onContextMenu={onCardContextMenu}
            onHoverStart={onCardHoverStart}
            onHoverEnd={onCardHoverEnd}
            onBeginDrag={onCardBeginDrag}
            draggingKey={draggingKey}
            stackStyle={getStyleForIndex(index)}
          />
        ) : null,
      )}
    </div>
  )
}

/* Rectangular zone (base / rune channel) */

type ZoneRectProps = {
  zoneId: BoardZoneId
  cards: BoardCardInstance[]
  onZoneMouseUp: (
    z: BoardZoneId,
    e: React.MouseEvent<HTMLDivElement>,
  ) => void
  onCardRotate: (key: CardKey, isOwn: boolean) => void
  onCardContextMenu: (
    key: CardKey,
    isOwn: boolean,
  ) => (e: React.MouseEvent<HTMLDivElement>) => void
  onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
  onCardHoverEnd: () => void
  onCardBeginDrag: (
    key: CardKey,
    card: RiftboundCard,
    rotation: number,
    x: number,
    y: number,
  ) => void
  draggingKey: CardKey | null
  debugLabel?: string
}

function ZoneRect({
  zoneId,
  cards,
  onZoneMouseUp,
  onCardRotate,
  onCardContextMenu,
  onCardHoverStart,
  onCardHoverEnd,
  onCardBeginDrag,
  draggingKey,
  debugLabel,
}: ZoneRectProps) {
  const { containerRef, getStyleForIndex } = useStackedCardLayout(cards)

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
            rotation={c.rotation}
            isOwn={c.isOwn}
            onRotate={onCardRotate}
            onContextMenu={onCardContextMenu}
            onHoverStart={onCardHoverStart}
            onHoverEnd={onCardHoverEnd}
            onBeginDrag={onCardBeginDrag}
            draggingKey={draggingKey}
            stackStyle={getStyleForIndex(index)}
          />
        ) : null,
      )}
    </div>
  )
}

/* Card-sized slot (legend / champion / rune deck / discard / deck) */

type ZoneCardSlotProps = {
  zoneId: BoardZoneId
  cards: BoardCardInstance[]
  onZoneMouseUp: (
    z: BoardZoneId,
    e: React.MouseEvent<HTMLDivElement>,
  ) => void
  onCardRotate: (key: CardKey, isOwn: boolean) => void
  onCardContextMenu: (
    key: CardKey,
    isOwn: boolean,
  ) => (e: React.MouseEvent<HTMLDivElement>) => void
  onCardHoverStart: (card: RiftboundCard, x: number, y: number) => void
  onCardHoverEnd: () => void
  onCardBeginDrag: (
    key: CardKey,
    card: RiftboundCard,
    rotation: number,
    x: number,
    y: number,
  ) => void
  draggingKey: CardKey | null
  debugLabel?: string
}

function ZoneCardSlot({
  zoneId,
  cards,
  onZoneMouseUp,
  onCardRotate,
  onCardContextMenu,
  onCardHoverStart,
  onCardHoverEnd,
  onCardBeginDrag,
  draggingKey,
  debugLabel,
}: ZoneCardSlotProps) {
  const { containerRef, getStyleForIndex } = useStackedCardLayout(cards)

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
              rotation={c.rotation}
              isOwn={c.isOwn}
              onRotate={onCardRotate}
              onContextMenu={onCardContextMenu}
              onHoverStart={onCardHoverStart}
              onHoverEnd={onCardHoverEnd}
              onBeginDrag={onCardBeginDrag}
              draggingKey={draggingKey}
              stackStyle={getStyleForIndex(index)}
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

export default MatchGamePage
