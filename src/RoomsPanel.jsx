// Peer — real peer-to-peer study rooms (M9).
// Replaces the local prototype with Supabase Realtime multiplayer:
//  • rooms live in Postgres (RLS: members-only), joined via invite code
//  • presence shows who's actually here right now
//  • a broadcast room chat — which IS live teach-back: explain, get poked
//  • synchronized co-op quizzing from the host's flashcard decks
// Everything is subject-aware (rooms carry a domain) and works for any field.
// Loaded lazily; needs a signed-in session (rooms are inherently multi-user).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, DoorOpen, Loader2, LogIn, Play, Plus, RefreshCw, Send, Users, X } from "lucide-react";
import { getSupabase } from "./supabase.js";
import StyledSelect from "./components/StyledSelect.jsx";
import { DOMAINS, GENERAL_DOMAIN, classifySubject, getDomain } from "./subjects.js";
import { DOMAIN_ICONS } from "./constants.js";

const uid = () => Math.random().toString(36).slice(2, 10);

export default function RoomsPanel({ account, decks, projects, showToast, onSignIn, startCommunityChallenge, challenges, onRoomSession }) {
  const signedIn = Boolean(account?.verified);
  const [rooms, setRooms] = useState(null); // null = loading
  const [activeRoom, setActiveRoom] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVisibility, setNewVisibility] = useState("private");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState("");
  const [publicRooms, setPublicRooms] = useState(null); // null = loading
  const [discoverDomain, setDiscoverDomain] = useState("all");

  const refreshRooms = useCallback(async () => {
    const client = await getSupabase();
    if (!client) return;
    const { data } = await client.from("rooms").select("*").eq("deleted", false).order("created_at", { ascending: false });
    setRooms(data || []);
  }, []);

  // Discovery: only the safe listing the RPC exposes (no invite codes/owners).
  const refreshDiscovery = useCallback(async () => {
    const client = await getSupabase();
    if (!client) return;
    const { data, error } = await client.rpc("list_public_rooms");
    setPublicRooms(error ? [] : (data || []));
  }, []);

  useEffect(() => {
    if (signedIn) { refreshRooms(); refreshDiscovery(); }
  }, [signedIn, refreshRooms, refreshDiscovery]);

  async function createRoom(event) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy("create");
    try {
      const client = await getSupabase();
      const domainId = classifySubject(name);
      const { data, error } = await client.from("rooms").insert({
        owner_id: account.id,
        name,
        topic: name,
        domain_id: domainId,
        visibility: newVisibility,
      }).select().single();
      if (error) throw new Error(error.message);
      await client.from("room_members").upsert({ room_id: data.id, user_id: account.id, role: "owner" });
      setNewName("");
      setCreating(false);
      await refreshRooms();
      if (newVisibility === "public") refreshDiscovery();
      setActiveRoom(data);
      showToast(newVisibility === "public"
        ? `Room "${name}" is live and discoverable by anyone studying ${getDomain(domainId).label}.`
        : `Room "${name}" is live — share the invite code!`);
    } catch (err) {
      showToast(err.message || "Could not create the room.");
    } finally {
      setBusy("");
    }
  }

  async function joinPublicRoom(room) {
    setBusy(`discover-${room.id}`);
    try {
      const client = await getSupabase();
      const { data, error } = await client.rpc("join_public_room", { room: room.id });
      if (error) throw new Error(error.message);
      const joined = Array.isArray(data) ? data[0] : data;
      if (!joined) throw new Error("That room is not open to join.");
      await refreshRooms();
      setActiveRoom(joined);
      showToast(`Joined "${joined.name}"`);
    } catch (err) {
      showToast(err.message || "Could not join the room.");
    } finally {
      setBusy("");
    }
  }

  async function joinRoom(event) {
    event.preventDefault();
    const code = joinCode.trim().toLowerCase();
    if (!code) return;
    setBusy("join");
    try {
      const client = await getSupabase();
      const { data, error } = await client.rpc("join_room_with_code", { code });
      if (error) throw new Error(error.message);
      const room = Array.isArray(data) ? data[0] : data;
      if (!room) throw new Error("No room found for that invite code.");
      setJoinCode("");
      await refreshRooms();
      setActiveRoom(room);
      showToast(`Joined "${room.name}"`);
    } catch (err) {
      showToast(err.message || "Could not join the room.");
    } finally {
      setBusy("");
    }
  }

  if (!signedIn) {
    return (
      <section className="social-panel">
        <div className="page-heading">
          <div>
            <h1>Peer rooms</h1>
            <p>Study any subject live with a real partner — presence, chat, teach-back, and co-op quizzing.</p>
          </div>
        </div>
        <div className="empty-state">
          <Users size={28} />
          <strong>Rooms need an account</strong>
          <span>Sign in (it's free) and you can host a room or join a friend's with an invite code.</span>
          <button className="primary-button" onClick={onSignIn}><LogIn size={15} /> Sign in</button>
        </div>
      </section>
    );
  }

  if (activeRoom) {
    return (
      <LiveRoom
        room={activeRoom}
        account={account}
        decks={decks}
        showToast={showToast}
        onRoomSession={onRoomSession}
        leave={() => { setActiveRoom(null); refreshRooms(); }}
      />
    );
  }

  return (
    <section className="social-panel">
      <div className="page-heading">
        <div>
          <h1>Peer rooms</h1>
          <p>Host a live study room or join one with an invite code — any subject, real partners.</p>
        </div>
        <button onClick={() => setCreating(true)}><Plus size={15} /> Create room</button>
      </div>

      <div className="social-grid">
        <div className="profile-card wide">
          <h2>Join with an invite code</h2>
          <form className="room-join-form" onSubmit={joinRoom}>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="e.g. 3f9a1c2b7d4e"
              aria-label="Invite code"
            />
            <button className="primary-button" type="submit" disabled={busy === "join" || !joinCode.trim()}>
              {busy === "join" ? <Loader2 size={15} className="spin" /> : <DoorOpen size={15} />} Join
            </button>
          </form>
        </div>

        {creating && (
          <div className="profile-card wide">
            <h2>Create a room</h2>
            <form className="room-join-form" onSubmit={createRoom}>
              <input
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Organic Chemistry finals crew, Spanish B2 talk hour..."
                aria-label="Room name"
              />
              <button className="primary-button" type="submit" disabled={busy === "create" || !newName.trim()}>
                {busy === "create" ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Create
              </button>
              <button type="button" className="ghost-button" onClick={() => setCreating(false)}>Cancel</button>
            </form>
            <div className="segmented room-visibility" role="radiogroup" aria-label="Who can find this room">
              <button
                type="button"
                className={newVisibility === "private" ? "active" : ""}
                aria-pressed={newVisibility === "private"}
                onClick={() => setNewVisibility("private")}
              >Private — invite code only</button>
              <button
                type="button"
                className={newVisibility === "public" ? "active" : ""}
                aria-pressed={newVisibility === "public"}
                onClick={() => setNewVisibility("public")}
              >Public — anyone can discover it</button>
            </div>
          </div>
        )}

        <div className="profile-card wide">
          <div className="discover-head">
            <h2>Discover public rooms</h2>
            <div className="discover-tools">
              <StyledSelect value={discoverDomain} onChange={(event) => setDiscoverDomain(event.target.value)} aria-label="Filter by subject">
                <option value="all">All subjects</option>
                {DOMAINS.map((domain) => <option key={domain.id} value={domain.id}>{domain.label}</option>)}
              </StyledSelect>
              <button type="button" onClick={refreshDiscovery} aria-label="Refresh public rooms"><RefreshCw size={14} /></button>
            </div>
          </div>
          {publicRooms === null ? (
            <p><Loader2 size={14} className="spin" /> Finding rooms…</p>
          ) : (() => {
            const mineIds = new Set((rooms || []).map((room) => room.id));
            const visible = publicRooms
              .filter((room) => !mineIds.has(room.id))
              .filter((room) => discoverDomain === "all" || room.domain_id === discoverDomain);
            if (!visible.length) {
              return (
                <div className="empty-state compact">
                  <Users size={24} />
                  <strong>No public rooms {discoverDomain === "all" ? "yet" : `for ${getDomain(discoverDomain).label} yet`}</strong>
                  <span>Create one and set it to Public — anyone studying that subject can find and join it.</span>
                </div>
              );
            }
            const byDomain = visible.reduce((acc, room) => { (acc[room.domain_id] ||= []).push(room); return acc; }, {});
            return Object.entries(byDomain).map(([domainId, list]) => {
              const domain = getDomain(domainId);
              const Icon = DOMAIN_ICONS[domain.icon] || DOMAIN_ICONS.brain;
              return (
                <div key={domainId} className="discover-group">
                  <h3><span style={{ color: domain.accent }}><Icon size={15} aria-hidden="true" /></span> {domain.label}</h3>
                  <div className="room-list">
                    {list.map((room) => {
                      const activeRecently = Date.now() - Date.parse(room.updated_at) < 24 * 3_600_000;
                      return (
                        <article className="room-card" key={room.id}>
                          <span style={{ color: domain.accent }}><Users size={17} aria-hidden="true" /></span>
                          <div>
                            <strong>{room.name}</strong>
                            <small>
                              {room.topic && room.topic !== room.name ? `${room.topic} · ` : ""}
                              {room.member_count} {Number(room.member_count) === 1 ? "member" : "members"}
                              {activeRecently ? " · active today" : ""}
                            </small>
                          </div>
                          <button onClick={() => joinPublicRoom(room)} disabled={busy === `discover-${room.id}`}>
                            {busy === `discover-${room.id}` ? <Loader2 size={13} className="spin" /> : <DoorOpen size={13} />} Join
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        <div className="profile-card wide">
          <h2>Your rooms</h2>
          {rooms === null ? (
            <p><Loader2 size={14} className="spin" /> Loading rooms…</p>
          ) : rooms.length === 0 ? (
            <div className="empty-state compact">
              <Users size={24} />
              <strong>No rooms yet</strong>
              <span>Create one and send the invite code to a study partner — they join from any device.</span>
            </div>
          ) : (
            <div className="room-list">
              {rooms.map((room) => {
                const domain = getDomain(room.domain_id);
                const Icon = DOMAIN_ICONS[domain.icon] || DOMAIN_ICONS.brain;
                return (
                  <article className="room-card" key={room.id}>
                    <span style={{ color: domain.accent }}><Icon size={17} aria-hidden="true" /></span>
                    <div>
                      <strong>{room.name}</strong>
                      <small>{domain.label} · invite code {room.invite_code}{room.owner_id === account.id ? " · you host" : ""}</small>
                    </div>
                    <button onClick={() => setActiveRoom(room)}><Play size={13} /> Enter</button>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {challenges?.length > 0 && (
          <div className="profile-card wide">
            <h2>Solo challenge sets</h2>
            <div className="challenge-grid">
              {challenges.map((challenge) => (
                <article className="challenge-card" key={challenge.id}>
                  <span>{challenge.subject}</span>
                  <strong>{challenge.title}</strong>
                  <small>{challenge.level}</small>
                  <button onClick={() => startCommunityChallenge(challenge)}>Start</button>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── the live room: presence + broadcast chat + synchronized co-op quiz ──
function LiveRoom({ room, account, decks, showToast, leave, onRoomSession }) {
  // one session credit per room entry (badge signal)
  useEffect(() => { onRoomSession?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [quiz, setQuiz] = useState(null); // { question, answer, revealed, index, total, byName }
  const [deckId, setDeckId] = useState(decks[0]?.id || "");
  const [connected, setConnected] = useState(false);
  const channelRef = useRef(null);
  const feedRef = useRef(null);
  const quizIndexRef = useRef(0);

  const domain = getDomain(room.domain_id);
  const isHost = room.owner_id === account.id;
  const myDecks = decks;

  useEffect(() => {
    let channel = null;
    let disposed = false;
    (async () => {
      const client = await getSupabase();
      if (!client || disposed) return;
      channel = client.channel(`room:${room.id}`, {
        config: { presence: { key: account.id }, broadcast: { self: true }, private: true },
      });
      channelRef.current = channel;

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setMembers(Object.values(state).flat());
      });
      channel.on("broadcast", { event: "room-msg" }, ({ payload }) => {
        setMessages((current) => [...current.slice(-199), payload]);
      });
      channel.on("broadcast", { event: "quiz" }, ({ payload }) => {
        setQuiz(payload.done ? null : payload);
      });
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          await channel.track({ userId: account.id, name: account.name || "Learner" });
        }
      });
    })();
    return () => {
      disposed = true;
      channel?.unsubscribe();
      channelRef.current = null;
    };
  }, [room.id, account.id, account.name]);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages]);

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !channelRef.current) return;
    setDraft("");
    channelRef.current.send({
      type: "broadcast",
      event: "room-msg",
      payload: { id: uid(), name: account.name || "Learner", userId: account.id, text, at: Date.now() },
    });
  }

  function broadcastQuizCard(index) {
    const deck = myDecks.find((item) => item.id === deckId);
    const card = deck?.cards[index];
    if (!deck || !card) {
      channelRef.current?.send({ type: "broadcast", event: "quiz", payload: { done: true } });
      showToast("Quiz finished — nice work, everyone.");
      return;
    }
    quizIndexRef.current = index;
    channelRef.current?.send({
      type: "broadcast",
      event: "quiz",
      payload: {
        question: card.question,
        answer: card.answer,
        revealed: false,
        index: index + 1,
        total: deck.cards.length,
        deckName: deck.chatName,
        byName: account.name || "Host",
      },
    });
  }

  function revealAnswer() {
    if (!quiz) return;
    channelRef.current?.send({ type: "broadcast", event: "quiz", payload: { ...quiz, revealed: true } });
  }

  const DomainIcon = DOMAIN_ICONS[domain.icon] || DOMAIN_ICONS.brain;

  return (
    <section className="social-panel live-room">
      <div className="page-heading">
        <div>
          <h1><DomainIcon size={20} aria-hidden="true" style={{ color: domain.accent, verticalAlign: "-3px" }} /> {room.name}</h1>
          <p>
            {domain.label} · invite code <strong className="room-code">{room.invite_code}</strong>
            <button
              className="room-copy"
              onClick={() => { navigator.clipboard?.writeText(room.invite_code); showToast("Invite code copied"); }}
              aria-label="Copy invite code"
            ><Copy size={13} /></button>
          </p>
        </div>
        <button onClick={leave}><X size={15} /> Leave room</button>
      </div>

      <div className="live-room-grid">
        <div className="profile-card live-room-main">
          <h2>Room chat · live teach-back</h2>
          <div className="room-feed" ref={feedRef} aria-live="polite" aria-label="Room messages">
            {messages.length === 0 ? (
              <p className="room-feed-empty">
                {connected
                  ? "You're live. Explain something to the room — teaching it is the fastest way to learn it."
                  : "Connecting to the room…"}
              </p>
            ) : messages.map((message) => (
              <div key={message.id} className={`room-msg ${message.userId === account.id ? "mine" : ""}`}>
                <strong>{message.name}</strong>
                <span>{message.text}</span>
              </div>
            ))}
          </div>
          <form className="room-composer" onSubmit={sendMessage}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Explain, ask, or challenge the room…"
              aria-label="Message the room"
            />
            <button className="primary-button" type="submit" disabled={!draft.trim() || !connected} aria-label="Send">
              <Send size={15} />
            </button>
          </form>
        </div>

        <div className="live-room-side">
          <div className="profile-card">
            <h2>Here now ({members.length})</h2>
            <div className="room-presence" role="list">
              {members.map((member) => (
                <span key={member.userId} role="listitem" className="room-presence-chip">
                  <i aria-hidden="true" />{member.name}{member.userId === account.id ? " (you)" : ""}
                </span>
              ))}
              {members.length <= 1 && (
                <p className="room-feed-empty">Share the invite code — a partner can join from any device.</p>
              )}
            </div>
          </div>

          <div className="profile-card">
            <h2>Co-op quiz</h2>
            {quiz ? (
              <div className="room-quiz">
                <small>{quiz.deckName} · {quiz.index}/{quiz.total} · by {quiz.byName}</small>
                <p className="room-quiz-q">{quiz.question}</p>
                {quiz.revealed ? (
                  <p className="room-quiz-a">{quiz.answer}</p>
                ) : (
                  <p className="room-feed-empty">Answer in chat, then reveal.</p>
                )}
                {isHost && (
                  <div className="room-quiz-actions">
                    {!quiz.revealed
                      ? <button className="primary-button" onClick={revealAnswer}>Reveal answer</button>
                      : <button className="primary-button" onClick={() => broadcastQuizCard(quizIndexRef.current + 1)}>Next question</button>}
                    <button onClick={() => channelRef.current?.send({ type: "broadcast", event: "quiz", payload: { done: true } })}>End quiz</button>
                  </div>
                )}
              </div>
            ) : isHost ? (
              myDecks.length ? (
                <div className="room-quiz">
                  <label>
                    Deck
                    <StyledSelect value={deckId} onChange={(event) => setDeckId(event.target.value)} aria-label="Quiz deck">
                      {myDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.chatName} ({deck.cards.length})</option>)}
                    </StyledSelect>
                  </label>
                  <button className="primary-button" onClick={() => broadcastQuizCard(0)} disabled={!deckId || !connected}>
                    <Play size={14} /> Start co-op quiz
                  </button>
                </div>
              ) : (
                <p className="room-feed-empty">Make flashcards from any AI answer first — then quiz the whole room with them.</p>
              )
            ) : (
              <p className="room-feed-empty">The host can launch a synchronized quiz — answers happen in chat.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
