// App state factory and normalization. Extracted from App.jsx so the persisted
// state shape has one well-defined home and can be reasoned about (and tested)
// independently of the React tree.
import { makeMastery, makeProfile, normalizeMastery, normalizeProfile } from "./learningModel.js";
import { AUTH_PROVIDERS, FONT_OPTIONS, PROJECT_COLORS, STUDY_MODES } from "./constants.js";
import { classifySubject, getDomain } from "./subjects.js";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const makeChat = (projectId = null) => ({
  id: uid(),
  name: "New chat",
  projectId,
  messages: [],
  createdAt: Date.now(),
});

export const defaultState = () => {
  const projectId = uid();
  const chat = makeChat(projectId);

  return {
    theme: "dark",
    fontId: "inter",
    textSize: 15,
    activeMode: "auto",
    landingComplete: false,
    onboardingComplete: false,
    account: null,
    profile: makeProfile(),
    notes: [],
    studyRooms: [],
    projects: [{ id: projectId, name: "My first topic", domainId: "general", color: PROJECT_COLORS[0], docs: [], mastery: makeMastery() }],
    chats: [chat],
    activeId: chat.id,
    flashcards: [],
    // deletion log for cloud sync: deletes push as soft-deleted rows so other
    // devices learn about them; entries clear after a successful push
    tombstones: [],
  };
};

export function normalizeState(stored) {
  const fallback = defaultState();
  if (!stored || typeof stored !== "object") return fallback;

  const projects = Array.isArray(stored.projects)
    ? stored.projects.map((project, index) => ({
        id: project?.id || uid(),
        name: project?.name || "Untitled project",
        // keep an explicitly chosen domain; otherwise infer it from the name
        domainId: project?.domainId && getDomain(project.domainId).id === project.domainId
          ? project.domainId
          : classifySubject(project?.name || ""),
        color: project?.color || PROJECT_COLORS[index % PROJECT_COLORS.length],
        mastery: normalizeMastery(project?.mastery),
        docs: Array.isArray(project?.docs)
          ? project.docs.map((doc) => ({
              id: doc?.id || uid(),
              name: doc?.name || "Untitled document",
              kind: doc?.kind || "pdf",
              pages: doc?.pages || 0,
              chars: doc?.chars || String(doc?.text || "").length,
              text: String(doc?.text || ""),
              previewUrl: doc?.previewUrl || null,
              note: doc?.note || "",
              addedAt: doc?.addedAt || Date.now(),
            }))
          : [],
      }))
    : fallback.projects;

  const chats = Array.isArray(stored.chats)
    ? stored.chats.map((chat) => ({
        id: chat?.id || uid(),
        name: chat?.name || "New chat",
        projectId: chat?.projectId || null,
        messages: Array.isArray(chat?.messages)
          ? chat.messages.map((message) => ({
              id: message?.id || uid(),
              role: message?.role === "assistant" ? "assistant" : "user",
              content: String(message?.content || ""),
              displayContent: message?.displayContent ? String(message.displayContent) : null,
              attachments: Array.isArray(message?.attachments) ? message.attachments : [],
              createdAt: message?.createdAt || Date.now(),
              feedback: message?.feedback || null,
              savedNoteId: message?.savedNoteId || null,
              streaming: false,
              imageUrl: message?.imageUrl || null,
            }))
          : [],
        createdAt: chat?.createdAt || Date.now(),
      }))
    : fallback.chats;

  const profile = normalizeProfile(stored.profile);
  const account = normalizeAccount(stored.account);

  const safeChats = chats.length ? chats : fallback.chats;
  const activeId = safeChats.some((chat) => chat.id === stored.activeId) ? stored.activeId : safeChats[0].id;
  const activeMode = STUDY_MODES.some((mode) => mode.id === stored.activeMode) ? stored.activeMode : "auto";

  return {
    theme: stored.theme === "light" ? "light" : "dark",
    fontId: FONT_OPTIONS.some((font) => font.id === stored.fontId) ? stored.fontId : "inter",
    textSize: Number.isFinite(Number(stored.textSize)) ? Number(stored.textSize) : 15,
    activeMode,
    landingComplete: Boolean(stored.landingComplete || stored.onboardingComplete || account?.verified),
    onboardingComplete: Boolean(stored.onboardingComplete),
    account,
    profile,
    notes: Array.isArray(stored.notes) ? stored.notes : [],
    studyRooms: Array.isArray(stored.studyRooms)
      ? stored.studyRooms.map((room) => ({
          id: room?.id || uid(),
          name: String(room?.name || "Study room"),
          topic: String(room?.topic || "General study"),
          projectId: room?.projectId || null,
          members: Number.isFinite(Number(room?.members)) ? Number(room.members) : 1,
          createdAt: room?.createdAt || Date.now(),
          lastActivityAt: room?.lastActivityAt || Date.now(),
        }))
      : [],
    projects,
    chats: safeChats,
    activeId,
    tombstones: Array.isArray(stored.tombstones)
      ? stored.tombstones
          .filter((tomb) => tomb && typeof tomb.table === "string" && tomb.id)
          .slice(0, 500)
      : [],
    flashcards: Array.isArray(stored.flashcards)
      ? stored.flashcards.map((deck) => ({
          id: deck?.id || uid(),
          chatId: deck?.chatId || null,
          projectId: deck?.projectId || null,
          chatName: String(deck?.chatName || "Chat"),
          createdAt: deck?.createdAt || Date.now(),
          cards: Array.isArray(deck?.cards)
            ? deck.cards.map((card) => ({ id: card?.id || uid(), question: String(card?.question || ""), answer: String(card?.answer || "") }))
            : [],
        }))
      : [],
  };
}

export function normalizeAccount(account) {
  if (!account || typeof account !== "object") return null;
  return {
    id: account.id || uid(),
    name: String(account.name || "").slice(0, 80),
    email: String(account.email || "").slice(0, 160),
    provider: AUTH_PROVIDERS.some((provider) => provider.id === account.provider) ? account.provider : "email",
    verified: Boolean(account.verified),
    createdAt: account.createdAt || Date.now(),
    lastLoginAt: account.lastLoginAt || Date.now(),
  };
}

// Persisted state loads asynchronously from IndexedDB, so we render a
// normalized default first and hydrate once storage resolves.
export const initialState = () => normalizeState(null);
