// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/layout/Navbar'
import HomePage from './pages/HomePage'
import PlayPage from './pages/PlayPage'
import DecksPage from './pages/DecksPage'
import RulesPage from './pages/RulesPage'
import ProfilePage from './pages/ProfilePage'
import FriendsSidebar from './components/friends/FriendsSidebar'
import { useAuth } from './contexts/AuthContext'

function App() {
  const { user } = useAuth()

  return (
    <BrowserRouter>
      {/* Root layout: main content on the left, friends sidebar on the right */}
      <div className="min-h-screen bg-slate-950 text-slate-100 flex">
        {/* Left side: navbar + page content */}
        <div className="flex flex-col flex-1 min-w-0">
          <Navbar />

          <main className="flex-1">
            <div className="mx-auto w-full max-w-6xl px-4 py-6">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/play" element={<PlayPage />} />
                <Route path="/decks" element={<DecksPage />} />
                <Route path="/rules" element={<RulesPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                {/* TODO: 404 page later */}
              </Routes>
            </div>
          </main>
        </div>

        {/* Right side: friends sidebar (always visible when logged in) */}
        {user && <FriendsSidebar />}
      </div>
    </BrowserRouter>
  )
}

export default App
