// src/hooks/useDeckSelection.ts
import { useEffect, useState } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import type { DeckSummary, Lobby, Role } from '../types/riftboundGame'

type UseDeckSelectionArgs = {
  lobby: Lobby | null
  role: Role
  lobbyId?: string
  decks: DeckSummary[]
}

type UseDeckSelectionResult = {
  selectedDeckId: string | null
  setSelectedDeckId: (id: string | null) => void
  myDeckLockedIn: boolean
  opponentDeckLockedIn: boolean
  bothDecksLockedIn: boolean
  saveError: string | null
  saving: boolean
  handleConfirmDeck: () => Promise<void>
}

export function useDeckSelection({
  lobby,
  role,
  lobbyId,
  decks,
}: UseDeckSelectionArgs): UseDeckSelectionResult {
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
      setSaving(true)
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
      setSaving(false)
    }
  }

  return {
    selectedDeckId,
    setSelectedDeckId,
    myDeckLockedIn,
    opponentDeckLockedIn,
    bothDecksLockedIn,
    saveError,
    saving,
    handleConfirmDeck,
  }
}
