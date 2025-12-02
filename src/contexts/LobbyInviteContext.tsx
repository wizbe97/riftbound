// src/contexts/LobbyInviteContext.tsx
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react'

type PendingInvite = {
  lobbyId: string
  role: 'player2' | 'spectator'
}

type LobbyInviteContextValue = {
  pendingInvite: PendingInvite | null
  startInvite: (invite: PendingInvite) => void
  clearInvite: () => void
}

const LobbyInviteContext = createContext<LobbyInviteContextValue | undefined>(
  undefined,
)

export function LobbyInviteProvider({ children }: { children: ReactNode }) {
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null)

  const startInvite = (invite: PendingInvite) => setPendingInvite(invite)
  const clearInvite = () => setPendingInvite(null)

  return (
    <LobbyInviteContext.Provider
      value={{ pendingInvite, startInvite, clearInvite }}
    >
      {children}
    </LobbyInviteContext.Provider>
  )
}

export function useLobbyInvite() {
  const ctx = useContext(LobbyInviteContext)
  if (!ctx) throw new Error('useLobbyInvite must be used within a LobbyInviteProvider')
  return ctx
}
