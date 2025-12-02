// src/utils/lobby.ts
import { db } from '../firebase'
import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'

type LobbyPlayer = {
  uid: string
  username: string
}

type LobbySpectator = {
  uid: string
  username: string
}

type LobbyData = {
  p1?: LobbyPlayer | null
  p2?: LobbyPlayer | null
  spectators?: LobbySpectator[]
  [key: string]: any
}

/**
 * Move a single user into a specific seat.
 * - Removes that user from any existing seat / spectators.
 * - Never touches other players' seats.
 * - Throws `seat-p1-taken` / `seat-p2-taken` if someone else is already there.
 */
export async function changeLobbySeat(
  lobbyId: string,
  userUid: string,
  username: string,
  seat: 'p1' | 'p2' | 'spectator',
): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', lobbyId)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(lobbyRef)
    if (!snap.exists()) {
      throw new Error('lobby-not-found')
    }

    const data = snap.data() as LobbyData

    const p1 = data.p1 ?? null
    const p2 = data.p2 ?? null
    let spectators: LobbySpectator[] = Array.isArray(data.spectators)
      ? [...data.spectators]
      : []

    const updates: Partial<LobbyData> = {}

    // Remove THIS user from all positions first
    const isP1 = p1 && p1.uid === userUid
    const isP2 = p2 && p2.uid === userUid
    const isSpectator = spectators.some((s) => s.uid === userUid)

    if (isP1) {
      updates.p1 = null
      updates.p1Ready = false
    }
    if (isP2) {
      updates.p2 = null
      updates.p2Ready = false
    }
    if (isSpectator) {
      spectators = spectators.filter((s) => s.uid !== userUid)
      updates.spectators = spectators
    }

    // Now place them into the requested seat
    if (seat === 'p1') {
      // If someone ELSE is already P1, seat is taken
      if (p1 && p1.uid !== userUid) {
        throw new Error('seat-p1-taken')
      }
      updates.p1 = { uid: userUid, username }
      updates.p1Ready = false
    } else if (seat === 'p2') {
      if (p2 && p2.uid !== userUid) {
        throw new Error('seat-p2-taken')
      }
      updates.p2 = { uid: userUid, username }
      updates.p2Ready = false
    } else if (seat === 'spectator') {
      if (!spectators.some((s) => s.uid === userUid)) {
        spectators.push({ uid: userUid, username })
      }
      updates.spectators = spectators
    }

    updates.updatedAt = serverTimestamp()
    tx.update(lobbyRef, updates)
  })
}

/**
 * Remove a user from the lobby completely:
 * - Clears them from P1/P2 if present.
 * - Removes them from spectators.
 */
export async function leaveLobbyForUser(
  lobbyId: string,
  userUid: string,
): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', lobbyId)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(lobbyRef)
    if (!snap.exists()) return

    const data = snap.data() as LobbyData

    const updates: Partial<LobbyData> = {}
    let changed = false

    if (data.p1 && data.p1.uid === userUid) {
      updates.p1 = null
      updates.p1Ready = false
      changed = true
    }

    if (data.p2 && data.p2.uid === userUid) {
      updates.p2 = null
      updates.p2Ready = false
      changed = true
    }

    if (Array.isArray(data.spectators)) {
      const filtered = data.spectators.filter((s: LobbySpectator) => s.uid !== userUid)
      if (filtered.length !== data.spectators.length) {
        updates.spectators = filtered
        changed = true
      }
    }

    if (!changed) return

    updates.updatedAt = serverTimestamp()
    tx.update(lobbyRef, updates)
  })
}
