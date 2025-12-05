import type React from 'react'
import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type CSSProperties,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ALL_CARDS, type RiftboundCard } from '../data/riftboundCards'
import { InteractiveCard } from '../components/cards/InteractiveCard'
import '../styles/gameplay.css'

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type LobbyPlayer = {
  uid: string
  username: string
}

type Lobby = {
  id: string
  hostUid: string
  hostUsername: string
  status: 'open' | 'in-game' | 'closed'
  mode: 'private'
  p1: LobbyPlayer | null
  p2: LobbyPlayer | null
  spectators: LobbyPlayer[]
  rules: {
    bestOf: 1 | 3
    sideboard: boolean
  }
  p1DeckId?: string | null
  p2DeckId?: string | null
  p1LegendCardId?: string | null
  p1ChampionCardId?: string | null
  p2LegendCardId?: string | null
  p2ChampionCardId?: string | null
}

type DeckCardDoc = { cardId: string; quantity: number }

type DeckDoc = {
  name: string
  ownerUid: string
  cards: DeckCardDoc[]
  sideboard?: DeckCardDoc[]
  legendCardId?: string | null
  championCardId?: string | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

type DeckSummary = {
  id: string
  name: string
  cardCount: number
  legendCardId: string | null
  championCardId: string | null
}

type RouteParams = {
  lobbyId: string
}

type Role = 'p1' | 'p2' | 'spectator' | 'none'

type CardKey = 'p1Legend' | 'p1Champion' | 'p2Legend' | 'p2Champion'

const CARD_KEYS: CardKey[] = ['p1Legend', 'p1Champion', 'p2Legend', 'p2Champion']

type BoardZoneId =
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

type BoardCardPlacement = {
  zoneId: BoardZoneId
  rotation: number // 0 or 90
}

type BoardState = Record<CardKey, BoardCardPlacement>

const DEFAULT_BOARD_STATE: BoardState = {
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

const isPileZone = (zoneId: BoardZoneId): boolean => PILE_ZONES.includes(zoneId)

const canRoleUseZone = (role: Role, zoneId: BoardZoneId): boolean => {
  if (role !== 'p1' && role !== 'p2') return false
  return OWN_ZONES[role].includes(zoneId)
}

/* ------------------------------------------------------------------ */
/* Page component                                                     */
/* ------------------------------------------------------------------ */

function MatchGamePage() {
  const { lobbyId } = useParams<RouteParams>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [lobbyLoading, setLobbyLoading] = useState(true)
  const [lobbyError, setLobbyError] = useState<string | null>(null)

  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [decksLoading, setDecksLoading] = useState(true)
  const [decksError, setDecksError] = useState<string | null>(null)

  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null)
  const [savingDeckChoice, setSavingDeckChoice] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [boardState, setBoardState] = useState<BoardState>(() => ({
    ...DEFAULT_BOARD_STATE,
  }))

  // Card lookup map
  const cardById = useMemo(() => {
    const map = new Map<string, RiftboundCard>()
    for (const card of ALL_CARDS) map.set(card.id, card)
    return map
  }, [])

  /* -------------------------- Lobby subscription -------------------------- */

  useEffect(() => {
    if (!lobbyId) {
      setLobbyError('Missing lobby id')
      setLobbyLoading(false)
      return
    }

    const lobbyRef = doc(db, 'lobbies', lobbyId)

    const unsub = onSnapshot(
      lobbyRef,
      (snap) => {
        if (!snap.exists()) {
          setLobby(null)
          setLobbyError('Lobby not found.')
          setLobbyLoading(false)
          return
        }

        const data = snap.data() as any

        const nextLobby: Lobby = {
          id: snap.id,
          hostUid: data.hostUid,
          hostUsername: data.hostUsername,
          status: data.status ?? 'open',
          mode: data.mode ?? 'private',
          p1: data.p1 ?? null,
          p2: data.p2 ?? null,
          spectators: Array.isArray(data.spectators) ? data.spectators : [],
          rules: {
            bestOf: (data.rules?.bestOf === 3 ? 3 : 1) as 1 | 3,
            sideboard: !!data.rules?.sideboard,
          },
          p1DeckId: data.p1DeckId ?? null,
          p2DeckId: data.p2DeckId ?? null,
          p1LegendCardId: data.p1LegendCardId ?? null,
          p1ChampionCardId: data.p1ChampionCardId ?? null,
          p2LegendCardId: data.p2LegendCardId ?? null,
          p2ChampionCardId: data.p2ChampionCardId ?? null,
        }

        setLobby(nextLobby)
        setLobbyLoading(false)
        setLobbyError(null)

        // Board state (optional)
        const rawBoard = (data.boardState ?? {}) as Record<string, any>
        const merged: BoardState = { ...DEFAULT_BOARD_STATE }

        CARD_KEYS.forEach((key) => {
          const entry = rawBoard[key]
          if (entry && typeof entry.zoneId === 'string') {
            merged[key] = {
              zoneId: entry.zoneId as BoardZoneId,
              rotation:
                typeof entry.rotation === 'number'
                  ? entry.rotation
                  : Number(entry.rotation) || 0,
            }
          }
        })

        setBoardState(merged)
      },
      (err) => {
        console.error('[MatchGame] failed to subscribe to lobby', err)
        setLobbyError('Failed to load lobby.')
        setLobbyLoading(false)
      },
    )

    return () => unsub()
  }, [lobbyId])

  // if lobby closed, kick back
  useEffect(() => {
    if (!lobby) return
    if (lobby.status === 'closed') navigate('/play')
  }, [lobby, navigate])

  /* ------------------------------ Role logic ------------------------------ */

  const role: Role = useMemo(() => {
    if (!profile || !lobby) return 'none'
    if (lobby.p1?.uid === profile.uid) return 'p1'
    if (lobby.p2?.uid === profile.uid) return 'p2'
    if (lobby.spectators.some((s) => s.uid === profile.uid)) return 'spectator'
    return 'none'
  }, [lobby, profile])

  /* ----------------------------- Deck loading ----------------------------- */

  useEffect(() => {
    if (!user) {
      setDecks([])
      setDecksLoading(false)
      return
    }

    const decksRef = collection(db, 'users', user.uid, 'decks')
    const q = query(decksRef, orderBy('createdAt', 'desc'))

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DeckSummary[] = snap.docs.map((d) => {
          const data = d.data() as DeckDoc
          const mainCount = (data.cards ?? []).reduce(
            (sum, c) => sum + (c.quantity ?? 0),
            0,
          )
          const sideCount = (data.sideboard ?? []).reduce(
            (sum, c) => sum + (c.quantity ?? 0),
            0,
          )

          return {
            id: d.id,
            name: data.name ?? 'Untitled Deck',
            cardCount: mainCount + sideCount,
            legendCardId: data.legendCardId ?? null,
            championCardId: data.championCardId ?? null,
          }
        })

        setDecks(list)
        setDecksLoading(false)
        setDecksError(null)
      },
      (err) => {
        console.error('[MatchGame] failed to load decks', err)
        setDecks([])
        setDecksLoading(false)
        setDecksError('Failed to load your decks.')
      },
    )

    return () => unsub()
  }, [user?.uid])

  // Seed deck selection from lobby
  useEffect(() => {
    if (!lobby || role === 'none' || role === 'spectator') return

    const currentDeckId =
      role === 'p1' ? lobby.p1DeckId ?? null : lobby.p2DeckId ?? null

    if (currentDeckId && !selectedDeckId) setSelectedDeckId(currentDeckId)
  }, [lobby, role, selectedDeckId])

  const myDeckLockedIn =
    role === 'p1'
      ? !!lobby?.p1DeckId
      : role === 'p2'
        ? !!lobby?.p2DeckId
        : true

  const opponentDeckLockedIn =
    role === 'p1'
      ? !!lobby?.p2DeckId
      : role === 'p2'
        ? !!lobby?.p1DeckId
        : !!(lobby?.p1DeckId && lobby?.p2DeckId)

  const bothDecksLockedIn = !!(lobby?.p1DeckId && lobby?.p2DeckId)

  const handleConfirmDeck = async () => {
    if (!lobby || !lobbyId) return
    if (role !== 'p1' && role !== 'p2') return

    if (!selectedDeckId) {
      setSaveError('Please select a deck first.')
      return
    }

    const deck = decks.find((d) => d.id === selectedDeckId)
    if (!deck) {
      setSaveError('Selected deck not found.')
      return
    }

    try {
      setSavingDeckChoice(true)
      setSaveError(null)

      const lobbyRef = doc(db, 'lobbies', lobbyId)
      const payload: any = {
        updatedAt: serverTimestamp(),
      }

      if (role === 'p1') {
        payload.p1DeckId = deck.id
        payload.p1LegendCardId = deck.legendCardId ?? null
        payload.p1ChampionCardId = deck.championCardId ?? null
      } else {
        payload.p2DeckId = deck.id
        payload.p2LegendCardId = deck.legendCardId ?? null
        payload.p2ChampionCardId = deck.championCardId ?? null
      }

      await updateDoc(lobbyRef, payload)
    } catch (err) {
      console.error('[MatchGame] failed to confirm deck', err)
      setSaveError('Failed to confirm deck. Please try again.')
    } finally {
      setSavingDeckChoice(false)
    }
  }

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

    const nextLocal: BoardCardPlacement = { zoneId, rotation: nextRotation }

    setBoardState((prev) => ({
      ...prev,
      [cardKey]: nextLocal,
    }))

    try {
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
    const nextLocal: BoardCardPlacement = {
      ...current,
      rotation: nextRotation,
    }

    setBoardState((prev) => ({
      ...prev,
      [cardKey]: nextLocal,
    }))

    try {
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
        <div className="rb-game-main flex flex-col">
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

        {/* Right-side spacer reserved for future chat */}
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
          saving={savingDeckChoice}
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
                  className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${selectedDeckId === deck.id
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
/* Board layout                                                       */
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
/* Stacking helper                                                    */
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

    if (typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(() => compute())
    ro.observe(el)

    return () => ro.disconnect()
  }, [cards.length])

  const getStyleForIndex = (index: number): CSSProperties => {
    const { containerWidth, cardWidth } = layout
    const count = cards.length

    if (count <= 1 || !containerWidth || !cardWidth) {
      return index === 0 ? {} : { marginLeft: 8 }
    }

    const idealGap = 8
    const idealSpacing = cardWidth + idealGap
    const maxSpacing = (containerWidth - cardWidth) / (count - 1)
    const spacing = Math.min(idealSpacing, maxSpacing)
    const marginLeft = index === 0 ? 0 : spacing - cardWidth
    return { marginLeft }
  }

  return { containerRef, getStyleForIndex }
}

/* ------------------------------------------------------------------ */
/* Grid layout config                                                 */
/* ------------------------------------------------------------------ */

type ZoneVisualKind = 'card' | 'rectWide'

type LayoutCell = {
  id: string
  zoneId: BoardZoneId
  kind: ZoneVisualKind
  row: number
  colStart: number
  colSpan: number
  debugLabel?: string
  offsetLeft?: number
  offsetRight?: number
  offsetTop?: number
  offsetBottom?: number
}

// global spacing
const ROW_GAP_DEFAULT = 16 // px
const COL_GAP_DEFAULT = 8 // px – small so deck/discard are close together

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

    if (centerY - half < margin) centerY = margin + half
    if (centerY + half > viewportH - margin)
      centerY = viewportH - margin - half

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

  useEffect(() => {
    if (!drag || drag.phase !== 'dragging') return

    const handleMove = (e: MouseEvent) => {
      if (e.clientX === 0 && e.clientY === 0) return
      setDrag((prev) =>
        prev && prev.phase === 'dragging'
          ? { ...prev, x: e.clientX, y: e.clientY }
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
    onMoveCard(key, zoneId, nextRotation)

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

  /* ----------------------- Perspective zone mapping ---------------------- */

  const topZones = viewerIsP1
    ? {
      deck: 'p2Deck' as BoardZoneId,
      discard: 'p2Discard' as BoardZoneId,
      champion: 'p2ChampionZone' as BoardZoneId,
      legend: 'p2LegendZone' as BoardZoneId,
      base: 'p2Base' as BoardZoneId,
      runeChannel: 'p2RuneChannel' as BoardZoneId,
      runes: 'p2RuneDeck' as BoardZoneId,
      hand: 'p2Hand' as BoardZoneId,            // 👈 NEW
      battle1: 'battlefieldLeftP2' as BoardZoneId,
      battle2: 'battlefieldRightP2' as BoardZoneId,
    }
    : {
      deck: 'p1Deck' as BoardZoneId,
      discard: 'p1Discard' as BoardZoneId,
      champion: 'p1ChampionZone' as BoardZoneId,
      legend: 'p1LegendZone' as BoardZoneId,
      base: 'p1Base' as BoardZoneId,
      runeChannel: 'p1RuneChannel' as BoardZoneId,
      runes: 'p1RuneDeck' as BoardZoneId,
      hand: 'p1Hand' as BoardZoneId,            // 👈 NEW
      battle1: 'battlefieldLeftP1' as BoardZoneId,
      battle2: 'battlefieldRightP1' as BoardZoneId,
    }

  const bottomZones = viewerIsP1
    ? {
      deck: 'p1Deck' as BoardZoneId,
      discard: 'p1Discard' as BoardZoneId,
      champion: 'p1ChampionZone' as BoardZoneId,
      legend: 'p1LegendZone' as BoardZoneId,
      base: 'p1Base' as BoardZoneId,
      runeChannel: 'p1RuneChannel' as BoardZoneId,
      runes: 'p1RuneDeck' as BoardZoneId,
      hand: 'p1Hand' as BoardZoneId,            // 👈 NEW
      battle1: 'battlefieldLeftP1' as BoardZoneId,
      battle2: 'battlefieldRightP1' as BoardZoneId,
    }
    : {
      deck: 'p2Deck' as BoardZoneId,
      discard: 'p2Discard' as BoardZoneId,
      champion: 'p2ChampionZone' as BoardZoneId,
      legend: 'p2LegendZone' as BoardZoneId,
      base: 'p2Base' as BoardZoneId,
      runeChannel: 'p2RuneChannel' as BoardZoneId,
      runes: 'p2RuneDeck' as BoardZoneId,
      hand: 'p2Hand' as BoardZoneId,            // 👈 NEW
      battle1: 'battlefieldLeftP2' as BoardZoneId,
      battle2: 'battlefieldRightP2' as BoardZoneId,
    }


  /* --------------------------- Layout cells ------------------------------ */
  // 6 logical columns:
  // 1: left card, 2: left card, 3: wide left, 4: wide right, 5: right card, 6: right card

  const layoutCells: LayoutCell[] = [
    // Row 1 – top deck/discard (top-left)
    {
      id: 'top_deck',
      zoneId: topZones.deck,
      kind: 'card',
      row: 1,
      colStart: 1,
      colSpan: 1,
      debugLabel: 'Top Deck',
    },
    {
      id: 'top_discard',
      zoneId: topZones.discard,
      kind: 'card',
      row: 1,
      colStart: 2,
      colSpan: 1,
      debugLabel: 'Top Discard',
    },

    {
      id: 'top_hand',
      zoneId: topZones.hand,
      kind: 'rectWide',
      row: 1,
      colStart: 3,        // uses cols 3–4
      colSpan: 2,
      debugLabel: 'Top Hand',
    },

    // Row 2 – champs/legend + base/rune channel + top runes
    {
      id: 'top_champion',
      zoneId: topZones.champion,
      kind: 'card',
      row: 2,
      colStart: 1,
      colSpan: 1,
      debugLabel: 'Top Champion',
    },
    {
      id: 'top_legend',
      zoneId: topZones.legend,
      kind: 'card',
      row: 2,
      colStart: 2,
      colSpan: 1,
      debugLabel: 'Top Legend',
    },
    {
      id: 'top_base',
      zoneId: topZones.base,
      kind: 'rectWide',
      row: 2,
      colStart: 3,
      colSpan: 1,
      debugLabel: 'Top Base',
    },
    {
      id: 'top_rune_channel',
      zoneId: topZones.runeChannel,
      kind: 'rectWide',
      row: 2,
      colStart: 4,
      colSpan: 2,
      debugLabel: 'Top Rune Channel',
    },
    {
      id: 'top_runes',
      zoneId: topZones.runes,
      kind: 'card',
      row: 2,
      colStart: 6, // move to far-right card column so it lines up with bot champs/deck
      colSpan: 1,
      debugLabel: 'Top Runes',
    },

    // Row 3 – top battle lanes
    {
      id: 'top_battle1',
      zoneId: topZones.battle1,
      kind: 'rectWide',
      row: 3,
      colStart: 1, // start inline with Top Champion / row left edge
      colSpan: 3, // spans 1–3
      debugLabel: 'Top Battle 1',
    },
    {
      id: 'top_battle2',
      zoneId: topZones.battle2,
      kind: 'rectWide',
      row: 3,
      colStart: 4, // ends at column 6 -> inline with right-hand card columns
      colSpan: 3, // spans 4–6
      debugLabel: 'Top Battle 2',
    },

    // Row 4 – bottom battle lanes
    {
      id: 'bot_battle1',
      zoneId: bottomZones.battle1,
      kind: 'rectWide',
      row: 4,
      colStart: 1, // inline with Bot Runes / row left edge
      colSpan: 3,
      debugLabel: 'Bot Battle 1',
    },
    {
      id: 'bot_battle2',
      zoneId: bottomZones.battle2,
      kind: 'rectWide',
      row: 4,
      colStart: 4, // ends inline with Bot Champion / Bot Deck / Bot Discard
      colSpan: 3,
      debugLabel: 'Bot Battle 2',
    },

    // Row 5 – bot runes + rune channel/base + bot legend/champion
    {
      id: 'bot_runes',
      zoneId: bottomZones.runes,
      kind: 'card',
      row: 5,
      colStart: 1,
      colSpan: 1,
      debugLabel: 'Bot Runes',
    },
    {
      id: 'bot_rune_channel',
      zoneId: bottomZones.runeChannel,
      kind: 'rectWide',
      row: 5,
      colStart: 2,
      colSpan: 2,
      debugLabel: 'Bot Rune Channel',
    },
    {
      id: 'bot_base',
      zoneId: bottomZones.base,
      kind: 'rectWide',
      row: 5,
      colStart: 4,
      colSpan: 1,
      debugLabel: 'Bot Base',
    },
    {
      id: 'bot_legend',
      zoneId: bottomZones.legend,
      kind: 'card',
      row: 5,
      colStart: 5,
      colSpan: 1,
      debugLabel: 'Bot Legend',
    },
    {
      id: 'bot_champion',
      zoneId: bottomZones.champion,
      kind: 'card',
      row: 5,
      colStart: 6,
      colSpan: 1,
      debugLabel: 'Bot Champion',
    },

    // Row 6 – bot deck/discard (bottom-right)
    {
      id: 'bot_hand',
      zoneId: bottomZones.hand,
      kind: 'rectWide',
      row: 6,
      colStart: 3,        // uses cols 3–4, symmetric with top hand
      colSpan: 2,
      debugLabel: 'Bot Hand',
    },
    {
      id: 'bot_deck',
      zoneId: bottomZones.deck,
      kind: 'card',
      row: 6,
      colStart: 5,
      colSpan: 1,
      debugLabel: 'Bot Deck',
    },
    {
      id: 'bot_discard',
      zoneId: bottomZones.discard,
      kind: 'card',
      row: 6,
      colStart: 6,
      colSpan: 1,
      debugLabel: 'Bot Discard',
    },
  ]

  // Row spacing rules:
  // - row 1: no margin (top of board)
  // - row 2: gap from row 1
  // - row 3: gap from row 2
  // - row 4: **no gap from row 3** (battlefields touch)
  // - row 5: gap from row 4
  // - row 6: gap from row 5
  const getRowMarginTop = (row: number): number => {
    if (row === 1) return 0
    if (row === 4) return -2; // overlap top & bottom battlefields by 2px
    return ROW_GAP_DEFAULT
  }

  const cellsWithOffsets: LayoutCell[] = layoutCells.map((cell) => ({
    ...cell,
    offsetTop:
      typeof cell.offsetTop === 'number'
        ? cell.offsetTop
        : getRowMarginTop(cell.row),
  }))

  const draggingKey = drag?.key ?? null

  const handleBoardMouseUp = () => {
    if (drag && drag.phase === 'dragging') {
      handleCardEndDragCancel()
    }
  }

  const currentGhostRotation =
    drag?.phase === 'animatingToSlot' ? drag.toRotation : drag?.fromRotation

  return (
    <div
      className="rb-game-board relative h-full rounded-xl bg-slate-950/80 px-4 py-4"
      onClick={ctxMenu.open ? closeContextMenu : undefined}
      onMouseUp={handleBoardMouseUp}
    >
      {/* Context menu */}
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

      {/* Grid container */}
      <div
        className="w-full h-full"
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(var(--rb-card-width), auto) minmax(var(--rb-card-width), auto) minmax(0, 2.5fr) minmax(0, 2.5fr) minmax(var(--rb-card-width), auto) minmax(var(--rb-card-width), auto)',
          gridAutoRows: 'auto',
          rowGap: 0, // no global vertical gap; we control per-row spacing via margins
          columnGap: COL_GAP_DEFAULT,
          alignItems: 'stretch',
        }}
      >
        {cellsWithOffsets.map((cell) => {
          const cards = cardsInZone(cell.zoneId)
          const cellStyle: CSSProperties = {
            gridRow: cell.row,
            gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
            marginLeft: cell.offsetLeft ?? 0,
            marginRight: cell.offsetRight ?? 0,
            marginTop: cell.offsetTop ?? 0,
            marginBottom: cell.offsetBottom ?? 0,
          }

          if (cell.kind === 'card') {
            return (
              <ZoneCardSlot
                key={cell.id}
                zoneId={cell.zoneId}
                cards={cards}
                onZoneMouseUp={handleZoneMouseUp}
                onCardRotate={handleCardRotate}
                onCardContextMenu={handleCardContextMenu}
                onCardHoverStart={handleHoverStart}
                onCardHoverEnd={handleHoverEnd}
                onCardBeginDrag={handleCardBeginDrag}
                draggingKey={draggingKey}
                debugLabel={cell.debugLabel}
                cellStyle={cellStyle}
              />
            )
          }

          return (
            <ZoneRect
              key={cell.id}
              zoneId={cell.zoneId}
              cards={cards}
              onZoneMouseUp={handleZoneMouseUp}
              onCardRotate={handleCardRotate}
              onCardContextMenu={handleCardContextMenu}
              onCardHoverStart={handleHoverStart}
              onCardHoverEnd={handleHoverEnd}
              onCardBeginDrag={handleCardBeginDrag}
              draggingKey={draggingKey}
              debugLabel={cell.debugLabel}
              cellStyle={cellStyle}
            />
          )
        })}
      </div>

      {/* Hover preview */}
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

      {/* Drag ghost */}
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
/* Zone components                                                    */
/* ------------------------------------------------------------------ */

type CommonZoneHandlers = {
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

type ZoneRectProps = CommonZoneHandlers & {
  zoneId: BoardZoneId
  cards: BoardCardInstance[]
  debugLabel?: string
  cellStyle?: CSSProperties
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
  cellStyle,
}: ZoneRectProps) {
  const { containerRef, getStyleForIndex } = useStackedCardLayout(cards)

  return (
    <div
      style={cellStyle}
      onMouseUp={(e) => onZoneMouseUp(zoneId, e)}
      ref={containerRef}
      className="rb-zone-rect relative flex items-center justify-center overflow-visible rounded-xl border border-amber-500/40 bg-slate-900/40 px-3"
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

type ZoneCardSlotProps = CommonZoneHandlers & {
  zoneId: BoardZoneId
  cards: BoardCardInstance[]
  debugLabel?: string
  cellStyle?: CSSProperties
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
  cellStyle,
}: ZoneCardSlotProps) {
  const { containerRef, getStyleForIndex } = useStackedCardLayout(cards)

  return (
    <div style={cellStyle} className="relative flex h-full flex-col items-center">
      <div
        onMouseUp={(e) => onZoneMouseUp(zoneId, e)}
        ref={containerRef}
        className="rb-zone-card-slot-inner relative flex items-center justify-center overflow-visible rounded-lg border border-amber-500/40 bg-slate-900/60"
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

export default MatchGamePage
