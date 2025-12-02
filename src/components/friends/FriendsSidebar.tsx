// src/components/friends/FriendsSidebar.tsx
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../firebase'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore'

type Friend = {
  uid: string
  username: string
  friendCode: string
}

type FriendRequest = {
  id: string
  fromUid: string
  fromUsername: string
  fromFriendCode: string
  status: string
}

type FriendStatus = {
  status: string
  lastActive?: Timestamp
}

type LobbyInvite = {
  id: string
  lobbyId: string
  fromUid: string
  fromUsername: string
  role: 'player2' | 'spectator'
  status: string
}

function FriendsSidebar() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [friends, setFriends] = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [lobbyInvites, setLobbyInvites] = useState<LobbyInvite[]>([])
  const [friendStatuses, setFriendStatuses] = useState<
    Record<string, FriendStatus>
  >({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [showRequestsModal, setShowRequestsModal] = useState(false)
  const [friendCodeInput, setFriendCodeInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Subscribe to friend list + friend requests + lobby invites
  useEffect(() => {
    if (!user) {
      setFriends([])
      setRequests([])
      setLobbyInvites([])
      return
    }

    const friendsRef = collection(db, 'users', user.uid, 'friends')
    const requestsRef = collection(db, 'users', user.uid, 'friendRequests')
    const lobbyInvitesRef = collection(db, 'users', user.uid, 'lobbyInvites')

    const unsubFriends = onSnapshot(friendsRef, (snap) => {
      const data: Friend[] = snap.docs.map((d) => {
        const docData = d.data() as any
        return {
          uid: docData.uid,
          username: docData.username,
          friendCode: docData.friendCode,
        }
      })
      setFriends(data)
    })

    const unsubRequests = onSnapshot(requestsRef, (snap) => {
      const data: FriendRequest[] = snap.docs.map((d) => {
        const docData = d.data() as any
        return {
          id: d.id,
          fromUid: docData.fromUid,
          fromUsername: docData.fromUsername,
          fromFriendCode: docData.fromFriendCode,
          status: docData.status ?? 'pending',
        }
      })
      setRequests(data)
    })

    const unsubLobbyInvites = onSnapshot(lobbyInvitesRef, (snap) => {
      const data: LobbyInvite[] = snap.docs.map((d) => {
        const docData = d.data() as any
        return {
          id: d.id,
          lobbyId: docData.lobbyId,
          fromUid: docData.fromUid,
          fromUsername: docData.fromUsername,
          role: (docData.role ?? 'player2') as 'player2' | 'spectator',
          status: docData.status ?? 'pending',
        }
      })
      setLobbyInvites(data)
    })

    return () => {
      unsubFriends()
      unsubRequests()
      unsubLobbyInvites()
    }
  }, [user])

  // Subscribe to each friend's user doc for presence info
  useEffect(() => {
    if (!friends.length) {
      setFriendStatuses({})
      return
    }

    const unsubscribers = friends.map((f) => {
      const userRef = doc(db, 'users', f.uid)
      return onSnapshot(
        userRef,
        (snap) => {
          if (!snap.exists()) return
          const data = snap.data() as any
          setFriendStatuses((prev) => ({
            ...prev,
            [f.uid]: {
              status: data.status ?? 'offline',
              lastActive: data.lastActive,
            },
          }))
        },
        (err) => {
          console.error(
            '[FriendsSidebar] Failed to subscribe to friend status',
            err,
          )
        },
      )
    })

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [friends])

  if (!user || !profile) return null

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const pendingLobbyInvites = lobbyInvites.filter(
    (inv) => inv.status === 'pending',
  )

  // ---- Modal open/close helpers ----

  const handleOpenAddModal = () => {
    setError(null)
    setStatus(null)
    setFriendCodeInput('')
    setShowAddModal(true)
  }

  const handleCloseAddModal = () => {
    setShowAddModal(false)
    setError(null)
    setStatus(null)
    setFriendCodeInput('')
  }

  const handleOpenRequestsModal = () => {
    setError(null)
    setStatus(null)
    setShowRequestsModal(true)
  }

  const handleCloseRequestsModal = () => {
    setShowRequestsModal(false)
    setError(null)
    setStatus(null)
  }

  // ---- Friend request send / accept ----

  const handleSendFriendRequest = async () => {
    setError(null)
    setStatus(null)

    if (!user || !profile) return

    const raw = friendCodeInput.trim().toUpperCase()
    if (!raw) {
      setError('Enter a friend code.')
      return
    }

    if (raw.length !== 5) {
      setError('Friend codes are 5 characters.')
      return
    }

    if (raw === profile.friendCode) {
      setError('You cannot add yourself.')
      return
    }

    try {
      setBusy(true)
      const codeRef = doc(db, 'friendCodes', raw)
      const codeSnap = await getDoc(codeRef)

      if (!codeSnap.exists()) {
        setError('No user found with that friend code.')
        return
      }

      const data = codeSnap.data() as any
      const targetUid: string = data.uid

      const requestRef = doc(db, 'users', targetUid, 'friendRequests', user.uid)
      await setDoc(requestRef, {
        fromUid: user.uid,
        fromUsername: profile.username,
        fromFriendCode: profile.friendCode,
        status: 'pending',
        createdAt: serverTimestamp(),
      })

      setStatus('Friend request sent.')
      setFriendCodeInput('')
    } catch (err) {
      console.error(err)
      setError('Failed to send friend request.')
    } finally {
      setBusy(false)
    }
  }

  const handleRespondToRequest = async (
    request: FriendRequest,
    accept: boolean,
  ) => {
    if (!user || !profile) return
    setBusy(true)
    setError(null)

    try {
      const requestRef = doc(
        db,
        'users',
        user.uid,
        'friendRequests',
        request.fromUid,
      )

      if (accept) {
        const myFriendRef = doc(db, 'users', user.uid, 'friends', request.fromUid)
        const theirFriendRef = doc(
          db,
          'users',
          request.fromUid,
          'friends',
          user.uid,
        )

        await Promise.all([
          setDoc(myFriendRef, {
            uid: request.fromUid,
            username: request.fromUsername,
            friendCode: request.fromFriendCode,
            createdAt: serverTimestamp(),
          }),
          setDoc(theirFriendRef, {
            uid: user.uid,
            username: profile.username,
            friendCode: profile.friendCode,
            createdAt: serverTimestamp(),
          }),
          setDoc(
            requestRef,
            {
              status: 'accepted',
            },
            { merge: true },
          ),
        ])
      } else {
        await setDoc(
          requestRef,
          {
            status: 'declined',
          },
          { merge: true },
        )
      }
    } catch (err) {
      console.error(err)
      setError('Failed to update friend request.')
    } finally {
      setBusy(false)
    }
  }

  // ---- Lobby invite accept/decline (receiving side) ----

  const handleRespondToLobbyInvite = async (
    invite: LobbyInvite,
    accept: boolean,
  ) => {
    if (!user || !profile) return
    setBusy(true)
    setError(null)

    try {
      const inviteRef = doc(
        db,
        'users',
        user.uid,
        'lobbyInvites',
        invite.id,
      )

      if (accept) {
        const lobbyRef = doc(db, 'lobbies', invite.lobbyId)

        // Seat selection rules for "opponent" invites:
        // - If P1 is free, join as P1
        // - Else if P2 is free, join as P2
        // - Else join as spectator
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(lobbyRef)
          if (!snap.exists()) {
            throw new Error('lobby-not-found')
          }

          const data = snap.data() as any
          let p1 = data.p1 ?? null
          let p2 = data.p2 ?? null
          let spectators: any[] = Array.isArray(data.spectators)
            ? data.spectators
            : []

          const alreadyP1 = p1 && p1.uid === user.uid
          const alreadyP2 = p2 && p2.uid === user.uid
          const alreadySpectator = spectators.some(
            (s: any) => s.uid === user.uid,
          )

          // If user is already in the lobby somewhere, don't reshuffle them
          if (!alreadyP1 && !alreadyP2 && !alreadySpectator) {
            if (invite.role === 'player2') {
              if (!p1) {
                p1 = { uid: user.uid, username: profile.username }
              } else if (!p2) {
                p2 = { uid: user.uid, username: profile.username }
              } else {
                spectators.push({ uid: user.uid, username: profile.username })
              }
            } else {
              // Spectator invite
              spectators.push({ uid: user.uid, username: profile.username })
            }
          }

          tx.update(lobbyRef, {
            p1,
            p2,
            spectators,
            updatedAt: serverTimestamp(),
          })
        })

        await setDoc(
          inviteRef,
          { status: 'accepted' },
          { merge: true },
        )

        navigate(`/play/private/${invite.lobbyId}`)
      } else {
        await setDoc(
          inviteRef,
          { status: 'declined' },
          { merge: true },
        )
      }
    } catch (err) {
      console.error(err)
      setError('Failed to respond to game invite.')
    } finally {
      setBusy(false)
    }
  }

  // ---- Status pill renderer ----

  const renderStatusPill = (friendUid: string) => {
    const fs = friendStatuses[friendUid]
    let label = 'Offline'
    let cls = 'text-[10px] text-slate-500'

    if (fs) {
      const rawStatus = fs.status
      const lastActiveMs =
        fs.lastActive && (fs.lastActive as any).toMillis
          ? (fs.lastActive as any).toMillis()
          : null
      const now = Date.now()
      const AWAY_MS = 5 * 60 * 1000 // 5 minutes

      if (rawStatus === 'online') {
        if (lastActiveMs && now - lastActiveMs > AWAY_MS) {
          label = 'Away'
          cls = 'text-[10px] text-red-400'
        } else {
          label = 'Online'
          cls = 'text-[10px] text-emerald-400'
        }
      } else if (rawStatus === 'away') {
        label = 'Away'
        cls = 'text-[10px] text-red-400'
      } else {
        label = 'Offline'
        cls = 'text-[10px] text-slate-500'
      }
    }

    return <span className={cls}>{label}</span>
  }

  // ---- Render ----

  return (
    <>
      <aside
        className={`relative flex flex-col border-l border-slate-900 bg-slate-950/98 shadow-2xl backdrop-blur-sm transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Toggle tab */}
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="absolute left-0 top-1/2 z-10 flex h-10 w-6 -translate-x-full -translate-y-1/2 items-center justify-center rounded-l-full rounded-r-none border border-slate-800 bg-slate-900/90 text-xs text-slate-300 shadow-lg hover:border-amber-400 hover:text-amber-300"
          aria-label={collapsed ? 'Open friends list' : 'Close friends list'}
        >
          {collapsed ? '‹' : '›'}
        </button>

        {/* Profile header */}
        <div className="rb-sidebar-profile-header">
          <Link
            to="/profile"
            className={`group flex cursor-pointer items-center gap-3 ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-slate-950">
              {profile.username.charAt(0).toUpperCase()}
            </div>
            <div className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
              <div className="truncate text-sm font-semibold text-amber-200 group-hover:text-amber-100">
                {profile.username}
              </div>
              <div className="font-mono text-[11px] text-slate-400 group-hover:text-amber-300">
                {profile.friendCode}
              </div>
            </div>
          </Link>
        </div>

        {/* Incoming game invites (top area) */}
        {!collapsed && pendingLobbyInvites.length > 0 && (
          <div className="space-y-2 border-b border-slate-800 px-3 py-2">
            {pendingLobbyInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/80 px-2 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-amber-200">
                    {inv.fromUsername}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {inv.role === 'player2'
                      ? 'invited you to a private match'
                      : 'invited you to spectate a match'}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRespondToLobbyInvite(inv, true)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                    title="Accept"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRespondToLobbyInvite(inv, false)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-100 hover:bg-slate-600 disabled:opacity-60"
                    title="Decline"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friends header + list */}
        {!collapsed && (
          <>
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-3">
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Friends
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenRequestsModal}
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-amber-400 hover:text-amber-300 ${
                    pendingRequests.length > 0
                      ? 'after:absolute after:-right-0.5 after:-top-0.5 after:h-2 after:w-2 after:rounded-full after:bg-amber-400'
                      : ''
                  }`}
                  title="Friend requests"
                >
                  <span className="text-[13px]">!</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-amber-400 hover:text-amber-300"
                  title="Add friend"
                >
                  <span className="text-lg leading-none">+</span>
                </button>
              </div>
            </div>

            {/* Friend list */}
            <div className="flex-1 overflow-y-auto">
              {friends.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-500">
                  No friends yet. Use the + icon to add someone by friend code.
                </div>
              ) : (
                <ul className="divide-y divide-slate-900/80 text-sm">
                  {friends.map((f) => (
                    <li
                      key={f.uid}
                      className="flex items-center gap-3 px-3 py-2 cursor-default hover:bg-slate-900/70"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-amber-300">
                        {f.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-100">
                          {f.username}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          {f.friendCode}
                        </div>
                      </div>
                      {renderStatusPill(f.uid)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </aside>

      {/* Add Friend modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="relative w-full max-w-sm rounded-xl border border-amber-500/40 bg-slate-950/95 p-5 shadow-xl">
            <button
              type="button"
              onClick={handleCloseAddModal}
              className="absolute right-3 top-3 text-sm text-slate-400 hover:text-slate-100"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="mb-2 text-lg font-semibold text-amber-200">
              Add Friend
            </h2>
            <p className="mb-3 text-xs text-slate-300">
              Enter your friend&apos;s 5-character friend code.
            </p>

            <input
              type="text"
              value={friendCodeInput}
              onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase())}
              maxLength={5}
              className="mb-2 w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-center text-sm font-mono tracking-[0.25em] text-slate-100 focus:border-amber-500 focus:outline-none"
              placeholder="A1B2C"
            />

            {error && (
              <div className="mb-2 rounded border border-red-500/60 bg-red-950/60 px-3 py-1.5 text-[11px] text-red-200">
                {error}
              </div>
            )}
            {status && !error && (
              <div className="mb-2 rounded border border-emerald-500/60 bg-emerald-950/50 px-3 py-1.5 text-[11px] text-emerald-200">
                {status}
              </div>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseAddModal}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSendFriendRequest}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Add Friend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Friend Requests modal */}
      {showRequestsModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="relative w-full max-w-sm rounded-xl border border-amber-500/40 bg-slate-950/95 p-5 shadow-xl">
            <button
              type="button"
              onClick={handleCloseRequestsModal}
              className="absolute right-3 top-3 text-sm text-slate-400 hover:text-slate-100"
              aria-label="Close"
            >
              ×
            </button>

            <h2 className="mb-2 text-lg font-semibold text-amber-200">
              Friend Requests
            </h2>

            {pendingRequests.length === 0 ? (
              <p className="mb-4 text-xs text-slate-300">
                You have no pending friend requests.
              </p>
            ) : (
              <ul className="mb-4 space-y-2">
                {pendingRequests.map((req) => (
                  <li
                    key={req.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
                  >
                    <div className="text-sm text-slate-100">
                      {req.fromUsername}
                    </div>
                    <div className="mb-2 font-mono text-[11px] text-slate-400">
                      {req.fromFriendCode}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRespondToRequest(req, true)}
                        className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRespondToRequest(req, false)}
                        className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <div className="mb-3 rounded border border-red-500/60 bg-red-950/60 px-3 py-1.5 text-[11px] text-red-200">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCloseRequestsModal}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default FriendsSidebar
