// src/hooks/useUserDecks.ts
import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import type { DeckDoc, DeckSummary } from '../types/riftboundGame'

type UseUserDecksResult = {
  decks: DeckSummary[]
  loading: boolean
  error: string | null
}

export function useUserDecks(userId?: string): UseUserDecksResult {
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setDecks([])
      setLoading(false)
      setError(null)
      return
    }

    const decksRef = collection(db, 'users', userId, 'decks')
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
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[MatchGame] failed to load decks', err)
        setDecks([])
        setLoading(false)
        setError('Failed to load your decks.')
      },
    )

    return () => unsub()
  }, [userId])

  return { decks, loading, error }
}
