// src/pages/MatchGamePage.tsx
import { useEffect, useMemo, useState } from 'react'
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
import {
  MatchGameBoard,
  DEFAULT_BOARD_STATE,
  CARD_KEYS,
  getNextRotationForZone,
  isPileZone,
  type BoardState,
  type BoardZoneId,
  type CardKey,
  type Role,
} from '../components/board/MatchGameBoard'
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

    const nextRotation = getNextRotationForZone(
      current.rotation ?? 0,
      zoneId,
      rotationOverride,
    )

    const nextLocal: BoardCardState = { zoneId, rotation: nextRotation }

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

  type BoardCardState = {
    zoneId: BoardZoneId
    rotation: number
  }

  const handleRotateCard = async (cardKey: CardKey) => {
    if (!lobbyId) return

    const current = boardState[cardKey] ?? DEFAULT_BOARD_STATE[cardKey]

    // Cards in deck/discard piles should stay upright and not rotate.
    if (isPileZone(current.zoneId)) {
      return
    }

    const nextRotation = current.rotation === 90 ? 0 : 90
    const nextLocal: BoardCardState = {
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
        <div className="rb-game-main flex flex-col gap-2">
          {/* Header under navbar */}
          <div className="flex items-center justify-between px-4 pt-2">
            <div className="text-right text-xs text-slate-400" />
          </div>

          {/* Board */}
          <div className="flex-1 px-2 pb-2">
            <MatchGameBoard
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

export default MatchGamePage
