// src/contexts/AuthContext.tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth, db } from '../firebase'
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

const FRIEND_CODE_LENGTH = 5
const FRIEND_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

type UserProfile = {
  uid: string
  email: string
  username: string
  friendCode: string
}

type AuthContextValue = {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signUpWithEmail: (params: {
    email: string
    password: string
    username: string
  }) => Promise<void>
  signInWithEmail: (params: { email: string; password: string }) => Promise<void>
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function randomFriendCode(): string {
  let code = ''
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * FRIEND_CODE_CHARS.length)
    code += FRIEND_CODE_CHARS[idx]
  }
  return code
}

async function generateUniqueFriendCode(uid: string): Promise<string> {
  const maxAttempts = 10

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = randomFriendCode()
    const codeRef = doc(db, 'friendCodes', candidate)
    const snap = await getDoc(codeRef)

    if (!snap.exists()) {
      await setDoc(codeRef, {
        uid,
        createdAt: serverTimestamp(),
      })
      return candidate
    }
  }

  const err = new Error('friend-code-generation-failed')
  ;(err as any).code = 'friend-code-generation-failed'
  throw err
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Load profile on auth state change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid)
          const snap = await getDoc(userDocRef)
          if (snap.exists()) {
            const data = snap.data() as any
            setProfile({
              uid: data.uid ?? firebaseUser.uid,
              email: data.email ?? firebaseUser.email ?? '',
              username: data.username ?? firebaseUser.displayName ?? 'Player',
              friendCode: data.friendCode ?? '-----',
            })
          } else {
            // No profile doc yet – fall back to auth info
            setProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email ?? '',
              username: firebaseUser.displayName ?? 'Player',
              friendCode: '-----',
            })
          }
        } catch (err) {
          console.error(
            '[AuthProvider] Failed to load user profile, using auth only',
            err,
          )
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            username: firebaseUser.displayName ?? 'Player',
            friendCode: '-----',
          })
        }
      } else {
        setProfile(null)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Presence: mark online, update lastActive periodically, mark offline on unload
  useEffect(() => {
    if (!user) return

    const userDocRef = doc(db, 'users', user.uid)

    const setOnline = async () => {
      try {
        await setDoc(
          userDocRef,
          { status: 'online', lastActive: serverTimestamp() },
          { merge: true },
        )
      } catch (err) {
        console.error('[Presence] Failed to set online', err)
      }
    }

    const setOffline = async () => {
      try {
        await setDoc(
          userDocRef,
          { status: 'offline', lastActive: serverTimestamp() },
          { merge: true },
        )
      } catch (err) {
        console.error('[Presence] Failed to set offline', err)
      }
    }

    // Immediately mark online
    void setOnline()

    // Refresh lastActive while the page is open
    const intervalId = window.setInterval(() => {
      void setOnline()
    }, 60_000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void setOnline()
      }
    }

    const handleBeforeUnload = () => {
      void setOffline()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user?.uid])

  const signUpWithEmail: AuthContextValue['signUpWithEmail'] = async ({
    email,
    password,
    username,
  }) => {
    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      const err = new Error('username-required')
      ;(err as any).code = 'username-required'
      throw err
    }

    // 1) Create Auth user (this also signs you in)
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const uid = cred.user.uid

    // 2) Set displayName = username
    await updateProfile(cred.user, { displayName: trimmedUsername })

    // 3) Best-effort Firestore profile + unique friend code
    let friendCode = '-----'
    try {
      friendCode = await generateUniqueFriendCode(uid)

      const userDocRef = doc(db, 'users', uid)
      await setDoc(userDocRef, {
        uid,
        email,
        username: trimmedUsername,
        friendCode,
        status: 'online',
        lastActive: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      console.error(
        '[signUpWithEmail] Firestore unavailable, continuing without profile doc',
        err,
      )
    }

    // 4) Update in-memory profile from auth + friendCode
    setProfile({
      uid,
      email,
      username: trimmedUsername,
      friendCode,
    })
  }

  const signInWithEmail: AuthContextValue['signInWithEmail'] = async ({
    email,
    password,
  }) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signOutUser = async () => {
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid)
        await setDoc(
          userDocRef,
          { status: 'offline', lastActive: serverTimestamp() },
          { merge: true },
        )
      } catch (err) {
        console.error('[signOutUser] Failed to set offline', err)
      }
    }

    await signOut(auth)
    setProfile(null)
  }

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    signUpWithEmail,
    signInWithEmail,
    signOutUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
