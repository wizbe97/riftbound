// src/components/layout/Navbar.tsx
import { useState } from 'react'
import { NavLink, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const DISCORD_INVITE_URL = 'https://discord.gg/your-invite-code-here' // TODO

const navLinkBase = 'rb-nav-link'
const navLinkActive = 'rb-nav-link-active'
const navLinkInactive = 'rb-nav-link-inactive'

function Navbar() {
  const location = useLocation()
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      <header className="rb-header">
        {/* Inner container fills header height */}
        <div className="rb-header-inner mx-auto flex items-center justify-between max-w-6xl px-4">
          {/* Brand */}
          <Link
            to="/"
            className="rb-brand group flex-shrink-0"
            onClick={closeMobile}
          >
            <div className="rb-brand-icon" />
            <div className="leading-tight">
              <div className="rb-brand-title">Riftbound</div>
              <div className="rb-brand-subtitle">Online Hub</div>
            </div>
          </Link>

          {/* Desktop nav (md and up) */}
          <nav className="rb-nav hidden md:flex flex-1 justify-center">
            <NavLink
              to="/play"
              className={
                navLinkBase + ' ' + (isActive('/play') ? navLinkActive : navLinkInactive)
              }
            >
              Play
            </NavLink>
            <NavLink
              to="/decks"
              className={
                navLinkBase + ' ' + (isActive('/decks') ? navLinkActive : navLinkInactive)
              }
            >
              Decks
            </NavLink>
            <NavLink
              to="/rules"
              className={
                navLinkBase + ' ' + (isActive('/rules') ? navLinkActive : navLinkInactive)
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
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
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
            <span className="sr-only">{mobileOpen ? 'Close menu' : 'Open menu'}</span>
            <span className="flex flex-col gap-[3px]">
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
            </span>
          </button>
        </div>
      </header>

      {/* Mobile dropdown menu (replaces the button nav on small screens) */}
      {mobileOpen && (
        <div className="md:hidden border-b border-amber-500/30 bg-slate-950/95">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            <NavLink
              to="/play"
              onClick={closeMobile}
              className={({ isActive: active }) =>
                [
                  'w-full rounded-md px-3 py-2 text-sm font-medium text-slate-100 text-left',
                  'hover:bg-slate-800 hover:text-amber-200',
                  active ? 'bg-slate-900 text-amber-300' : '',
                ].join(' ')
              }
            >
              Play
            </NavLink>

            <NavLink
              to="/decks"
              onClick={closeMobile}
              className={({ isActive: active }) =>
                [
                  'w-full rounded-md px-3 py-2 text-sm font-medium text-slate-100 text-left',
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
                  'w-full rounded-md px-3 py-2 text-sm font-medium text-slate-100 text-left',
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
    </>
  )
}

export default Navbar
