// src/hooks/useLobby.ts
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import type { Lobby } from '../types/riftboundGame'
import {
  CARD_KEYS,
  DEFAULT_BOARD_STATE,
  type BoardState,
  type BoardZoneId,
} from '../game/boardConfig'

type UseLobbyResult = {
  lobby: Lobby | null
  loading: boolean
  error: string | null
  boardState: BoardState
  setBoardState: React.Dispatch<React.SetStateAction<BoardState>>
}

export function useLobby(lobbyId?: string): UseLobbyResult {
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [boardState, setBoardState] = useState<BoardState>({
    ...DEFAULT_BOARD_STATE,
  })

  useEffect(() => {
    if (!lobbyId) {
      setLobby(null)
      setBoardState({ ...DEFAULT_BOARD_STATE })
      setError('Missing lobby id')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const lobbyRef = doc(db, 'lobbies', lobbyId)

    const unsub = onSnapshot(
      lobbyRef,
      (snap) => {
        if (!snap.exists()) {
          setLobby(null)
          setBoardState({ ...DEFAULT_BOARD_STATE })
          setError('Lobby not found.')
          setLoading(false)
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
        setLoading(false)
        setError(null)

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
        setError('Failed to load lobby.')
        setLoading(false)
      },
    )

    return () => unsub()
  }, [lobbyId])

  return { lobby, loading, error, boardState, setBoardState }
}
