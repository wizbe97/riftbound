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
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
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

/**
 * Ensure the users/{uid} profile has a real friendCode.
 * - If users doc has a non-placeholder friendCode, reuse it.
 * - Else try to find an existing mapping in friendCodes.
 * - Else generate a new code.
 * Returns { email, username, friendCode }.
 */
async function ensureUserProfileWithFriendCode(firebaseUser: User) {
  const uid = firebaseUser.uid
  const userDocRef = doc(db, 'users', uid)
  const snap = await getDoc(userDocRef)

  let email = firebaseUser.email ?? ''
  let username = firebaseUser.displayName ?? 'Player'
  let friendCode: string | undefined

  if (snap.exists()) {
    const data = snap.data() as any
    email = data.email ?? email
    username = data.username ?? username
    friendCode = data.friendCode
  }

  // If friendCode missing or placeholder, try to recover it from friendCodes map
  if (!friendCode || friendCode === '-----') {
    const codesRef = collection(db, 'friendCodes')
    const q = query(codesRef, where('uid', '==', uid))
    const qsnap = await getDocs(q)

    if (!qsnap.empty) {
      // Reuse existing code from friendCodes collection
      friendCode = qsnap.docs[0].id
    } else {
      // No mapping: create a fresh code and mapping
      friendCode = await generateUniqueFriendCode(uid)
    }

    // Persist back onto the users doc
    await setDoc(
      userDocRef,
      {
        uid,
        email,
        username,
        friendCode,
        status: 'online',
        lastActive: serverTimestamp(),
        createdAt: snap.exists()
          ? (snap.data() as any)?.createdAt ?? serverTimestamp()
          : serverTimestamp(),
      },
      { merge: true },
    )
  }

  return { email, username, friendCode: friendCode as string }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Load profile on auth state change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (!firebaseUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const { email, username, friendCode } =
          await ensureUserProfileWithFriendCode(firebaseUser)

        setProfile({
          uid: firebaseUser.uid,
          email,
          username,
          friendCode,
        })
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
      } finally {
        setLoading(false)
      }
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

    void setOnline()

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

    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const uid = cred.user.uid

    await updateProfile(cred.user, { displayName: trimmedUsername })

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
