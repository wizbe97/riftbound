// src/utils/lobby.ts
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Removes userUid from the lobby and applies re-hosting rules.
 *
 * Returns:
 *  - 'ok'           -> lobby updated
 *  - 'deleted'      -> lobby deleted because it became empty
 *  - 'not-in-lobby' -> userUid wasn't part of this lobby
 */
export async function leaveLobbyForUser(
  lobbyId: string,
  userUid: string,
): Promise<'ok' | 'deleted' | 'not-in-lobby'> {
  const lobbyRef = doc(db, 'lobbies', lobbyId)
  const snap = await getDoc(lobbyRef)

  if (!snap.exists()) {
    return 'not-in-lobby'
  }

  const data = snap.data() as any
  const p1 = data.p1 ?? null
  const p2 = data.p2 ?? null
  const spectators: any[] = Array.isArray(data.spectators)
    ? data.spectators
    : []

  const isP1 = p1 && p1.uid === userUid
  const isP2 = p2 && p2.uid === userUid
  const isSpectator = spectators.some((s) => s.uid === userUid)

  if (!isP1 && !isP2 && !isSpectator) {
    return 'not-in-lobby'
  }

  // Base updates always include updatedAt
  let updates: Record<string, any> = {
    updatedAt: serverTimestamp(),
  }

  if (isP1) {
    // Host / P1 is leaving
    if (p2) {
      // Promote P2 to P1 + host
      updates = {
        ...updates,
        hostUid: p2.uid,
        hostUsername: p2.username,
        p1: p2,
        p2: null,
      }
      await updateDoc(lobbyRef, updates)
      return 'ok'
    }

    // No P2 -> delete entire lobby
    await deleteDoc(lobbyRef)
    return 'deleted'
  }

  if (isP2) {
    const newSpectators = spectators.filter((s) => s.uid !== userUid)
    updates = {
      ...updates,
      p2: null,
      spectators: newSpectators,
    }
    await updateDoc(lobbyRef, updates)
    return 'ok'
  }

  // Spectator leaving
  if (isSpectator) {
    const newSpectators = spectators.filter((s) => s.uid !== userUid)
    updates = {
      ...updates,
      spectators: newSpectators,
    }
    await updateDoc(lobbyRef, updates)
    return 'ok'
  }

  return 'not-in-lobby'
}
