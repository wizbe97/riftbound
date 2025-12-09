// src/components/ChatBox.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEventHandler } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export type ChatRole = 'p1' | 'p2' | 'spectator';

export type ChatBoxProps = {
  lobbyId: string;
  currentRole: ChatRole;
  userUid: string;
  username: string;
  title?: string;
  fullHeight?: boolean;
  /** When true, only show messages created after this ChatBox mounted (so lobby chat doesn't carry into match). */
  clearOnMount?: boolean;
  /** Whether the current user is allowed to send chat messages. */
  canChat?: boolean;
};

type ChatMessage = {
  id: string;
  uid: string;
  username: string;
  role: 'p1' | 'p2' | 'spectator';
  text: string;
  createdAt?: Timestamp;
  system?: boolean;
};

function ChatBox({
  lobbyId,
  currentRole,
  userUid,
  username,
  title = 'Chat',
  fullHeight = true,
  clearOnMount = false,
  canChat = true,
}: ChatBoxProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Used to filter out messages created before this ChatBox mounted
  const [mountTime] = useState(() => Date.now());

  useEffect(() => {
    if (!lobbyId) return;

    const messagesRef = collection(db, 'lobbies', lobbyId, 'chat');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(200));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs: ChatMessage[] = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              uid: data.uid,
              username: data.username,
              role: (data.role ?? 'spectator') as ChatMessage['role'],
              text: data.text,
              createdAt: data.createdAt,
              system: !!data.system,
            };
          })
          .filter((m) => {
            if (!clearOnMount) return true;
            if (!m.createdAt) return false;
            return m.createdAt.toMillis() >= mountTime;
          });

        setChatMessages(msgs);
      },
      (err) => {
        console.error('[ChatBox] Failed to subscribe to chat', err);
      },
    );

    return () => unsub();
  }, [lobbyId, clearOnMount, mountTime]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages.length]);

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text) return;

    if (!canChat) {
      setChatError('You must be in the match to chat.');
      return;
    }

    setChatError(null);
    setChatSending(true);
    try {
      const messagesRef = collection(db, 'lobbies', lobbyId, 'chat');
      const messageRef = doc(messagesRef);

      await setDoc(messageRef, {
        uid: userUid,
        username,
        role: currentRole,
        text,
        system: false,
        createdAt: serverTimestamp(),
      });
      setChatInput('');
    } catch (err) {
      console.error('[ChatBox] send chat failed', err);
      setChatError('Failed to send message.');
    } finally {
      setChatSending(false);
    }
  };

  const handleChatKeyDown: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendChat();
    }
  };

  const roleLabel = useMemo(
    () => (msgRole: 'p1' | 'p2' | 'spectator') => {
      if (msgRole === 'p1') return 'P1';
      if (msgRole === 'p2') return 'P2';
      return 'Spec';
    },
    [],
  );

  const containerClass = fullHeight
    ? 'flex flex-1 flex-col rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 shadow-md'
    : 'flex flex-col rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 shadow-md';

  return (
    <div className={containerClass}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
        {title}
      </div>

      <div
        ref={chatScrollRef}
        className="mb-3 h-60 overflow-y-auto overflow-x-hidden rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm"
      >
        {chatMessages.length === 0 ? (
          <div className="text-xs text-slate-500">
            No messages yet. Say hello!
          </div>
        ) : (
          <ul className="space-y-1">
            {chatMessages.map((m) => (
              <li key={m.id}>
                {m.system ? (
                  <span
                    className="break-words text-xs italic text-slate-400"
                    style={{ hyphens: 'auto' }}
                  >
                    {m.text}
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-amber-200">
                      {m.username}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {' '}
                      [{roleLabel(m.role)}]
                    </span>
                    <span className="text-amber-100">: </span>
                    <span
                      className="break-words text-slate-100"
                      style={{ hyphens: 'auto' }}
                    >
                      {m.text}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {chatError && (
        <div className="mb-2 rounded border border-red-500/60 bg-red-950/60 px-2 py-1 text-[11px] text-red-200">
          {chatError}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleChatKeyDown}
          placeholder="Type a message..."
          className="flex-1 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={chatSending || !chatInput.trim() || !canChat}
          onClick={handleSendChat}
          className="inline-flex items-center justify-center rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatBox;
