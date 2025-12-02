import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react'

type LobbyContextValue = {
  activeLobbyId: string | null
  setActiveLobbyId: (id: string | null) => void
}

const LobbyContext = createContext<LobbyContextValue | undefined>(undefined)

export function LobbyProvider({ children }: { children: ReactNode }) {
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null)

  return (
    <LobbyContext.Provider value={{ activeLobbyId, setActiveLobbyId }}>
      {children}
    </LobbyContext.Provider>
  )
}

export function useLobbySession() {
  const ctx = useContext(LobbyContext)
  if (!ctx) {
    throw new Error('useLobbySession must be used within a LobbyProvider')
  }
  return ctx
}
