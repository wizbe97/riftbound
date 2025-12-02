// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { LobbyProvider } from './contexts/LobbyContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <LobbyProvider>
        <App />
      </LobbyProvider>
    </AuthProvider>
  </StrictMode>,
)
