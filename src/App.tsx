import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import PlayPage from './pages/PlayPage';
import DecksPage from './pages/DecksPage';
import RulesPage from './pages/RulesPage';
import ProfilePage from './pages/ProfilePage';
import FriendsSidebar from './components/friends/FriendsSidebar';
import PrivateMatchLobbyPage from './pages/PrivateMatchLobbyPage';
import CardGalleryPage from './pages/CardGalleryPage';
import CreateDeckPage from './pages/CreateDeckPage';
import DeckDetailPage from './pages/DeckDetailPage';
import MatchGamePage from './pages/MatchGamePage';
import MatchDeckSelectPage from './pages/MatchDeckSelectPage';
import { useAuth } from './contexts/AuthContext';

function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();

  // Treat the full-screen match playmat as the "match route"
  const isMatchRoute =
    location.pathname.startsWith('/play/private/') &&
    (location.pathname.endsWith('/game') ||
      location.pathname.endsWith('/match'));

  const mainWrapperClass = isMatchRoute
    ? // Full width under navbar for the match view
      'w-full h-full px-0 py-0'
    : // Original centered layout for everything else
      'mx-auto w-full max-w-6xl px-4 py-6';

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Left side: navbar + page content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1">
          <div className={mainWrapperClass}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/play" element={<PlayPage />} />

              {/* Private match flow */}
              <Route
                path="/play/private/:lobbyId"
                element={<PrivateMatchLobbyPage />}
              />

              {/* Optional direct deck-select page */}
              <Route
                path="/play/private/:lobbyId/decks"
                element={<MatchDeckSelectPage />}
              />
              <Route
                path="/play/private/:lobbyId/select-deck"
                element={<MatchDeckSelectPage />}
              />

              {/* Match board routes */}
              <Route
                path="/play/private/:lobbyId/game"
                element={<MatchGamePage />}
              />
              <Route
                path="/play/private/:lobbyId/match"
                element={<MatchGamePage />}
              />

              {/* Decks */}
              <Route path="/decks" element={<DecksPage />} />
              <Route path="/decks/create" element={<CreateDeckPage />} />
              <Route path="/decks/:deckId" element={<DeckDetailPage />} />
              <Route
                path="/decks/:deckId/edit"
                element={<CreateDeckPage />}
              />

              {/* Other pages */}
              <Route path="/cards" element={<CardGalleryPage />} />
              <Route path="/rules" element={<RulesPage />} />
              <Route path="/profile" element={<ProfilePage />} />

              {/* TODO: 404 page later */}
            </Routes>
          </div>
        </main>
      </div>

      {/* Right side: friends sidebar (visible when logged in, but not during a match playmat) */}
      {user && !isMatchRoute && <FriendsSidebar />}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
