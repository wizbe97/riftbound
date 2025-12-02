import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useLobbySession } from '../contexts/LobbyContext'
import { leaveLobbyForUser } from '../utils/lobby'

type LobbyPlayer = {
  uid: string
  username: string
}

type LobbySpectator = {
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
  spectators: LobbySpectator[]
}

type Friend = {
  uid: string
  username: string
  friendCode: string
}

function mapLobby(id: string, data: DocumentData): Lobby {
  return {
    id,
    hostUid: data.hostUid,
    hostUsername: data.hostUsername,
    status: (data.status ?? 'open') as Lobby['status'],
    mode: 'private',
    p1: data.p1 ?? null,
    p2: data.p2 ?? null,
    spectators: data.spectators ?? [],
  }
}

function PrivateMatchLobbyPage() {
  const { user, profile } = useAuth()
  const { lobbyId } = useParams<{ lobbyId: string }>()
  const navigate = useNavigate()
  const { setActiveLobbyId } = useLobbySession()

  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [loadingLobby, setLoadingLobby] = useState(true)

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteRole, setInviteRole] = useState<'player2' | 'spectator' | null>(
    null,
  )
  const [sendingInvites, setSendingInvites] = useState(false)

  // Friends for the invite modal
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [inviteSearch, setInviteSearch] = useState('')
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteStatus, setInviteStatus] = useState<string | null>(null)

  // Leave confirmation
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leavingLobby, setLeavingLobby] = useState(false)

  // Presence map for lobby members
  const [memberStatuses, setMemberStatuses] = useState<Record<string, string>>(
    {},
  )

  // Subscribe to lobby doc
  useEffect(() => {
    if (!lobbyId) return

    const lobbyRef = doc(db, 'lobbies', lobbyId)
    const unsub = onSnapshot(
      lobbyRef,
      (snap) => {
        if (!snap.exists()) {
          setLobby(null)
          setLoadingLobby(false)
          setActiveLobbyId(null)
          navigate('/play')
          return
        }

        const mapped = mapLobby(snap.id, snap.data())
        setLobby(mapped)
        setLoadingLobby(false)
        setActiveLobbyId(snap.id)
      },
      (err) => {
        console.error('[PrivateMatchLobby] Failed to subscribe to lobby', err)
        setLoadingLobby(false)
      },
    )

    return () => unsub()
  }, [lobbyId, navigate, setActiveLobbyId])

  // If we’re no longer a member of the lobby, kick back to Play
  useEffect(() => {
    if (!lobby || !user) return

    const isMember =
      (lobby.p1 && lobby.p1.uid === user.uid) ||
      (lobby.p2 && lobby.p2.uid === user.uid) ||
      lobby.spectators.some((s) => s.uid === user.uid)

    if (!isMember) {
      setActiveLobbyId(null)
      navigate('/play')
    }
  }, [lobby, user, navigate, setActiveLobbyId])

  const isHost = !!(user && lobby && lobby.hostUid === user.uid)
  const isP1 = !!(user && lobby?.p1 && lobby.p1.uid === user.uid)
  const isP2 = !!(user && lobby?.p2 && lobby.p2.uid === user.uid)
  const isSpectator = !!(
    user && lobby?.spectators.some((s) => s.uid === user.uid)
  )

  // Spectator invite rules: both players and spectators can invite spectators
  const canInviteSpectators = !!(isP1 || isP2 || isSpectator)

  const handleBackClick = () => {
    if (!lobby || !user) {
      navigate('/play')
      return
    }

    const isMember =
      isP1 || isP2 || isSpectator

    if (!isMember) {
      navigate('/play')
      return
    }

    setShowLeaveModal(true)
  }

  const handleConfirmLeaveLobby = async () => {
    if (!user || !lobby) {
      setShowLeaveModal(false)
      navigate('/play')
      return
    }

    try {
      setLeavingLobby(true)
      await leaveLobbyForUser(lobby.id, user.uid)
      setActiveLobbyId(null)
      navigate('/play')
    } catch (err) {
      console.error('[PrivateMatchLobby] Failed to leave lobby', err)
      navigate('/play')
    } finally {
      setLeavingLobby(false)
      setShowLeaveModal(false)
    }
  }

  const handleCancelLeaveLobby = () => {
    setShowLeaveModal(false)
  }

  // Try to leave lobby on tab close (best-effort)
  useEffect(() => {
    if (!user || !lobby) return

    const handler = () => {
      void leaveLobbyForUser(lobby.id, user.uid)
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [user, lobby])

  // Load friends for invite modal
  useEffect(() => {
    if (!user) {
      setFriends([])
      return
    }

    setFriendsLoading(true)
    const friendsRef = collection(db, 'users', user.uid, 'friends')

    const unsub = onSnapshot(
      friendsRef,
      (snap) => {
        const data: Friend[] = snap.docs.map((d) => {
          const docData = d.data() as any
          return {
            uid: docData.uid,
            username: docData.username,
            friendCode: docData.friendCode,
          }
        })
        setFriends(data)
        setFriendsLoading(false)
      },
      (err) => {
        console.error(
          '[PrivateMatchLobby] Failed to load friends for invites',
          err,
        )
        setFriendsLoading(false)
      },
    )

    return () => unsub()
  }, [user])

  // Presence tracking for lobby members
  useEffect(() => {
    if (!lobby) return

    const memberUids = new Set<string>()
    if (lobby.p1) memberUids.add(lobby.p1.uid)
    if (lobby.p2) memberUids.add(lobby.p2.uid)
    lobby.spectators.forEach((s) => memberUids.add(s.uid))

    if (memberUids.size === 0) return

    const unsubs: (() => void)[] = []

    memberUids.forEach((uid) => {
      const userRef = doc(db, 'users', uid)
      const unsub = onSnapshot(
        userRef,
        (snap) => {
          if (!snap.exists()) return
          const data = snap.data() as any
          const status = data.status ?? 'offline'
          setMemberStatuses((prev) => ({
            ...prev,
            [uid]: status,
          }))
        },
        (err) => {
          console.error('[PrivateMatchLobby] Presence subscribe failed', err)
        },
      )
      unsubs.push(unsub)
    })

    return () => {
      unsubs.forEach((u) => u())
    }
  }, [lobby])

  // Host cleans up offline P2 / spectators
  useEffect(() => {
    if (!lobby || !user || !isHost) return

    const entries = Object.entries(memberStatuses)
    if (!entries.length) return

    entries.forEach(([uid, status]) => {
      if (status !== 'offline') return
      if (uid === user.uid) return // self handled elsewhere

      // Remove offline member
      void leaveLobbyForUser(lobby.id, uid).catch((err) =>
        console.error('[PrivateMatchLobby] Failed to clean offline member', err),
      )
    })
  }, [memberStatuses, isHost, lobby, user])

  const openInviteModal = (role: 'player2' | 'spectator') => {
    if (!user || !profile || !lobby) return

    // Only host can invite P2
    if (role === 'player2' && !isP1) return

    setInviteRole(role)
    setInviteModalOpen(true)
    setInviteError(null)
    setInviteStatus(null)
    setInviteSearch('')
    setSelectedFriendIds(new Set())
  }

  const closeInviteModal = () => {
    setInviteModalOpen(false)
    setInviteRole(null)
    setInviteError(null)
    setInviteStatus(null)
    setInviteSearch('')
    setSelectedFriendIds(new Set())
  }

  const toggleFriendSelection = (uid: string) => {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  const filteredFriends = useMemo(() => {
    const term = inviteSearch.trim().toLowerCase()
    if (!term) return friends
    return friends.filter((f) =>
      f.username.toLowerCase().includes(term),
    )
  }, [friends, inviteSearch])

  const handleSendInvites = async () => {
    if (!user || !profile || !lobby || !inviteRole) return
    if (selectedFriendIds.size === 0) return

    setInviteError(null)
    setInviteStatus(null)
    setSendingInvites(true)

    try {
      const tasks: Promise<void>[] = []

      selectedFriendIds.forEach((friendUid) => {
        const friend = friends.find((f) => f.uid === friendUid)
        if (!friend) return

        const inviteRef = doc(
          db,
          'users',
          friend.uid,
          'lobbyInvites',
          lobby.id,
        )

        tasks.push(
          setDoc(inviteRef, {
            lobbyId: lobby.id,
            fromUid: user.uid,
            fromUsername: profile.username,
            role: inviteRole,
            status: 'pending',
            createdAt: serverTimestamp(),
          }),
        )
      })

      await Promise.all(tasks)

      setInviteStatus('Invites sent.')
      setSelectedFriendIds(new Set())
    } catch (err) {
      console.error(err)
      setInviteError('Failed to send invites. Please try again.')
    } finally {
      setSendingInvites(false)
    }
  }

  // ---------- Render ----------

  if (!user || !profile) {
    return (
      <section>
        <h1 className="mb-4 text-3xl font-semibold text-amber-300">
          Private Match
        </h1>
        <p className="text-sm text-slate-300">
          You need an account to use private matches.
        </p>
      </section>
    )
  }

  if (loadingLobby) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-sm text-slate-100 hover:border-amber-400 hover:text-amber-200"
          >
            ←
          </button>
          <h1 className="text-2xl font-semibold text-amber-300">
            Private Match Lobby
          </h1>
        </div>
        <p className="text-sm text-slate-300">Loading lobby…</p>
      </section>
    )
  }

  if (!lobby) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-sm text-slate-100 hover:border-amber-400 hover:text-amber-200"
          >
            ←
          </button>
          <h1 className="text-2xl font-semibold text-amber-300">
            Private Match Lobby
          </h1>
        </div>
        <p className="text-sm text-red-300">
          This lobby no longer exists or could not be loaded.
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="space-y-4">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-sm text-slate-100 hover:border-amber-400 hover:text-amber-200"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-amber-300">
              Private Match Lobby
            </h1>
            <p className="text-xs text-slate-400">
              Host: {lobby.hostUsername} • Lobby ID: {lobby.id}
            </p>
          </div>
        </div>

        {/* Player slots */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* P1 */}
          <div className="flex flex-col rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 shadow-md">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
              Player 1 (Host)
            </div>
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-2xl font-bold text-slate-950">
                  {lobby.p1?.username.charAt(0).toUpperCase()}
                </div>
                <div className="text-sm font-semibold text-slate-100">
                  {lobby.p1?.username}
                </div>
                {lobby.p1?.uid === user.uid && (
                  <div className="text-[11px] text-emerald-300">You</div>
                )}
              </div>
            </div>
          </div>

          {/* P2 */}
          <div className="flex flex-col rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 shadow-md">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
              Player 2
            </div>

            {lobby.p2 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-2xl font-bold text-amber-200">
                    {lobby.p2.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-sm font-semibold text-slate-100">
                    {lobby.p2.username}
                  </div>
                  {lobby.p2.uid === user.uid && (
                    <div className="text-[11px] text-emerald-300">You</div>
                  )}
                </div>
              </div>
            ) : isP1 ? (
              <button
                type="button"
                onClick={() => openInviteModal('player2')}
                className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-amber-500/50 bg-slate-900/50 hover:border-amber-400 hover:bg-slate-900/80"
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-4xl leading-none text-amber-300">
                    +
                  </span>
                  <span className="text-sm font-semibold text-amber-200">
                    Invite Friends
                  </span>
                </div>
              </button>
            ) : (
              <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
                Waiting for the host to invite a player.
              </div>
            )}
          </div>
        </div>

        {/* Spectators box */}
        <div className="rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Spectators
            </div>
            {canInviteSpectators && (
              <button
                type="button"
                onClick={() => openInviteModal('spectator')}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/60 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-slate-900/95"
              >
                <span className="text-base leading-none">+</span>
                <span>Invite Friends</span>
              </button>
            )}
          </div>

          {lobby.spectators.length === 0 ? (
            <div className="rounded border border-dashed border-slate-700 px-3 py-4 text-sm text-slate-400">
              No spectators yet.
            </div>
          ) : (
            <ul className="space-y-1 text-sm text-slate-100">
              {lobby.spectators.map((s) => (
                <li key={s.uid} className="flex items-center justify-between">
                  <span>{s.username}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Invite Friends modal */}
      {inviteModalOpen && inviteRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative w-full max-w-lg rounded-xl border border-amber-500/40 bg-slate-950/95 p-5 shadow-2xl">
            {/* Close button */}
            <button
              type="button"
              onClick={closeInviteModal}
              className="absolute right-3 top-3 text-sm text-slate-400 hover:text-slate-100"
              aria-label="Close"
            >
              ×
            </button>

            <h2 className="mb-1 text-lg font-semibold text-amber-200">
              Invite Friends
            </h2>
            <p className="mb-3 text-xs text-slate-300">
              {inviteRole === 'player2'
                ? 'Select a friend to invite as Player 2.'
                : 'Select one or more friends to invite as spectators.'}
            </p>

            {/* Search */}
            <div className="mb-3">
              <input
                type="text"
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                placeholder="Type name to filter…"
                className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Friends list */}
            <div className="max-h-64 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/70">
              {friendsLoading ? (
                <div className="px-3 py-3 text-xs text-slate-400">
                  Loading friends…
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-400">
                  No friends match that search.
                </div>
              ) : (
                <ul className="divide-y divide-slate-900/80 text-sm">
                  {filteredFriends.map((f) => {
                    const checked = selectedFriendIds.has(f.uid)
                    return (
                      <li
                        key={f.uid}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-900/80"
                        onClick={() => toggleFriendSelection(f.uid)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFriendSelection(f.uid)}
                          className="h-4 w-4 accent-amber-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-amber-300">
                          {f.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-slate-100">
                            {f.username}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {f.friendCode}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Status / errors */}
            {inviteError && (
              <div className="mt-3 rounded border border-red-500/60 bg-red-950/60 px-3 py-1.5 text-[11px] text-red-200">
                {inviteError}
              </div>
            )}
            {inviteStatus && !inviteError && (
              <div className="mt-3 rounded border border-emerald-500/60 bg-emerald-950/50 px-3 py-1.5 text-[11px] text-emerald-200">
                {inviteStatus}
              </div>
            )}

            {/* Footer buttons */}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeInviteModal}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  sendingInvites || selectedFriendIds.size === 0 || friendsLoading
                }
                onClick={handleSendInvites}
                className="rounded-md bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingInvites ? 'Sending…' : 'Send Invites'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave lobby confirmation modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative w-full max-w-sm rounded-xl border border-amber-500/40 bg-slate-950/95 p-5 shadow-2xl">
            <button
              type="button"
              onClick={handleCancelLeaveLobby}
              className="absolute right-3 top-3 text-sm text-slate-400 hover:text-slate-100"
              aria-label="Close"
            >
              ×
            </button>

            <h2 className="mb-2 text-lg font-semibold text-amber-200">
              Leave Lobby?
            </h2>
            <p className="mb-4 text-sm text-slate-300">
              Leaving will remove you from this lobby. Are you sure you want to
              leave?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelLeaveLobby}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={handleConfirmLeaveLobby}
                disabled={leavingLobby}
                className="rounded-md bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {leavingLobby ? 'Leaving…' : 'Leave Lobby'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default PrivateMatchLobbyPage
