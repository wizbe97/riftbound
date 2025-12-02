import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'

function PlayPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [creatingLobby, setCreatingLobby] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreatePrivateMatch = async () => {
    setError(null)

    if (!user || !profile) {
      // No account yet – push them to profile/sign-in
      navigate('/profile')
      return
    }

    try {
      setCreatingLobby(true)

      const lobbiesRef = collection(db, 'lobbies')
      const lobbyDoc = await addDoc(lobbiesRef, {
        hostUid: user.uid,
        hostUsername: profile.username,
        status: 'open',
        mode: 'private',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        p1: {
          uid: user.uid,
          username: profile.username,
        },
        p2: null,
        spectators: [],
        // Default rules: best of 1, sideboard disabled
        rules: {
          bestOf: 1,
          sideboard: false,
        },
        // Must be explicitly confirmed by Player 1 before game can start
        rulesConfirmed: false,
        p1Ready: false,
        p2Ready: false,
      })

      navigate(`/play/private/${lobbyDoc.id}`)
    } catch (err) {
      console.error('[PlayPage] Failed to create private lobby', err)
      setError('Failed to create lobby. Please try again.')
    } finally {
      setCreatingLobby(false)
    }
  }

  return (
    <section>
      <h1 className="mb-4 text-3xl font-semibold text-amber-300">Play</h1>
      <p className="mb-6 text-sm text-slate-300">
        Choose how you want to play Riftbound.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Private Match */}
        <button
          type="button"
          onClick={handleCreatePrivateMatch}
          disabled={creatingLobby}
          className="flex flex-col items-start rounded-xl border border-amber-500/40 bg-slate-900/60 p-5 text-left shadow-md transition hover:border-amber-400 hover:bg-slate-900/80 disabled:opacity-60"
        >
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
            Mode
          </div>
          <div className="mb-1 text-lg font-semibold text-amber-200">
            Private Match
          </div>
          <p className="mb-2 text-sm text-slate-300">
            Create a lobby, invite a friend to P2, and optionally add spectators.
          </p>
          <span className="mt-auto inline-flex items-center rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow">
            {creatingLobby ? 'Creating lobby…' : 'Create Lobby'}
          </span>
        </button>

        {/* Tournament Draft – placeholder / disabled */}
        <div className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900/40 p-5 opacity-60">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Mode
          </div>
          <div className="mb-1 text-lg font-semibold text-slate-200">
            Tournament Draft
          </div>
          <p className="mb-2 text-sm text-slate-400">
            Structured draft pods and tournament brackets. Coming later.
          </p>
          <span className="mt-auto inline-flex items-center rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300">
            Coming Soon
          </span>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded border border-red-500/60 bg-red-950/60 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
    </section>
  )
}

export default PlayPage
