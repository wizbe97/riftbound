// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/layout/Navbar'
import HomePage from './pages/HomePage'
import PlayPage from './pages/PlayPage'
import DecksPage from './pages/DecksPage'
import RulesPage from './pages/RulesPage'
import ProfilePage from './pages/ProfilePage'
import FriendsSidebar from './components/friends/FriendsSidebar'
import PrivateMatchLobbyPage from './pages/PrivateMatchLobbyPage'
import { useAuth } from './contexts/AuthContext'

function App() {
  const { user } = useAuth()

  return (
    <BrowserRouter>
      {/* Root layout: main content on the left, friends sidebar on the right */}
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        {/* Left side: navbar + page content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar />

          <main className="flex-1">
            <div className="mx-auto w-full max-w-6xl px-4 py-6">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/play" element={<PlayPage />} />
                <Route
                  path="/play/private/:lobbyId"
                  element={<PrivateMatchLobbyPage />}
                />
                <Route path="/decks" element={<DecksPage />} />
                <Route path="/rules" element={<RulesPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                {/* TODO: 404 page later */}
              </Routes>
            </div>
          </main>
        </div>

        {/* Right side: friends sidebar (visible when logged in) */}
        {user && <FriendsSidebar />}
      </div>
    </BrowserRouter>
  )
}

export default App

