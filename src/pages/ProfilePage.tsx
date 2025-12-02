// src/pages/ProfilePage.tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

function ProfilePage() {
  const { user, profile, loading, signUpWithEmail, signInWithEmail, signOutUser } =
    useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      if (mode === 'signup') {
        await signUpWithEmail({ email, password, username })
      } else {
        await signInWithEmail({ email, password })
      }

      setPassword('')
      setUsername('')
      setEmail('')
    } catch (err: any) {
      console.error(err)

      const code = err?.code || err?.message

      let message: string
      if (code === 'username-required') {
        message = 'Please choose a username.'
      } else if (code === 'friend-code-generation-failed') {
        message = 'Could not generate a friend code. Please try again.'
      } else if (err?.code === 'auth/email-already-in-use') {
        message = 'That email is already in use.'
      } else if (err?.code === 'auth/invalid-credential') {
        message = 'Incorrect email or password.'
      } else {
        message = err?.message || 'Something went wrong. Please try again.'
      }

      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setError(null)
    try {
      await signOutUser()
    } catch (err: any) {
      console.error(err)
      setError('Failed to log out. Please try again.')
    }
  }

  const handleCopyFriendCode = async () => {
    if (!profile?.friendCode) return
    try {
      await navigator.clipboard.writeText(profile.friendCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <section className="max-w-lg">
        <h1 className="text-3xl font-semibold text-amber-300 mb-4">Profile</h1>
        <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-6 shadow-md text-slate-300">
          Checking your session…
        </div>
      </section>
    )
  }

  if (user && profile) {
    const displayName = profile.username || user.displayName || 'Player'

    return (
      <section className="max-w-lg">
        <h1 className="text-3xl font-semibold text-amber-300 mb-4">Profile</h1>

        <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-6 shadow-md mb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-slate-950 text-xl font-bold">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-lg font-semibold text-amber-200">{displayName}</div>
              <div className="text-sm text-slate-300">{profile.email}</div>
            </div>
          </div>

          {/* Friend code */}
          <div className="mb-4 rounded-lg border border-amber-500/50 bg-slate-950/60 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                Friend Code
              </div>
              <div className="font-mono text-lg text-slate-50 mt-1">
                {profile.friendCode || '-----'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Share this code so friends can add you.
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyFriendCode}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <p className="text-sm text-slate-300 mb-4">
            Your decks, friend list, and lobby data are tied to this account.
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 shadow hover:bg-slate-700"
          >
            Log out
          </button>
        </div>

        {error && (
          <div className="rounded border border-red-500/60 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
      </section>
    )
  }

  // Not logged in
  return (
    <section className="max-w-lg">
      <h1 className="text-3xl font-semibold text-amber-300 mb-4">Account</h1>
      <p className="text-slate-300 mb-6 text-sm">
        Create an account or sign in to manage your decks, friends, and lobbies.
      </p>

      <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-6 shadow-md">
        {/* Tabs */}
        <div className="mb-4 flex rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
          <button
            type="button"
            className={`flex-1 px-3 py-2 text-sm font-semibold ${
              mode === 'signup'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-transparent text-slate-300 hover:bg-slate-800'
            }`}
            onClick={() => setMode('signup')}
          >
            Sign Up
          </button>
          <button
            type="button"
            className={`flex-1 px-3 py-2 text-sm font-semibold ${
              mode === 'signin'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-transparent text-slate-300 hover:bg-slate-800'
            }`}
            onClick={() => setMode('signin')}
          >
            Sign In
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                placeholder="Choose a username"
                required={mode === 'signup'}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                This is what your friends will see in the lobby.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-300">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-300">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              placeholder="••••••••"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Atleast 6 characters.
            </p>
          </div>

          {error && (
            <div className="rounded border border-red-500/60 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting
              ? mode === 'signup'
                ? 'Creating account...'
                : 'Signing in...'
              : mode === 'signup'
              ? 'Create Account'
              : 'Sign In'}
          </button>
        </form>
      </div>
    </section>
  )
}

export default ProfilePage
