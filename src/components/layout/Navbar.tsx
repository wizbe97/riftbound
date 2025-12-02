import { useState } from 'react'
import {
  NavLink,
  useLocation,
  Link,
  useNavigate,
} from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLobbySession } from '../../contexts/LobbyContext'
import { leaveLobbyForUser } from '../../utils/lobby'

const DISCORD_INVITE_URL = 'https://discord.gg/your-invite-code-here' // TODO

const navLinkBase = 'rb-nav-link'
const navLinkActive = 'rb-nav-link-active'
const navLinkInactive = 'rb-nav-link-inactive'

function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { activeLobbyId, setActiveLobbyId } = useLobbySession()
  const [mobileOpen, setMobileOpen] = useState(false)

  const [showHomeLeaveModal, setShowHomeLeaveModal] = useState(false)
  const [leavingHome, setLeavingHome] = useState(false)

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  const closeMobile = () => setMobileOpen(false)

  const isInLobby = !!activeLobbyId
  const lobbyPath = activeLobbyId ? `/play/private/${activeLobbyId}` : '/play'

  const handleBrandClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    e.preventDefault()
    closeMobile()

    if (!isInLobby) {
      navigate('/')
      return
    }

    // In a lobby -> show confirmation popup
    setShowHomeLeaveModal(true)
  }

  const handleConfirmLeaveHome = async () => {
    if (!user || !activeLobbyId) {
      setShowHomeLeaveModal(false)
      navigate('/')
      return
    }

    try {
      setLeavingHome(true)
      await leaveLobbyForUser(activeLobbyId, user.uid)
      setActiveLobbyId(null)
      navigate('/')
    } catch (err) {
      console.error('[Navbar] Failed to leave lobby from home click', err)
      // Worst case, still navigate home to avoid locking the user
      navigate('/')
    } finally {
      setLeavingHome(false)
      setShowHomeLeaveModal(false)
    }
  }

  const handleCancelLeaveHome = () => {
    setShowHomeLeaveModal(false)
  }

  return (
    <>
      <header className="rb-header">
        {/* Inner container fills header height */}
        <div className="rb-header-inner mx-auto flex max-w-6xl items-center justify-between px-4">
          {/* Brand */}
          <Link
            to="/"
            className="rb-brand group flex-shrink-0"
            onClick={handleBrandClick}
          >
            <div className="rb-brand-icon" />
            <div className="leading-tight">
              <div className="rb-brand-title">Riftbound</div>
              <div className="rb-brand-subtitle">Online Hub</div>
            </div>
          </Link>

          {/* Desktop nav (md and up) */}
          <nav className="rb-nav hidden flex-1 justify-center md:flex">
            <NavLink
              to={lobbyPath}
              className={
                navLinkBase +
                ' ' +
                (location.pathname.startsWith('/play')
                  ? navLinkActive
                  : navLinkInactive)
              }
            >
              {isInLobby ? 'Lobby' : 'Play'}
            </NavLink>
            <NavLink
              to="/decks"
              className={
                navLinkBase +
                ' ' +
                (isActive('/decks') ? navLinkActive : navLinkInactive)
              }
            >
              Decks
            </NavLink>
            <NavLink
              to="/rules"
              className={
                navLinkBase +
                ' ' +
                (isActive('/rules') ? navLinkActive : navLinkInactive)
              }
            >
              Rules
            </NavLink>
            <button
              type="button"
              onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
              className="ml-2 inline-flex items-center gap-1 rounded-md border border-sky-500/60 bg-sky-900/40 px-3 py-2 text-sm font-semibold text-sky-100 shadow-sm transition hover:bg-sky-800/80 hover:text-white"
            >
              <span>Discord</span>
            </button>
          </nav>

          {/* Desktop auth pill */}
          <div className="hidden flex-shrink-0 items-center gap-2 md:flex">
            {!user && (
              <NavLink to="/profile" className="rb-login-btn">
                Login / Sign Up
              </NavLink>
            )}
          </div>

          {/* Mobile burger button (only on small screens) */}
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900/80 text-slate-100 shadow-sm hover:border-amber-400 hover:text-amber-200 md:hidden"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            <span className="sr-only">
              {mobileOpen ? 'Close menu' : 'Open menu'}
            </span>
            <span className="flex flex-col gap-[3px]">
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
            </span>
          </button>
        </div>
      </header>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="border-b border-amber-500/30 bg-slate-950/95 md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            <NavLink
              to={lobbyPath}
              onClick={closeMobile}
              className={({ isActive: active }) =>
                [
                  'w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-100',
                  'hover:bg-slate-800 hover:text-amber-200',
                  active || location.pathname.startsWith('/play')
                    ? 'bg-slate-900 text-amber-300'
                    : '',
                ].join(' ')
              }
            >
              {isInLobby ? 'Lobby' : 'Play'}
            </NavLink>

            <NavLink
              to="/decks"
              onClick={closeMobile}
              className={({ isActive: active }) =>
                [
                  'w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-100',
                  'hover:bg-slate-800 hover:text-amber-200',
                  active ? 'bg-slate-900 text-amber-300' : '',
                ].join(' ')
              }
            >
              Decks
            </NavLink>

            <NavLink
              to="/rules"
              onClick={closeMobile}
              className={({ isActive: active }) =>
                [
                  'w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-100',
                  'hover:bg-slate-800 hover:text-amber-200',
                  active ? 'bg-slate-900 text-amber-300' : '',
                ].join(' ')
              }
            >
              Rules
            </NavLink>

            <button
              type="button"
              onClick={() => {
                closeMobile()
                window.open(DISCORD_INVITE_URL, '_blank')
              }}
              className="mt-1 inline-flex w-full items-center justify-start gap-2 rounded-md border border-sky-500/60 bg-sky-900/40 px-3 py-2 text-sm font-semibold text-sky-100 shadow-sm transition hover:bg-sky-800/80 hover:text-white"
            >
              <span>Discord</span>
            </button>

            {!user && (
              <NavLink
                to="/profile"
                onClick={closeMobile}
                className="mt-2 inline-flex w-full items-center justify-center rb-login-btn"
              >
                Login / Sign Up
              </NavLink>
            )}
          </nav>
        </div>
      )}

      {/* Home-leave confirmation modal (only shown when in lobby) */}
      {showHomeLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative w-full max-w-sm rounded-xl border border-amber-500/40 bg-slate-950/95 p-5 shadow-2xl">
            <button
              type="button"
              onClick={handleCancelLeaveHome}
              className="absolute right-3 top-3 text-sm text-slate-400 hover:text-slate-100"
              aria-label="Close"
            >
              ×
            </button>

            <h2 className="mb-2 text-lg font-semibold text-amber-200">
              Leave Lobby?
            </h2>
            <p className="mb-4 text-sm text-slate-300">
              Returning to the home screen will remove{' '}
              {profile?.username ?? 'you'} from the current lobby. Are you sure
              you want to leave?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelLeaveHome}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                Stay in Lobby
              </button>
              <button
                type="button"
                onClick={handleConfirmLeaveHome}
                disabled={leavingHome}
                className="rounded-md bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {leavingHome ? 'Leaving…' : 'Leave Lobby'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Navbar
