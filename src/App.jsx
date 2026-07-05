import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap, useMediaQuery } from "./a11y.js";
import { useCloudSync } from "./useCloudSync.js";
import { LandingAuthFlow, accountFromUser } from "./auth.jsx";
import { getSupabase } from "./supabase.js";
import { aiRequestHeaders } from "./peerChat.js";
import {
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Code2,
  Command,
  FileText,
  GitBranch,
  GraduationCap,
  HelpCircle,
  Languages,
  Layers,
  Library,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Trophy,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from "lucide-react";
import { Markdown } from "./markdown.jsx";
import { extractStudyMaterial } from "./materials.js";
import { buildSystemPrompt, shouldUseRetrieval } from "./peerPrompt.js";
import { loadState, saveState, setSaveErrorHandler } from "./storage.js";
import {
  addReflection,
  applyFeedback,
  applyReflection,
  buildSessionRecap,
  buildSkillTree,
  buildLearnerRecap,
  buildTeachingRecipe,
  getWeakSpots,
  inferProfileFromMessage,
  makeMastery,
  recordStudyActivity,
  setExplanationDepth,
  updateMasteryFromFeedback,
  updateMasteryFromMessage,
  updateProfileFromAttachments,
} from "./learningModel.js";
import {
  AUTH_PROVIDERS,
  BADGE_ICONS,
  COMMUNITY_CHALLENGES,
  DEPTH_OPTIONS,
  DOMAIN_ICONS,
  FONT_OPTIONS,
  LANGUAGE_OPTIONS,
  LEARNING_STYLE_OPTIONS,
  LEVEL_OPTIONS,
  PROJECT_COLORS,
  STARTERS,
  STUDY_MODES,
} from "./constants.js";
import {
  defaultState,
  initialState,
  makeChat,
  normalizeState,
  uid,
} from "./stateModel.js";
import { DOMAINS, GENERAL_DOMAIN, classifySubject, domainForProject, getDomain } from "./subjects.js";
import { computeBadges, detectNewBadges, getBadgeDef } from "./badges.js";
import { hapticTap } from "./native.js";
import PeerNavRail from "./components/PeerNavRail.jsx";

// Heavy screens load on demand: the Brain pulls in Three.js (~600KB) and the
// Code lab pulls highlight.js — neither belongs in the initial bundle.
const LearningBrainPanel = React.lazy(() =>
  import("./LearningBrain.jsx").then((module) => ({ default: module.LearningBrainPanel })),
);
const CodingPanel = React.lazy(() => import("./CodingPanel.jsx"));
const RoomsPanel = React.lazy(() => import("./RoomsPanel.jsx"));

function PanelLoading({ label }) {
  return (
    <div className="panel-loading" role="status">
      <span className="panel-loading-orb" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
import { gradeCard, dueQueue, dueCount } from "./spacedRepetition.js";

function PeerLogo({ size = 28 }) {
  return (
    <svg
      className="peer-logo-mark"
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="peerLogoGlow" x1="4" y1="3" x2="24" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.42" />
        </linearGradient>
      </defs>
      <rect x="1.6" y="1.6" width="24.8" height="24.8" rx="6.2" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.22" />
      <path d="M7.4 21.4V6.6h8.2c3.4 0 5.6 1.9 5.6 4.8s-2.2 4.8-5.6 4.8H10" stroke="url(#peerLogoGlow)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 10.1h5.1c1.1 0 1.8.5 1.8 1.3s-.7 1.3-1.8 1.3H10" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeOpacity="0.6" />
      <path d="M6.4 21.4h6.1M18.6 4.8l2.6-2.1M21.1 11.4h3.2M18.4 18.3l2.9 2.4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.42" />
      <circle cx="7.4" cy="6.6" r="1.75" fill="currentColor" />
      <circle cx="21.2" cy="11.4" r="1.8" fill="currentColor" />
      <circle cx="7.4" cy="21.4" r="1.75" fill="currentColor" />
      <circle cx="21.3" cy="20.7" r="1.2" fill="currentColor" fillOpacity="0.55" />
      <circle cx="21.2" cy="2.7" r="1.2" fill="currentColor" fillOpacity="0.55" />
    </svg>
  );
}

export default function App() {
  const [state, setState] = useState(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState("chat");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 820);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [managedProjectId, setManagedProjectId] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [aiGate, setAiGate] = useState(null); // { code: "auth_required" | "quota_exhausted", details }
  const [usageInfo, setUsageInfo] = useState(null); // { plan, usedToday, allowance }
  const [chatSearch, setChatSearch] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [composerDragging, setComposerDragging] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [profileDraft, setProfileDraft] = useState(() => ({
    subject: state.profile.subject,
    goal: state.profile.goal,
    language: state.profile.language,
    level: state.profile.level,
    learningPreference: state.profile.learningPreference,
  }));
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const voiceModeRef = useRef(false);
  const spokenOffsetRef = useRef(0);
  const speechQueueRef = useRef(0);
  const listeningRef = useRef(false);
  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const loadingRef = useRef(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  // Real auth: mirror the Supabase session into app state. Signing in flips
  // past the landing; signing out returns there (local data stays put).
  useEffect(() => {
    if (!hydrated) return undefined;
    let unsubscribe = null;
    let disposed = false;
    (async () => {
      const client = await getSupabase();
      if (!client || disposed) return;
      const { data } = await client.auth.getSession();
      if (data?.session && !disposed) {
        const account = accountFromUser(data.session.user);
        updateState((current) => ({ ...current, account, landingComplete: true }));
      }
      const { data: sub } = client.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session) {
          const account = accountFromUser(session.user);
          updateState((current) => ({ ...current, account, landingComplete: true }));
        }
        if (event === "SIGNED_OUT") {
          updateState((current) => ({ ...current, account: null, landingComplete: false }));
        }
      });
      unsubscribe = () => sub?.subscription?.unsubscribe();
    })();
    return () => {
      disposed = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  async function signOut() {
    const client = await getSupabase();
    await client?.auth.signOut();
    showToast("Signed out. Your data stays on this device.");
  }

  function confirmDeleteAccount() {
    requestConfirm({
      title: "Delete your account?",
      body: "Your account and ALL cloud data (subjects, chats, notes, decks, usage) will be permanently erased. Data on this device is kept locally. This cannot be undone.",
      confirmLabel: "Delete my account",
      action: async () => {
        try {
          const client = await getSupabase();
          const { data } = (await client?.auth.getSession()) || {};
          const token = data?.session?.access_token;
          if (!token) throw new Error("No active session.");
          const response = await fetch("/api/delete-account", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || "Deletion failed.");
          }
          await client.auth.signOut();
          showToast("Account deleted. Local data kept on this device.");
        } catch (err) {
          showToast(friendlyError(err, "Could not delete the account."));
        }
      },
    });
  }

  // Award newly earned badges (cheap, idempotent detector run on state
  // changes). Celebrated with a toast; the trophy case lives in Profile.
  useEffect(() => {
    if (!hydrated) return;
    const fresh = detectNewBadges(state);
    if (!fresh.length) return;
    updateState((current) => ({ ...current, badges: [...(current.badges || []), ...fresh] }));
    const def = getBadgeDef(fresh[0].badgeId);
    hapticTap("MEDIUM"); // a little celebration buzz on phones
    showToast(fresh.length === 1
      ? `Badge earned: ${def?.title || "Achievement"} 🏆`
      : `${fresh.length} badges earned! Check your trophy case 🏆`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, state]);

  // Rooms participation counts toward badges.
  const recordRoomSession = useCallback(() => {
    updateState((current) => ({
      ...current,
      profile: {
        ...current.profile,
        signals: { ...current.profile.signals, roomSessions: (current.profile.signals?.roomSessions || 0) + 1 },
      },
    }));
  }, []);

  // Daily AI usage meter (server-computed; the client only displays it).
  const refreshUsage = useCallback(async () => {
    try {
      const response = await fetch("/api/usage", { headers: await aiRequestHeaders() });
      if (!response.ok) {
        setUsageInfo(null);
        return;
      }
      setUsageInfo(await response.json());
    } catch {
      setUsageInfo(null);
    }
  }, []);
  useEffect(() => {
    if (hydrated && state.landingComplete) refreshUsage();
  }, [hydrated, state.landingComplete, state.account?.id, refreshUsage]);

  async function startCheckout(interval = "monthly") {
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: await aiRequestHeaders(),
        body: JSON.stringify({ interval, origin: window.location.origin }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Checkout is not available yet.");
      window.location.href = data.url;
    } catch (err) {
      showToast(friendlyError(err, "Checkout is not available yet."));
    }
  }

  // Background cloud sync (dormant until a session exists)
  const stateRef = useRef(state);
  stateRef.current = state;
  const getStateForSync = useCallback(() => stateRef.current, []);
  const applyStateForSync = useCallback((updater) => setState(updater), []);
  const cloudSync = useCloudSync({
    getState: getStateForSync,
    applyState: applyStateForSync,
    enabled: hydrated && state.landingComplete,
  });

  const activeChat = state.chats.find((chat) => chat.id === state.activeId) || state.chats[0];
  const activeProject = state.projects.find((project) => project.id === activeChat?.projectId) || null;
  const managedProject = state.projects.find((project) => project.id === managedProjectId) || null;
  const selectedDoc = managedProject?.docs.find((doc) => doc.id === selectedDocId) || managedProject?.docs[0] || null;
  const unfiledChats = state.chats.filter((chat) => !chat.projectId);
  const font = FONT_OPTIONS.find((option) => option.id === state.fontId) || FONT_OPTIONS[0];
  // Fraunces display serif applies only with the standard fonts — a learner's
  // accessibility font (OpenDyslexic, Atkinson, Lexend…) wins everywhere.
  const fontDisplay = ["inter", "system", "serif"].includes(font.id)
    ? "'Fraunces', Georgia, serif"
    : font.family;
  const activeMode = STUDY_MODES.find((mode) => mode.id === state.activeMode) || STUDY_MODES[0];
  const insights = getProfileInsights(state.profile);

  const appClass = useMemo(() => `app ${state.theme === "light" ? "theme-light" : "theme-dark"}`, [state.theme]);

  // Hydrate persisted state from IndexedDB once on mount, then resync the
  // onboarding draft so it reflects the loaded profile.
  useEffect(() => {
    let cancelled = false;
    setSaveErrorHandler((error) => {
      showToast(
        error?.name === "QuotaExceededError"
          ? "Local storage is full. Remove some documents or notes to keep saving."
          : "Could not save your latest changes locally.",
      );
    });
    loadState().then((stored) => {
      if (cancelled) return;
      if (stored) {
        const next = normalizeState(stored);
        setState(next);
        setProfileDraft({
          subject: next.profile.subject,
          goal: next.profile.goal,
          language: next.profile.language,
          level: next.profile.level,
          learningPreference: next.profile.learningPreference,
        });
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
      setSaveErrorHandler(null);
    };
  }, []);

  // Only persist after hydration so the default state never overwrites real
  // saved data during the initial load.
  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);
  // Scroll to the newest message only when one is added (or the thread
  // switches) — not on every streamed chunk; StreamingMessage handles those.
  // Scroll the .messages container directly: scrollIntoView also scrolls the
  // overflow-hidden .main ancestor, which shifts the whole layout upward.
  const messageCount = activeChat?.messages.length || 0;
  const activeChatId = activeChat?.id;
  useEffect(() => {
    const container = bottomRef.current?.closest(".messages");
    if (!container) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ top: container.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeChatId, messageCount, loading]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);
  // Open/close the sidebar only when the layout actually crosses the mobile
  // breakpoint — never on plain resizes, so a manual toggle isn't overridden.
  const isMobile = useMediaQuery("(max-width: 820px)");
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);
  const drawerRef = useFocusTrap(isMobile && sidebarOpen && view === "chat", {
    onEscape: () => setSidebarOpen(false),
  });
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const updateState = (updater) => setState((current) => (typeof updater === "function" ? updater(current) : updater));
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message) => {
    setToast({ id: uid(), message });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  // Ask before destructive actions. `action` runs only on explicit confirm.
  const requestConfirm = useCallback((options) => setConfirmRequest(options), []);

  function createChat(projectId = null) {
    const chat = makeChat(projectId);
    updateState((current) => ({ ...current, chats: [...current.chats, chat], activeId: chat.id }));
    setView("chat");
    if (window.innerWidth < 820) setSidebarOpen(false);
  }

  // Deletion log for cloud sync: hard-delete locally, remember what died so
  // the sync layer can tombstone it remotely.
  function withTombstones(current, entries) {
    return [
      ...entries.map((entry) => ({ ...entry, at: Date.now() })),
      ...(current.tombstones || []),
    ].slice(0, 500);
  }

  function deleteChat(id) {
    updateState((current) => {
      const dying = current.chats.find((chat) => chat.id === id);
      const tombstones = withTombstones(current, [
        { table: "chats", id },
        ...(dying?.messages || []).map((message) => ({ table: "messages", id: message.id, parentId: id })),
      ]);
      const remaining = current.chats.filter((chat) => chat.id !== id);
      if (!remaining.length) {
        const chat = makeChat();
        return { ...current, tombstones, chats: [chat], activeId: chat.id };
      }
      return {
        ...current,
        tombstones,
        chats: remaining,
        activeId: current.activeId === id ? remaining[remaining.length - 1].id : current.activeId,
      };
    });
  }

  function renameChat() {
    if (!editingChatId || !editingName.trim()) {
      setEditingChatId(null);
      return;
    }
    updateState((current) => ({
      ...current,
      chats: current.chats.map((chat) => chat.id === editingChatId ? { ...chat, name: editingName.trim() } : chat),
    }));
    setEditingChatId(null);
  }

  function addProject(nameOverride) {
    const name = (nameOverride || newProjectName).trim();
    if (!name) return;

    const id = uid();
    const domainId = classifySubject(name);
    const domain = getDomain(domainId);
    updateState((current) => ({
      ...current,
      projects: [
        ...current.projects,
        {
          id,
          name,
          domainId,
          color: domainId === "general" ? PROJECT_COLORS[current.projects.length % PROJECT_COLORS.length] : domain.accent,
          docs: [],
          mastery: makeMastery(),
        },
      ],
    }));
    setExpanded((current) => ({ ...current, [id]: true }));
    setNewProjectName("");
    showToast(domainId === "general" ? `Subject "${name}" created` : `Subject "${name}" created · ${domain.label}`);
  }

  // Explicit domain choice from the project modal — overrides inference.
  function setProjectDomain(projectId, domainId) {
    const domain = getDomain(domainId);
    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) => (
        project.id === projectId
          ? { ...project, domainId: domain.id, color: domain.id === "general" ? project.color : domain.accent }
          : project
      )),
    }));
    showToast(`Domain set to ${domain.label}`);
  }

  function deleteProject(id) {
    updateState((current) => {
      const dying = current.projects.find((project) => project.id === id);
      return {
        ...current,
        tombstones: withTombstones(current, [
          { table: "projects", id },
          ...(dying?.docs || []).map((doc) => ({ table: "documents", id: doc.id, parentId: id })),
        ]),
        projects: current.projects.filter((project) => project.id !== id),
        chats: current.chats.map((chat) => chat.projectId === id ? { ...chat, projectId: null } : chat),
      };
    });
    setManagedProjectId(null);
    showToast("Project deleted");
  }

  function confirmDeleteChat(id) {
    const chat = state.chats.find((item) => item.id === id);
    if (!chat || chat.messages.length === 0) {
      deleteChat(id);
      return;
    }
    requestConfirm({
      title: "Delete this chat?",
      body: `"${chat.name}" and its ${chat.messages.length} message${chat.messages.length === 1 ? "" : "s"} will be removed. This cannot be undone.`,
      confirmLabel: "Delete chat",
      action: () => deleteChat(id),
    });
  }

  function confirmDeleteProject(id) {
    const project = state.projects.find((item) => item.id === id);
    if (!project) return;
    const docCount = project.docs?.length || 0;
    requestConfirm({
      title: `Delete "${project.name}"?`,
      body: `${docCount ? `Its ${docCount} document${docCount === 1 ? "" : "s"} and tracked concepts` : "Its tracked concepts"} will be removed; its chats move to Recents. This cannot be undone.`,
      confirmLabel: "Delete project",
      action: () => deleteProject(id),
    });
  }

  function confirmDeleteNote(noteId) {
    const note = state.notes.find((item) => item.id === noteId);
    requestConfirm({
      title: "Delete this note?",
      body: `"${note?.title || "This note"}" will be removed. This cannot be undone.`,
      confirmLabel: "Delete note",
      action: () => deleteNote(noteId),
    });
  }

  function confirmDeleteDeck(id) {
    const deck = state.flashcards.find((item) => item.id === id);
    const cardCount = deck?.cards?.length || 0;
    requestConfirm({
      title: "Delete this deck?",
      body: `"${deck?.chatName || "This deck"}"${cardCount ? ` and its ${cardCount} card${cardCount === 1 ? "" : "s"}` : ""} will be removed, including review progress. This cannot be undone.`,
      confirmLabel: "Delete deck",
      action: () => deleteFlashcardDeck(id),
    });
  }

  function confirmResetData() {
    requestConfirm({
      title: "Reset local data?",
      body: "All chats, projects, documents, notes, and flashcards on this device will be erased. Your profile and appearance settings are kept. This cannot be undone.",
      confirmLabel: "Erase everything",
      action: resetData,
    });
  }

  async function handleMaterialInput(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !managedProject) return;
    await addMaterials(files, managedProject.id);
  }

  // Fire-and-forget document ingestion for semantic retrieval. Failure is
  // fine — the tutor still answers, just without cited excerpts.
  async function embedDocInBackground(doc, projectId) {
    if (!doc?.text?.trim() || doc.kind === "image") return;
    try {
      await fetch("/api/embed-doc", {
        method: "POST",
        headers: await aiRequestHeaders(),
        body: JSON.stringify({ docId: doc.id, projectId, name: doc.name, kind: doc.kind, text: doc.text }),
      });
    } catch { /* retrieval is a progressive enhancement */ }
  }

  async function removeDocChunks(docId) {
    try {
      await fetch("/api/embed-doc", {
        method: "POST",
        headers: await aiRequestHeaders(),
        body: JSON.stringify({ docId, remove: true }),
      });
    } catch { /* orphaned chunks are harmless; retried on re-embed */ }
  }

  // OCR: turn an uploaded image into searchable, embeddable text.
  async function ocrDoc(projectId, docId) {
    const project = state.projects.find((item) => item.id === projectId);
    const doc = project?.docs.find((item) => item.id === docId);
    if (!doc?.previewUrl) return;
    showToast("Reading text from image…");
    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: await aiRequestHeaders(),
        body: JSON.stringify({ dataUrl: doc.previewUrl }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 402) {
          setAiGate({ code: data.code || "auth_required", details: data });
        }
        throw new Error(data.error || "OCR failed.");
      }
      if (!data.text) {
        showToast("No readable text found in this image.");
        return;
      }
      updateState((current) => ({
        ...current,
        projects: current.projects.map((item) => (item.id === projectId
          ? {
              ...item,
              docs: item.docs.map((entry) => (entry.id === docId
                ? { ...entry, text: data.text, chars: data.text.length, note: "Text extracted with OCR — searchable and quotable." }
                : entry)),
            }
          : item)),
      }));
      embedDocInBackground({ ...doc, text: data.text, kind: "text" }, projectId);
      showToast("Text extracted — this image is now searchable.");
    } catch (err) {
      showToast(friendlyError(err, "OCR failed"));
    }
  }

  async function addMaterials(files, projectId) {
    const project = state.projects.find((item) => item.id === projectId);
    if (!files.length || !project) return;

    setExtracting(true);
    setError("");
    try {
      const docs = [];
      for (const file of files) {
        const extracted = await extractStudyMaterial(file);
        if (extracted.kind !== "image" && extracted.text.trim().length < 10) {
          throw new Error(`${file.name} has almost no readable text. Scanned PDFs need OCR later.`);
        }
        docs.push({
          id: uid(),
          name: file.name,
          kind: extracted.kind,
          pages: extracted.pages,
          chars: extracted.chars,
          text: extracted.text.slice(0, 40_000),
          previewUrl: extracted.previewUrl,
          note: extracted.note,
          addedAt: Date.now(),
        });
      }

      updateState((current) => ({
        ...current,
        projects: current.projects.map((project) => (
          project.id === projectId ? { ...project, docs: [...project.docs, ...docs] } : project
        )),
      }));
      setSelectedDocId(docs[0]?.id || null);
      docs.forEach((doc) => embedDocInBackground(doc, projectId));
      showToast(`${docs.length} material${docs.length === 1 ? "" : "s"} added`);
    } catch (err) {
      setError(err.message || "Failed to read this material.");
    } finally {
      setExtracting(false);
    }
  }

  async function ensureProjectForChat(files) {
    if (activeChat.projectId) return activeChat.projectId;

    const name = state.profile.subject?.trim() || "Study materials";
    const existing = state.projects.find((project) => project.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      moveChatToProject(activeChat.id, existing.id);
      return existing.id;
    }

    const projectId = uid();
    const domainId = classifySubject(name, state.profile.goal);
    updateState((current) => ({
      ...current,
      projects: [
        ...current.projects,
        {
          id: projectId,
          name,
          domainId,
          color: domainId === "general" ? PROJECT_COLORS[current.projects.length % PROJECT_COLORS.length] : getDomain(domainId).accent,
          docs: [],
          mastery: makeMastery(),
        },
      ],
      chats: current.chats.map((chat) => chat.id === activeChat.id ? { ...chat, projectId } : chat),
    }));
    setExpanded((current) => ({ ...current, [projectId]: true }));
    showToast(files?.length ? `Created "${name}" for attached material` : `Created "${name}"`);
    return projectId;
  }

  async function processChatAttachments(files) {
    const accepted = Array.from(files || []);
    if (!accepted.length) return;

    setAttachmentBusy(true);
    setError("");
    try {
      const projectId = await ensureProjectForChat(accepted);
      const docs = [];
      for (const file of accepted) {
        const extracted = await extractStudyMaterial(file);
        if (extracted.kind !== "image" && extracted.text.trim().length < 10) {
          throw new Error(`${file.name} has almost no readable text. Scanned PDFs need OCR later.`);
        }
        docs.push({
          id: uid(),
          name: file.name,
          kind: extracted.kind,
          pages: extracted.pages,
          chars: extracted.chars,
          text: extracted.text.slice(0, 40_000),
          previewUrl: extracted.previewUrl,
          note: extracted.note,
          addedAt: Date.now(),
        });
      }

      updateState((current) => ({
        ...current,
        profile: updateProfileFromAttachments(current.profile, docs),
        projects: current.projects.map((project) => (
          project.id === projectId ? { ...project, docs: [...project.docs, ...docs] } : project
        )),
        chats: current.chats.map((chat) => chat.id === activeChat.id ? { ...chat, projectId } : chat),
      }));
      setPendingFiles((current) => [...current, ...docs.map((doc) => ({ id: doc.id, name: doc.name, kind: doc.kind, chars: doc.chars, previewUrl: doc.kind === "image" ? doc.previewUrl : null }))]);
      docs.forEach((doc) => embedDocInBackground(doc, projectId));
      showToast(`${docs.length} file${docs.length === 1 ? "" : "s"} attached`);
    } catch (err) {
      setError(err.message || "Failed to attach file.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  function moveChatToProject(chatId, projectId) {
    updateState((current) => ({
      ...current,
      chats: current.chats.map((chat) => chat.id === chatId ? { ...chat, projectId } : chat),
    }));
    setExpanded((current) => ({ ...current, [projectId]: true }));
    showToast("Chat moved to project");
  }

  function removeDoc(projectId, docId) {
    updateState((current) => ({
      ...current,
      tombstones: withTombstones(current, [{ table: "documents", id: docId, parentId: projectId }]),
      projects: current.projects.map((project) => (
        project.id === projectId ? { ...project, docs: project.docs.filter((doc) => doc.id !== docId) } : project
      )),
    }));
    removeDocChunks(docId);
    setSelectedDocId(null);
    showToast("Document removed");
  }

  function setMessageFeedback(messageId, feedback) {
    updateState((current) => ({
      ...current,
      chats: current.chats.map((chat) => chat.id === activeChat.id
        ? {
            ...chat,
            messages: chat.messages.map((message) => (
              message.id === messageId ? { ...message, feedback } : message
            )),
          }
        : chat),
    }));
  }

  function handleFeedback(message, type) {
    setMessageFeedback(message.id, type);
    updateState((current) => ({
      ...current,
      profile: applyFeedback(current.profile, type),
      projects: current.projects.map((project) => (
        project.id === activeChat.projectId
          ? { ...project, mastery: updateMasteryFromFeedback(project.mastery, type, message.content, domainForProject(project).conceptHints) }
          : project
      )),
    }));

    const followups = {
      confused: ["I'm confused. Re-explain the same idea from scratch using a completely different analogy, simpler steps, and one tiny check question.", "visual"],
      alternate: ["Explain the same idea differently, using a visual analogy or mental model.", "visual"],
      quiz: ["Quiz me on the idea we just discussed. Ask one question at a time.", "quiz"],
      tooVague: ["That was too vague. Make it concrete with exact steps and one example.", "explain"],
      tooAdvanced: ["That was too advanced. Re-explain from the basics and define every important term.", "explain"],
      tooLong: ["Make that much shorter. Give me only the essential idea and one check question.", "auto"],
      moreTechnical: ["Now explain it more technically and precisely.", "codeReview"],
      moreVisual: ["Now explain it visually with a mental model or analogy.", "visual"],
      teachBack: ["I want to teach this back. Ask me to explain it, then diagnose what I miss.", "duck"],
    };

    if (followups[type]) {
      const [prompt, mode] = followups[type];
      sendMessage(prompt, { mode });
    } else {
      showToast("Learning profile updated");
    }
  }

  async function streamRequest(messages, modeId, onChunk, profileOverride = state.profile, projectOverride = null, imageAttachments = []) {
    const project = projectOverride || state.projects.find((item) => item.id === activeChat.projectId);
    const recipe = buildTeachingRecipe(profileOverride, project, modeId);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: await aiRequestHeaders(),
      body: JSON.stringify({
        system: buildSystemPrompt(project, profileOverride, modeId, recipe),
        messages,
        imageDataUrls: imageAttachments.map((f) => ({ dataUrl: f.previewUrl, name: f.name })),
        // big libraries: server retrieves + cites only the relevant excerpts
        retrieval: project && shouldUseRetrieval(project) ? { projectId: project.id } : undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 402) {
        setAiGate({ code: data.code || (response.status === 401 ? "auth_required" : "quota_exhausted"), details: data });
      }
      throw new Error(data.error || "The AI request failed.");
    }
    refreshUsage();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let rafId = null;

    const scheduleFlush = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        onChunk(content);
      });
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const event = JSON.parse(raw);
          if (event.error) throw new Error(event.error);
          if (event.chunk) {
            content += event.chunk;
            scheduleFlush();
          }
        } catch (err) {
          if (err.message) throw err;
        }
      }
    }

    if (rafId !== null) cancelAnimationFrame(rafId);
    onChunk(content);
    return content;
  }

  // Practice generator — turn any topic/concept/note into a targeted quiz,
  // shaped to the subject's domain (worked problems for math, production
  // exercises for languages, vignettes for medicine, ...).
  function generatePractice(topic, opts = {}) {
    const t = String(topic || "").trim();
    if (!t) { showToast("Pick a concept or note to practice."); return; }
    const n = opts.count || 5;
    const project = state.projects.find((item) => item.id === opts.projectId) || activeProject;
    const domain = domainForProject(project);
    const grounding = opts.context ? `\n\nGround the questions in this material:\n${String(opts.context).slice(0, 1500)}` : "";
    setView("chat");
    sendMessage(
      `Create a focused ${n}-question practice set on "${t}". Ask one question at a time, wait for my answer, then give brief feedback before moving on. Shape the questions for ${domain.label}: use ${domain.practice}. Start with question 1 now.${grounding}`,
      { mode: "quiz" },
    );
  }

  // "Explain this" from a brain node — a fresh, grounded explanation of the
  // concept, shaped to the subject's domain.
  function explainConcept(topic, opts = {}) {
    const t = String(topic || "").trim();
    if (!t) return;
    const project = state.projects.find((item) => item.id === opts.projectId) || activeProject;
    const domain = domainForProject(project);
    const grounding = opts.context ? `\n\nPeer's note on why this matters to me: ${String(opts.context).slice(0, 500)}` : "";
    setView("chat");
    sendMessage(
      `Explain "${t}" to me from the ground up${project ? ` in the context of ${project.name}` : ""}. ${domain.teach} End with one small check question.${grounding}`,
      { mode: "explain" },
    );
  }

  // Save a Code-lab snippet into a project: it becomes a "code" cell in the brain
  // AND grows concept mastery from the code, so the brain learns from what you write.
  function saveCodeToBrain({ language, code, title, projectId }) {
    const trimmed = String(code || "").trim();
    if (!trimmed) { showToast("Write some code first."); return; }
    let saved = false;
    updateState((current) => {
      const projects = current.projects;
      if (!projects.length) { showToast("Create a subject first."); return current; }
      const targetId = projectId && projects.some((p) => p.id === projectId) ? projectId : projects[0].id;
      const doc = {
        id: uid(),
        name: (title && title.trim()) || `${language} snippet`,
        kind: "code",
        language,
        content: trimmed.slice(0, 8000),
        chars: trimmed.length,
        createdAt: Date.now(),
      };
      saved = true;
      return {
        ...current,
        projects: projects.map((p) =>
          p.id === targetId
            ? { ...p, docs: [...(p.docs || []), doc], mastery: updateMasteryFromMessage(p.mastery, trimmed, domainForProject(p).conceptHints) }
            : p,
        ),
      };
    });
    if (saved) showToast("Saved to your brain — open Brain to see the code cell.");
  }

  async function sendMessage(forcedPrompt, options = {}) {
    const content = (forcedPrompt ?? input).trim();
    if ((!content && !pendingFiles.length) || loading || attachmentBusy || !activeChat) return;

    const modeId = options.mode || state.activeMode;
    const attachmentContext = pendingFiles.length
      ? `\n\nAttached study material in this chat: ${pendingFiles.map((file) => `${file.name} (${file.kind})`).join(", ")}. Use the project library context when relevant.`
      : "";
    const visibleContent = content || `I attached ${pendingFiles.length} study material${pendingFiles.length === 1 ? "" : "s"}. Help me understand it.`;
    const learnedProfile = recordStudyActivity(inferProfileFromMessage(state.profile, visibleContent));
    const currentProject = state.projects.find((item) => item.id === activeChat.projectId);
    const learnedProject = currentProject
      ? { ...currentProject, mastery: updateMasteryFromMessage(currentProject.mastery, visibleContent, domainForProject(currentProject).conceptHints) }
      : null;
    const userMessage = {
      id: uid(),
      role: "user",
      content: `${visibleContent}${attachmentContext}`,
      displayContent: visibleContent,
      attachments: pendingFiles,
      createdAt: Date.now(),
    };
    const nextMessages = [...activeChat.messages, userMessage];
    const autoName = activeChat.name === "New chat" ? `${visibleContent.slice(0, 38)}${visibleContent.length > 38 ? "..." : ""}` : activeChat.name;

    setInput("");
    setPendingFiles([]);
    setError("");
    setLoading(true);
    // fresh voice turn: cut off any answer still being spoken (barge-in)
    stopSpeaking();
    spokenOffsetRef.current = 0;
    updateState((current) => ({
      ...current,
      activeMode: modeId,
      profile: learnedProfile,
      projects: current.projects.map((project) => (
        learnedProject && project.id === learnedProject.id ? learnedProject : project
      )),
      chats: current.chats.map((chat) => (
        chat.id === activeChat.id ? { ...chat, name: autoName, messages: nextMessages } : chat
      )),
    }));

    const currentChatId = activeChat.id;
    const placeholderMsgId = uid();
    const imageAttachments = options.imageAttachments || pendingFiles.filter((f) => f.kind === "image" && f.previewUrl);
    let firstChunk = true;

    try {
      const finalContent = await streamRequest(
        nextMessages,
        modeId,
        (partial) => {
          if (firstChunk) {
            firstChunk = false;
            setLoading(false);
            updateState((current) => ({
              ...current,
              chats: current.chats.map((chat) =>
                chat.id === currentChatId
                  ? { ...chat, messages: [...nextMessages, { id: placeholderMsgId, role: "assistant", content: partial, streaming: true, createdAt: Date.now() }] }
                  : chat
              ),
            }));
          } else {
            updateState((current) => ({
              ...current,
              chats: current.chats.map((chat) =>
                chat.id === currentChatId
                  ? { ...chat, messages: chat.messages.map((msg) => msg.id === placeholderMsgId ? { ...msg, content: partial } : msg) }
                  : chat
              ),
            }));
          }
          speakStreamingChunk(partial);
        },
        learnedProfile,
        learnedProject,
        imageAttachments,
      );
      if (!firstChunk) {
        updateState((current) => ({
          ...current,
          chats: current.chats.map((chat) =>
            chat.id === currentChatId
              ? { ...chat, messages: chat.messages.map((msg) => msg.id === placeholderMsgId ? { ...msg, streaming: false } : msg) }
              : chat
          ),
        }));
        finishStreamingSpeech(finalContent);
      }
    } catch (err) {
      const message = friendlyError(err);
      setError(message);
      updateState((current) => ({
        ...current,
        chats: current.chats.map((chat) =>
          chat.id === currentChatId
            ? {
                ...chat,
                messages: firstChunk
                  ? [...nextMessages, { id: uid(), role: "assistant", content: `I could not reach the AI yet: ${message}`, createdAt: Date.now() }]
                  : chat.messages.map((msg) => msg.id === placeholderMsgId ? { ...msg, content: `I could not reach the AI: ${message}` } : msg),
              }
            : chat
        ),
      }));
    } finally {
      setLoading(false);
    }
  }

  async function regenerateFrom(messageIndex) {
    if (loading || !activeChat) return;
    const previousMessages = activeChat.messages.slice(0, messageIndex);
    if (!previousMessages.some((message) => message.role === "user")) return;

    setLoading(true);
    setError("");
    updateState((current) => ({
      ...current,
      chats: current.chats.map((chat) => chat.id === activeChat.id ? { ...chat, messages: previousMessages } : chat),
    }));

    const currentChatId = activeChat.id;
    const placeholderMsgId = uid();
    let firstChunk = true;

    try {
      await streamRequest(
        previousMessages,
        state.activeMode,
        (partial) => {
          if (firstChunk) {
            firstChunk = false;
            setLoading(false);
            updateState((current) => ({
              ...current,
              chats: current.chats.map((chat) =>
                chat.id === currentChatId
                  ? { ...chat, messages: [...previousMessages, { id: placeholderMsgId, role: "assistant", content: partial, streaming: true, createdAt: Date.now() }] }
                  : chat
              ),
            }));
          } else {
            updateState((current) => ({
              ...current,
              chats: current.chats.map((chat) =>
                chat.id === currentChatId
                  ? { ...chat, messages: chat.messages.map((msg) => msg.id === placeholderMsgId ? { ...msg, content: partial } : msg) }
                  : chat
              ),
            }));
          }
        },
      );
      if (!firstChunk) {
        updateState((current) => ({
          ...current,
          chats: current.chats.map((chat) =>
            chat.id === currentChatId
              ? { ...chat, messages: chat.messages.map((msg) => msg.id === placeholderMsgId ? { ...msg, streaming: false } : msg) }
              : chat
          ),
        }));
      }
      showToast("Answer regenerated");
    } catch (err) {
      setError(friendlyError(err, "Could not regenerate answer."));
    } finally {
      setLoading(false);
    }
  }

  function startTeachBack() {
    updateState((current) => ({ ...current, profile: applyFeedback(current.profile, "teachBack"), activeMode: "duck" }));
    sendMessage("I want to teach this back. Ask me to explain the concept, then check my explanation for missing pieces or misconceptions.", { mode: "duck" });
  }

  function reflectSession() {
    const projectId = activeChat?.projectId;
    updateState((current) => ({
      ...current,
      profile: applyReflection(current.profile, "Learner asked Peer to summarize the session and choose next practice."),
      projects: current.projects.map((project) => (
        project.id === projectId
          ? { ...project, mastery: addReflection(project.mastery, `Reflection requested from chat "${activeChat.name}".`) }
          : project
      )),
    }));
    sendMessage("Create a session reflection: what I learned, what I struggled with, likely misconceptions, and what I should practice next. Be concise.", { mode: "exam" });
  }

  function saveNote(message) {
    const note = {
      id: uid(),
      chatId: activeChat.id,
      projectId: activeChat.projectId,
      title: activeChat.name || "Study note",
      category: activeProject?.name || "General",
      source: "AI answer",
      tags: inferNoteTags(message.content),
      content: message.content,
      createdAt: Date.now(),
      shared: false,
    };
    updateState((current) => ({
      ...current,
      notes: [note, ...current.notes],
      profile: {
        ...current.profile,
        signals: { ...current.profile.signals, notes: (current.profile.signals.notes || 0) + 1 },
      },
      chats: current.chats.map((chat) => chat.id === activeChat.id
        ? {
            ...chat,
            messages: chat.messages.map((item) => item.id === message.id ? { ...item, savedNoteId: note.id } : item),
          }
        : chat),
    }));
    showToast("Saved to notes");
  }

  function deleteNote(noteId) {
    updateState((current) => ({
      ...current,
      tombstones: withTombstones(current, [{ table: "notes", id: noteId }]),
      notes: current.notes.filter((note) => note.id !== noteId),
    }));
  }

  function toggleVoiceMode() {
    setVoiceMode((current) => {
      const next = !current;
      voiceModeRef.current = next;
      if (!next) stopSpeaking();
      return next;
    });
  }

  function changeExplanationDepth(depth) {
    updateState((current) => ({ ...current, profile: setExplanationDepth(current.profile, depth) }));
    showToast(`Depth set to ${DEPTH_OPTIONS.find((item) => item.id === depth)?.label || "Normal"}`);
  }

  function cleanForSpeech(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, " (code block) ")
      .replace(/\$\$[\s\S]*?\$\$/g, " (equation) ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*\n]+)\*/g, "$1")
      .replace(/#{1,3} /g, "")
      .replace(/^[-*] /gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
  }

  // Low-latency voice: Peer speaks sentence-by-sentence WHILE the answer
  // streams, instead of waiting for the full response. A queue counter tracks
  // pending utterances so the hands-free listen loop resumes only after the
  // last one finishes.
  function queueUtterance(text) {
    const clean = cleanForSpeech(text);
    if (!clean || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.04;
    utterance.pitch = 1;
    speechQueueRef.current += 1;
    const settle = () => {
      speechQueueRef.current = Math.max(0, speechQueueRef.current - 1);
      if (speechQueueRef.current === 0) {
        setSpeaking(false);
        maybeListenAfterSpeak();
      }
    };
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = settle;
    utterance.onerror = settle;
    const langCode = SPEECH_LANG_MAP[state.profile.language] || "";
    if (langCode) {
      const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang.toLowerCase().startsWith(langCode.slice(0, 2)));
      if (match) utterance.voice = match;
      utterance.lang = langCode;
    }
    window.speechSynthesis.speak(utterance);
  }

  // Extract the next complete sentence(s) from a streaming answer — never
  // starts speaking from inside an unclosed code fence or display equation.
  function speakStreamingChunk(content) {
    if (!voiceModeRef.current || !window.speechSynthesis) return;
    const fenceCount = (content.match(/```/g) || []).length;
    const mathCount = (content.match(/\$\$/g) || []).length;
    let safeEnd = content.length;
    if (fenceCount % 2 === 1) safeEnd = Math.min(safeEnd, content.lastIndexOf("```"));
    if (mathCount % 2 === 1) safeEnd = Math.min(safeEnd, content.lastIndexOf("$$"));
    const region = content.slice(spokenOffsetRef.current, safeEnd);
    const match = region.match(/^[\s\S]*[.!?\n](?=\s|$)/);
    if (!match || cleanForSpeech(match[0]).length < 2) return;
    spokenOffsetRef.current += match[0].length;
    queueUtterance(match[0]);
  }

  function finishStreamingSpeech(finalContent) {
    if (!voiceModeRef.current || !window.speechSynthesis) return;
    const rest = finalContent.slice(spokenOffsetRef.current);
    spokenOffsetRef.current = finalContent.length;
    if (cleanForSpeech(rest)) queueUtterance(rest);
    else if (speechQueueRef.current === 0) maybeListenAfterSpeak();
  }

  function stopSpeaking() {
    speechQueueRef.current = 0;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  // Hands-free loop: after Peer finishes speaking, start listening again so the
  // learner can just keep talking. Only while voice mode is on and idle.
  function maybeListenAfterSpeak() {
    if (!voiceModeRef.current || listeningRef.current || loadingRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    window.setTimeout(() => {
      if (voiceModeRef.current && !listeningRef.current && !loadingRef.current) startListening();
    }, 350);
  }

  function startListening() {
    const SpeechRec = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRec) {
      showToast("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (listeningRef.current) return;
    if (speaking) stopSpeaking();

    let rec;
    try {
      rec = new SpeechRec();
    } catch {
      return;
    }
    rec.lang = SPEECH_LANG_MAP[state.profile.language] || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalText = "";
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setInput((finalText + interim).replace(/\s+/g, " ").trimStart());
    };
    rec.onerror = (event) => {
      listeningRef.current = false;
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        showToast("Microphone access is blocked. Allow it in your browser's site settings.");
      }
    };
    rec.onend = () => {
      listeningRef.current = false;
      setListening(false);
      const text = finalText.trim();
      if (text) {
        setInput("");
        sendMessage(text);
      }
    };

    recognitionRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    try {
      rec.start();
    } catch {
      listeningRef.current = false;
      setListening(false);
    }
  }

  function stopListening() {
    listeningRef.current = false;
    setListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }

  async function generateImage(message) {
    if (loading) return;
    setLoading(true);
    showToast("Generating image...");
    const topic = message.content.replace(/\n/g, " ").slice(0, 220);
    const prompt = `Clean educational diagram or visual concept art for: "${topic}". Minimalist, modern dark-background illustration, labeled, professional.`;
    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: await aiRequestHeaders(),
        body: JSON.stringify({ prompt, topic }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 402) {
          setAiGate({ code: data.code || (response.status === 401 ? "auth_required" : "quota_exhausted"), details: data });
        }
        throw new Error(data.error || "Image generation failed.");
      }
      refreshUsage();

      const altText = data.altText || topic;
      const imgMsg = {
        id: uid(),
        role: "assistant",
        content: `Here's a visual representation of "${topic}": ${altText}`,
        imageUrl: data.url,
        imageAlt: altText,
        createdAt: Date.now(),
      };
      const projectId = activeChat.projectId;
      updateState((current) => ({
        ...current,
        chats: current.chats.map((chat) =>
          chat.id === activeChat.id ? { ...chat, messages: [...chat.messages, imgMsg] } : chat
        ),
        // saved with the lesson: the visual becomes a file the Brain can show
        projects: projectId
          ? current.projects.map((project) => (project.id === projectId
              ? {
                  ...project,
                  docs: [...(project.docs || []), {
                    id: imgMsg.id,
                    name: `Visual: ${topic.slice(0, 60)}`,
                    kind: "image",
                    pages: 0,
                    chars: 0,
                    text: `[Generated image] ${altText}`,
                    previewUrl: data.url,
                    note: altText,
                    addedAt: Date.now(),
                  }],
                }
              : project))
          : current.projects,
      }));
      showToast("Image ready");
    } catch (err) {
      showToast(friendlyError(err, "Image generation failed"));
    } finally {
      setLoading(false);
    }
  }

  function requestVisualBlueprint(message, kind) {
    const prompts = {
      diagram: "Turn the last explanation into a clean labeled ASCII diagram. Keep it compact, then explain how to read it in 3 bullets.",
      flowchart: "Turn the last explanation into a step-by-step flowchart using markdown arrows and short labels. End with one check question.",
      timeline: "Turn the last explanation into a timeline. Show the order of events and the key cause-effect links.",
      mindmap: "Turn the last explanation into a memory map with a central idea, branches, and tiny recall cues.",
    };
    updateState((current) => ({ ...current, profile: applyFeedback(current.profile, "visualBlueprint") }));
    sendMessage(`${prompts[kind] || prompts.diagram}\n\nUse this as the source idea:\n${message.content.slice(0, 1800)}`, { mode: "visual" });
  }

  function deleteFlashcardDeck(id) {
    updateState((current) => {
      const dying = current.flashcards.find((deck) => deck.id === id);
      return {
        ...current,
        tombstones: withTombstones(current, [
          { table: "decks", id },
          ...(dying?.cards || []).map((card) => ({ table: "cards", id: card.id, parentId: id })),
        ]),
        flashcards: current.flashcards.filter((deck) => deck.id !== id),
      };
    });
    showToast("Flashcard deck deleted");
  }

  // Spaced repetition — grade a card ("again" | "good") and reschedule it.
  function gradeFlashcard(deckId, cardIndex, grade) {
    updateState((current) => ({
      ...current,
      flashcards: current.flashcards.map((deck) =>
        deck.id !== deckId ? deck : {
          ...deck,
          cards: deck.cards.map((card, i) => (i === cardIndex ? gradeCard(card, grade) : card)),
        }
      ),
    }));
  }

  async function makeFlashcards(message) {
    if (loading) return;
    setLoading(true);
    showToast("Generating flashcards...");
    try {
      const prompt = buildFlashcardPrompt("this explanation", message.content, domainForProject(activeProject));
      let fullText = "";
      await streamRequest(
        [{ role: "user", content: prompt }],
        "auto",
        (partial) => { fullText = partial; },
        state.profile,
        null,
      );
      const cards = parseFlashcards(fullText);
      if (!cards.length) {
        showToast("Could not parse flashcards - try again");
        return;
      }
      const deck = {
        id: uid(),
        chatId: activeChat.id,
        projectId: activeChat.projectId,
        chatName: activeChat.name,
        createdAt: Date.now(),
        cards,
      };
      updateState((current) => ({ ...current, flashcards: [deck, ...current.flashcards] }));
      setView("flashcards");
      showToast(`${cards.length} flashcards ready`);
    } catch (err) {
      showToast("Flashcard generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function makeFlashcardsFromSource(title, content, projectId = activeChat?.projectId) {
    if (loading) return;
    setLoading(true);
    showToast("Generating file flashcards...");
    try {
      let fullText = "";
      const project = state.projects.find((item) => item.id === projectId) || activeProject;
      await streamRequest(
        [{ role: "user", content: buildFlashcardPrompt(title, content, domainForProject(project)) }],
        "auto",
        (partial) => { fullText = partial; },
        state.profile,
        project,
      );
      const cards = parseFlashcards(fullText);
      if (!cards.length) {
        showToast("Could not parse flashcards - try again");
        return;
      }
      const deck = {
        id: uid(),
        chatId: activeChat?.id || null,
        projectId,
        chatName: `${title} flashcards`,
        createdAt: Date.now(),
        cards,
      };
      updateState((current) => ({ ...current, flashcards: [deck, ...current.flashcards] }));
      setView("flashcards");
      showToast(`${cards.length} file flashcards ready`);
    } catch (err) {
      showToast(friendlyError(err, "File flashcard generation failed"));
    } finally {
      setLoading(false);
    }
  }

  function runDocAction(doc, action, selectedText = "") {
    if (!doc) return;
    const excerpt = selectedText.trim() || doc.text.slice(0, 4500);
    const isImage = doc.kind === "image" && doc.previewUrl;
    const prompts = {
      ask: `Use the document "${doc.name}" as context. Help me understand the most important ideas in it.`,
      summary: `Summarize "${doc.name}" for study. Give: 1) core idea, 2) key terms, 3) what to memorize, 4) what to practice.\n\nDocument excerpt:\n${excerpt}`,
      quiz: `Create an interactive quiz from "${doc.name}". Ask exactly one question at a time and wait for my answer.\n\nDocument excerpt:\n${excerpt}`,
      diagram: `Create a text-native visual diagram from "${doc.name}". Use a compact labeled ASCII diagram, flowchart, or memory map, then explain how to read it.\n\nDocument excerpt:\n${excerpt}`,
      exam: `Create a practice exam from "${doc.name}" with 6 questions, answer key, common traps, and a short scoring rubric.\n\nDocument excerpt:\n${excerpt}`,
      codeTutor: `Act as my code tutor for "${doc.name}". Explain what the code does, likely bugs, security risks, edge cases, and the learning concepts I should understand. Be precise but teach me, not just review.\n\nCode:\n${excerpt}`,
      vision: `Explain this image or page from "${doc.name}". Describe what is visible, infer the study topic carefully, then teach the concept with one visual mental model.`,
      highlight: `Explain this selected part from "${doc.name}" in context. First explain the excerpt, then connect it to the larger document.\n\nSelected excerpt:\n${excerpt}`,
    };

    if (action === "flashcards") {
      setManagedProjectId(null);
      makeFlashcardsFromSource(doc.name, excerpt, managedProjectId || activeChat?.projectId);
      return;
    }

    setManagedProjectId(null);
    setView("chat");
    sendMessage(prompts[action] || prompts.ask, {
      mode: action === "quiz" ? "quiz" : action === "exam" ? "exam" : action === "codeTutor" ? "codeReview" : action === "diagram" || action === "vision" ? "visual" : "explain",
      imageAttachments: isImage && action === "vision" ? [{ ...doc, previewUrl: doc.previewUrl }] : [],
    });
  }

  function completeOnboarding() {
    updateState((current) => ({
      ...current,
      onboardingComplete: true,
      profile: {
        ...current.profile,
        subject: profileDraft.subject.trim(),
        goal: profileDraft.goal.trim(),
        language: profileDraft.language,
        level: profileDraft.level,
        learningPreference: profileDraft.learningPreference,
        preferences: seedPreferencesFromOnboarding(current.profile.preferences, profileDraft.learningPreference),
        observations: profileDraft.goal.trim()
          ? [
              { id: uid(), text: `Primary goal: ${profileDraft.goal.trim()}`, createdAt: Date.now() },
              { id: uid(), text: `Starting level: ${profileDraft.level}`, createdAt: Date.now() },
              { id: uid(), text: `Preferred starting style: ${profileDraft.learningPreference}`, createdAt: Date.now() },
              ...current.profile.observations,
            ].slice(0, 6)
          : current.profile.observations,
      },
    }));
    if (profileDraft.subject.trim() && state.projects.length === 1 && state.projects[0].name === "My first topic") {
      const subjectName = profileDraft.subject.trim();
      const domainId = classifySubject(subjectName, profileDraft.goal);
      updateState((current) => ({
        ...current,
        projects: current.projects.map((project, index) => index === 0
          ? {
              ...project,
              name: subjectName,
              domainId,
              color: domainId === "general" ? project.color : getDomain(domainId).accent,
            }
          : project),
      }));
    }
  }

  function resetData() {
    const next = defaultState();
    setState({
      ...next,
      theme: state.theme,
      fontId: state.fontId,
      textSize: state.textSize,
      landingComplete: state.landingComplete,
      onboardingComplete: state.onboardingComplete,
      account: state.account,
    });
  }

  function loadSampleData() {
    updateState((current) => {
      if (current.projects.some((p) => p.demo)) {
        showToast("Sample data is already loaded.");
        return current;
      }
      const now = Date.now();
      const day = 86_400_000;
      const concept = (label, confidence, status, evidence, ago = 1) => ({
        id: uid(), key: label.toLowerCase(), label, confidence, status, evidence,
        createdAt: now - ago * day, updatedAt: now - ago * day,
      });
      const neuroId = uid();
      const linAlgId = uid();
      const neuro = {
        id: neuroId, name: "Neuroscience (demo)", color: PROJECT_COLORS[0], demo: true, docs: [],
        mastery: {
          concepts: [
            concept("Synaptic Plasticity", 0.32, "weak", "You mixed up LTP and LTD across two chats."),
            concept("Action Potential", 0.74, "strong", "Explained the depolarization phases back correctly."),
            concept("NMDA Receptor", 0.58, "learning", "Came up while discussing calcium timing."),
            concept("Neurotransmitters", 0.61, "learning", "Referenced in several explanations."),
            concept("Hippocampus", 0.28, "weak", "A confused follow-up flagged this."),
          ],
          misconceptions: [{ id: uid(), concept: "Synaptic Plasticity", belief: "LTP and LTD are unrelated.", correction: "They're two directions of the same calcium-dependent dial.", createdAt: now - 2 * day }],
          reflections: [], updatedAt: now - day,
        },
      };
      const linAlg = {
        id: linAlgId, name: "Linear Algebra (demo)", color: PROJECT_COLORS[1], demo: true, docs: [],
        mastery: {
          concepts: [
            concept("Eigenvectors", 0.66, "strong", "Got the 'directions that don't turn' intuition."),
            concept("Determinants", 0.38, "weak", "Unsure why they measure volume scaling."),
            concept("Vector Spaces", 0.55, "learning", "Foundational, revisited a few times."),
            concept("Diagonalization", 0.22, "weak", "Stuck on the change-of-basis step."),
          ],
          misconceptions: [], reflections: [], updatedAt: now - 2 * day,
        },
      };
      const sampleNotes = [
        { id: uid(), projectId: neuroId, title: "Synaptic Plasticity", tags: ["ltp", "ltd", "calcium"], category: null, createdAt: now - 2 * 3_600_000, content: "LTP and LTD are the brain's volume knobs. Direction depends on the calcium pattern entering the postsynaptic cell.\n\nFast, large influx -> kinases -> AMPA receptors inserted -> LTP. Slow, small influx -> phosphatases -> AMPA removed -> LTD.\n\nMnemonic: \"high and fast, build it to last; low and slow, let it go.\"" },
        { id: uid(), projectId: neuroId, title: "The NMDA coincidence detector", tags: ["nmda"], category: null, createdAt: now - day, content: "The NMDA receptor only opens when glutamate is bound AND the cell is already depolarized enough to eject the Mg2+ block. That's why it detects coincident activity." },
        { id: uid(), projectId: linAlgId, title: "Eigenvectors — the directions that don't turn", tags: ["eigen"], category: null, createdAt: now - 2 * day, content: "An eigenvector is a direction the transformation only stretches or squishes — it never rotates off its own line. The eigenvalue is the stretch factor; negative flips along the same line." },
        { id: uid(), projectId: linAlgId, title: "Why determinants matter", tags: ["determinants"], category: null, createdAt: now - 3 * day, content: "The determinant is the factor by which a transformation scales volume. Determinant 0 means the transform collapses space into a lower dimension." },
      ];
      const sampleDecks = [
        { id: uid(), projectId: neuroId, chatName: "Synaptic Transmission", createdAt: now - day, cards: [
          { id: uid(), question: "What does LTP stand for, and what does it do?", answer: "Long-Term Potentiation — it strengthens a synapse after coincident, high-frequency activity." },
          { id: uid(), question: "Which receptor is the coincidence detector for LTP?", answer: "The NMDA receptor — it passes calcium only when depolarized AND glutamate is bound." },
          { id: uid(), question: "What ion is the key second messenger in both LTP and LTD?", answer: "Calcium. A large fast influx drives LTP; a small slow rise drives LTD." },
        ] },
        { id: uid(), projectId: linAlgId, chatName: "Eigen-everything", createdAt: now - 2 * day, cards: [
          { id: uid(), question: "What is an eigenvector, intuitively?", answer: "A direction a transformation only stretches/squishes, never rotates off its line." },
          { id: uid(), question: "What does the determinant measure?", answer: "The factor by which the transformation scales volume." },
        ] },
      ];
      const sampleChats = [
        { id: uid(), name: "LTP vs LTD", projectId: neuroId, createdAt: now - 2 * 3_600_000, messages: [
          { id: uid(), role: "user", content: "Can you explain synaptic plasticity? I keep mixing up LTP and LTD.", createdAt: now - 2 * 3_600_000 },
          { id: uid(), role: "assistant", content: "They're two sides of the same dial. LTP strengthens a synapse when it fires in sync with its target; LTD turns weak, mistimed connections down.", createdAt: now - 2 * 3_600_000 + 1000 },
        ] },
        { id: uid(), name: "Eigenvectors intuition", projectId: linAlgId, createdAt: now - 2 * day, messages: [
          { id: uid(), role: "user", content: "What's the intuition behind eigenvectors?", createdAt: now - 2 * day },
          { id: uid(), role: "assistant", content: "They're the directions a transformation doesn't turn — it only stretches them along their own line.", createdAt: now - 2 * day + 1000 },
        ] },
      ];
      showToast("Loaded 2 demo subjects with concepts, notes & decks.");
      return {
        ...current,
        projects: [...current.projects, neuro, linAlg],
        notes: [...sampleNotes, ...current.notes],
        flashcards: [...sampleDecks, ...current.flashcards],
        chats: [...current.chats, ...sampleChats],
      };
    });
  }

  function continueAsGuest() {
    updateState((current) => ({
      ...current,
      landingComplete: true,
      account: {
        id: uid(),
        name: "Guest learner",
        email: "",
        provider: "email",
        verified: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
    }));
  }

  function toggleShareNote(noteId) {
    updateState((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === noteId ? { ...note, shared: !note.shared } : note),
    }));
  }

  function toggleShareDeck(deckId) {
    updateState((current) => ({
      ...current,
      flashcards: current.flashcards.map((deck) => deck.id === deckId ? { ...deck, shared: !deck.shared } : deck),
    }));
  }

  function startCommunityChallenge(challenge) {
    setView("chat");
    sendMessage(challenge.prompt, { mode: "challenge" });
  }

  const commands = [
    { label: "New chat", hint: "Start a clean study thread", icon: Plus, run: () => createChat(activeProject?.id || null) },
    { label: "Open learning brain", hint: "Graph your concepts, files, notes, and weak spots", icon: Brain, run: () => setView("brain") },
    { label: "Open learning profile", hint: "Inspect adaptive signals", icon: UserRound, run: () => setView("profile") },
    { label: "Open notes", hint: "Review saved explanations", icon: Save, run: () => setView("notes") },
    { label: "Open study rooms", hint: "Local peer-to-peer study prototype", icon: Users, run: () => setView("community") },
    { label: "Open settings", hint: "Theme, fonts, text size", icon: Settings, run: () => setView("settings") },
    { label: "Load sample data", hint: "Add demo subjects, concepts, notes & decks to explore", icon: Sparkles, run: () => loadSampleData() },
    {
      label: "Practice a weak spot",
      hint: "Auto-quiz on the concept Peer thinks you're weakest on",
      icon: Target,
      run: () => {
        const weak = state.projects
          .flatMap((p) => (p.mastery?.concepts || []).map((c) => ({ ...c, project: p.name })))
          .filter((c) => c.status === "weak" || (c.confidence ?? 1) < 0.4)
          .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))[0];
        if (weak) generatePractice(weak.label);
        else generatePractice(activeProject?.name || state.profile.subject || "your subject");
      },
    },
    { label: "Quiz mode", hint: "Ask one question at a time", icon: Target, run: () => updateState((current) => ({ ...current, activeMode: "quiz" })) },
    { label: "Challenge mode", hint: "Turn learning into levels", icon: Trophy, run: () => updateState((current) => ({ ...current, activeMode: "challenge" })) },
    { label: "Upload material", hint: "Open current project library", icon: Paperclip, run: () => activeProject && setManagedProjectId(activeProject.id) },
    { label: "Open peer rooms", hint: "Host or join a live study room", icon: Users, run: () => setView("community") },
    { label: "Teach to a peer", hint: "Peer scores your clarity and gaps", icon: MessageSquare, run: startTeachBack },
    ...state.chats.slice(0, 12).map((chat) => ({
      label: `Switch: ${chat.name}`,
      hint: state.projects.find((project) => project.id === chat.projectId)?.name || "Chat",
      icon: MessageSquare,
      run: () => {
        updateState((current) => ({ ...current, activeId: chat.id }));
        setView("chat");
      },
    })),
    ...state.notes.slice(0, 10).map((note) => ({
      label: `Note: ${note.title}`,
      hint: `${note.category || "General"} - ${note.tags?.join(", ") || "saved explanation"}`,
      icon: Save,
      run: () => setView("notes"),
    })),
  ];

  // Hold the first paint until persisted state has loaded, so returning users
  // don't briefly see the landing screen before their data hydrates.
  if (!hydrated) {
    return (
      <div
        className={appClass}
        style={{ "--app-font": font.family, "--font-display": fontDisplay, "--text-size": `${state.textSize}px` }}
      >
        <div className="boot-splash">
          <PeerLogo size={40} />
          <span>Loading your workspace…</span>
        </div>
      </div>
    );
  }

  if (!state.landingComplete) {
    return (
      <div
        className={appClass}
        style={{
          "--app-font": font.family, "--font-display": fontDisplay,
          "--text-size": `${state.textSize}px`,
        }}
      >
        <LandingAuthFlow continueAsGuest={continueAsGuest} PeerLogo={PeerLogo} />
      </div>
    );
  }

  return (
    <div
      className={`${appClass} peer-skin view-${view}`}
      style={{
        "--app-font": font.family, "--font-display": fontDisplay,
        "--text-size": `${state.textSize}px`,
      }}
    >
      <a className="skip-link" href="#peer-main">Skip to content</a>
      <PeerNavRail
        view={view}
        setView={setView}
        account={state.account}
        onAvatar={() => setView("profile")}
      />
      <div className="bg-canvas" aria-hidden="true">
        <div className="bg-blob bg-blob-1" />
        <div className="bg-blob bg-blob-2" />
        <div className="bg-blob bg-blob-3" />
      </div>
      <input
        ref={fileRef}
        className="hidden-file"
        type="file"
        multiple
        accept=".pdf,.txt,.md,.markdown,.csv,.json,.js,.jsx,.ts,.tsx,.html,.css,.c,.h,.cpp,.hpp,.py,.java,.rs,.go,.sh,image/*"
        onChange={handleMaterialInput}
      />

      {sidebarOpen && isMobile && view === "chat" && (
        <div className="drawer-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      {sidebarOpen && (
        <Sidebar
          drawerRef={drawerRef}
          isDrawer={isMobile}
          closeSidebar={() => setSidebarOpen(false)}
          state={state}
          activeChat={activeChat}
          expanded={expanded}
          setExpanded={setExpanded}
          unfiledChats={unfiledChats}
          chatSearch={chatSearch}
          setChatSearch={setChatSearch}
          createChat={createChat}
          deleteChat={confirmDeleteChat}
          editingChatId={editingChatId}
          editingName={editingName}
          setEditingName={setEditingName}
          startRename={(chat) => {
            setEditingChatId(chat.id);
            setEditingName(chat.name);
          }}
          renameChat={renameChat}
          cancelRename={() => setEditingChatId(null)}
          newProjectName={newProjectName}
          setNewProjectName={setNewProjectName}
          addProject={addProject}
          moveChatToProject={moveChatToProject}
          selectChat={(id) => {
            updateState((current) => ({ ...current, activeId: id }));
            setView("chat");
            if (window.innerWidth < 820) setSidebarOpen(false);
          }}
          manageProject={(id) => {
            setManagedProjectId(id);
            setSelectedDocId(null);
            if (isMobile) setSidebarOpen(false);
          }}
          setView={setView}
          view={view}
        />
      )}

      <main
        id="peer-main"
        className={`main ${composerDragging && view === "chat" ? "chat-dragging" : ""}`}
        onDragOver={(event) => {
          if (view !== "chat" || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
          event.preventDefault();
          setComposerDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setComposerDragging(false);
        }}
        onDrop={(event) => {
          if (view !== "chat") return;
          const files = Array.from(event.dataTransfer.files || []);
          if (!files.length) return;
          event.preventDefault();
          setComposerDragging(false);
          processChatAttachments(files);
        }}
      >
        <header className="topbar">
          <button className="icon-button" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">
            <Menu size={19} />
          </button>
          <ViewTitle view={view} activeChat={activeChat} activeProject={activeProject} />
          <button className="topbar-action" onClick={() => setCommandOpen(true)}>
            <Command size={15} /> Ctrl K
          </button>
          {speaking && (
            <button className="topbar-action speaking-badge" onClick={stopSpeaking}>
              <Volume2 size={15} className="speaking-icon" /> Stop
            </button>
          )}
          <div className="status-pill"><span /> Local app</div>
        </header>

        {view === "settings" && <SettingsPanel state={state} updateState={updateState} resetData={confirmResetData} loadSampleData={loadSampleData} cloudSync={cloudSync} signOut={signOut} confirmDeleteAccount={confirmDeleteAccount} />}
        {view === "profile" && <ProfilePanel profile={state.profile} activeProject={activeProject} activeChat={activeChat} insights={insights} activeMode={activeMode} updateState={updateState} recap={buildLearnerRecap(state)} badgeInfo={computeBadges(state)} showToast={showToast} />}
        {view === "brain" && (
          <React.Suspense fallback={<PanelLoading label="Waking up your brain…" />}>
            <LearningBrainPanel state={state} activeProject={activeProject} setView={setView} updateState={updateState} setManagedProjectId={setManagedProjectId} setSelectedDocId={setSelectedDocId} onPractice={generatePractice} onExplain={explainConcept} />
          </React.Suspense>
        )}
        {view === "code" && (
          <React.Suspense fallback={<PanelLoading label="Opening the code lab…" />}>
            <CodingPanel profile={state.profile} projects={state.projects} onSaveToBrain={saveCodeToBrain} />
          </React.Suspense>
        )}
        {view === "notes" && <NotesPanel notes={state.notes} projects={state.projects} deleteNote={confirmDeleteNote} toggleShareNote={toggleShareNote} onPractice={generatePractice} />}
        {view === "flashcards" && <FlashcardsPanel flashcards={state.flashcards} projects={state.projects} setView={setView} deleteFlashcardDeck={confirmDeleteDeck} gradeFlashcard={gradeFlashcard} />}
        {view === "community" && (
          <React.Suspense fallback={<PanelLoading label="Opening peer rooms…" />}>
            <RoomsPanel
              account={state.account}
              decks={state.flashcards}
              projects={state.projects}
              showToast={showToast}
              onSignIn={() => updateState((current) => ({ ...current, landingComplete: false }))}
              startCommunityChallenge={startCommunityChallenge}
              challenges={COMMUNITY_CHALLENGES}
              onRoomSession={recordRoomSession}
            />
          </React.Suspense>
        )}
        {view === "chat" && (
          <ChatArea
            activeChat={activeChat}
            activeProject={activeProject}
            activeMode={activeMode}
            loading={loading}
            error={error}
            sendMessage={sendMessage}
            bottomRef={bottomRef}
            handleFeedback={handleFeedback}
            saveNote={saveNote}
            regenerateFrom={regenerateFrom}
            startTeachBack={startTeachBack}
            reflectSession={reflectSession}
            makeFlashcards={makeFlashcards}
            generateImage={generateImage}
            requestVisualBlueprint={requestVisualBlueprint}
          />
        )}

        {view === "chat" && (
          <Composer
            input={input}
            setInput={setInput}
            loading={loading}
            sendMessage={sendMessage}
            activeProject={activeProject}
            activeMode={activeMode}
            setActiveMode={(modeId) => updateState((current) => ({ ...current, activeMode: modeId }))}
            pendingFiles={pendingFiles}
            removePendingFile={(id) => setPendingFiles((current) => current.filter((file) => file.id !== id))}
            processChatAttachments={processChatAttachments}
            composerDragging={composerDragging}
            setComposerDragging={setComposerDragging}
            attachmentBusy={attachmentBusy}
            voiceMode={voiceMode}
            toggleVoiceMode={toggleVoiceMode}
            speaking={speaking}
            stopSpeaking={stopSpeaking}
            listening={listening}
            startListening={startListening}
            stopListening={stopListening}
            profileLanguage={state.profile.language}
            explanationDepth={state.profile.explanationDepth}
            setExplanationDepth={changeExplanationDepth}
            usage={usageInfo}
          />
        )}
      </main>

      {managedProject && (
        <ProjectModal
          project={managedProject}
          selectedDoc={selectedDoc}
          selectedDocId={selectedDocId}
          setSelectedDocId={setSelectedDocId}
          extracting={extracting}
          error={error}
          close={() => setManagedProjectId(null)}
          pickFile={() => fileRef.current?.click()}
          addMaterials={(files) => addMaterials(files, managedProject.id)}
          removeDoc={removeDoc}
          deleteProject={confirmDeleteProject}
          runDocAction={runDocAction}
          setProjectDomain={setProjectDomain}
          ocrDoc={ocrDoc}
        />
      )}

      {!state.onboardingComplete && (
        <OnboardingModal
          profileDraft={profileDraft}
          setProfileDraft={setProfileDraft}
          complete={completeOnboarding}
          skip={() => updateState((current) => ({ ...current, onboardingComplete: true }))}
        />
      )}

      {commandOpen && (
        <CommandPalette
          query={commandQuery}
          setQuery={setCommandQuery}
          close={() => setCommandOpen(false)}
          commands={commands}
        />
      )}

      {aiGate && (
        <PaywallModal
          gate={aiGate}
          onClose={() => setAiGate(null)}
          onSignIn={() => {
            setAiGate(null);
            updateState((current) => ({ ...current, landingComplete: false }));
          }}
          onUpgrade={startCheckout}
        />
      )}

      {confirmRequest && (
        <ConfirmDialog
          request={confirmRequest}
          onCancel={() => setConfirmRequest(null)}
          onConfirm={() => {
            confirmRequest.action?.();
            setConfirmRequest(null);
          }}
        />
      )}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast"><CheckCircle2 size={16} aria-hidden="true" />{toast.message}</div>}
      </div>
    </div>
  );
}


// Small icon+label chip for a subject domain (color-blind safe: icon + text,
// never color alone).
function DomainBadge({ domain, size = 13 }) {
  if (!domain) return null;
  const Icon = DOMAIN_ICONS[domain.icon] || DOMAIN_ICONS.brain;
  return (
    <span className="domain-badge" style={{ "--domain-accent": domain.accent }}>
      <Icon size={size} aria-hidden="true" />
      {domain.label}
    </span>
  );
}

function ViewTitle({ view, activeChat, activeProject }) {
  if (view === "settings") return <div className="topbar-title"><Settings size={17} /><span>Settings</span></div>;
  if (view === "profile") return <div className="topbar-title"><UserRound size={17} /><span>Learning profile</span></div>;
  if (view === "brain") return <div className="topbar-title"><Brain size={17} /><span>Learning brain</span></div>;
  if (view === "notes") return <div className="topbar-title"><Save size={17} /><span>Saved notes</span></div>;
  if (view === "flashcards") return <div className="topbar-title"><BookOpen size={17} /><span>Flashcards</span></div>;
  if (view === "community") return <div className="topbar-title"><Users size={17} /><span>Study rooms</span></div>;
  return (
    <div className="topbar-title">
      {activeProject ? <span className="project-dot" style={{ background: activeProject.color }} /> : <Bot size={17} />}
      <span>{activeChat?.name || "Peer"}</span>
    </div>
  );
}

function Sidebar(props) {
  const {
    drawerRef,
    isDrawer,
    closeSidebar,
    state,
    activeChat,
    expanded,
    setExpanded,
    unfiledChats,
    chatSearch,
    setChatSearch,
    createChat,
    deleteChat,
    editingChatId,
    editingName,
    setEditingName,
    startRename,
    renameChat,
    cancelRename,
    newProjectName,
    setNewProjectName,
    addProject,
    moveChatToProject,
    selectChat,
    manageProject,
    setView,
    view,
  } = props;

  const matchesSearch = (chat) => chat.name.toLowerCase().includes(chatSearch.toLowerCase());
  const [draggingChatId, setDraggingChatId] = useState(null);
  const [dropProjectId, setDropProjectId] = useState(null);

  const onChatDragStart = (chatId) => setDraggingChatId(chatId);
  const onChatDragEnd = () => { setDraggingChatId(null); setDropProjectId(null); };

  return (
    <aside
      className={`sidebar ${isDrawer ? "sidebar-drawer" : ""}`}
      ref={drawerRef}
      role={isDrawer ? "dialog" : undefined}
      aria-modal={isDrawer ? "true" : undefined}
      aria-label="Chats and projects"
    >
      {isDrawer && (
        <div className="sidebar-drawer-head">
          <span>Chats & projects</span>
          <button className="icon-button" onClick={closeSidebar} aria-label="Close sidebar"><X size={18} /></button>
        </div>
      )}
      <div className="brand">
        <PeerLogo size={28} />
        <div>
          <strong>Peer</strong>
          <span>Adaptive tutor</span>
        </div>
      </div>

      <button className="primary-button" onClick={() => createChat()}>
        <Plus size={17} /> New chat
      </button>

      <div className="sidebar-search">
        <Search size={14} aria-hidden="true" />
        <input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats..." aria-label="Search chats" />
      </div>

      <div className="sidebar-scroll">
        <section className="side-section">
          <div className="side-heading"><span>Projects</span></div>
          <div className="add-project">
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addProject();
              }}
              placeholder="New subject..."
            />
            <button className="icon-button" onClick={() => addProject()} aria-label="Add project"><Plus size={16} /></button>
          </div>

          {state.projects.map((project) => {
            const projectChats = state.chats.filter((chat) => chat.projectId === project.id && matchesSearch(chat));
            const isOpen = expanded[project.id] ?? true;
            const isDropTarget = dropProjectId === project.id && draggingChatId;
            const canDrop = (chatId) => {
              const source = state.chats.find((c) => c.id === chatId);
              return source && source.projectId !== project.id;
            };
            return (
              <div
                className={`project-group ${isDropTarget ? "drop-target" : ""}`}
                key={project.id}
                onDragOver={(event) => {
                  if (!draggingChatId || !canDrop(draggingChatId)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (dropProjectId !== project.id) setDropProjectId(project.id);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setDropProjectId(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const chatId = event.dataTransfer.getData("text/peer-chat-id") || draggingChatId;
                  setDropProjectId(null);
                  setDraggingChatId(null);
                  if (chatId && canDrop(chatId)) moveChatToProject(chatId, project.id);
                }}
              >
                <div className="project-row">
                  <button className="project-toggle" onClick={() => setExpanded((current) => ({ ...current, [project.id]: !isOpen }))} aria-label="Toggle project">
                    <ChevronRight className={isOpen ? "rotated" : ""} size={15} />
                  </button>
                  <span className="project-dot" style={{ background: project.color }} />
                  <span className="project-name" title={`${project.name} · ${domainForProject(project).label}`}>{project.name}</span>
                  {project.docs.length > 0 && <span className="doc-count"><FileText size={12} />{project.docs.length}</span>}
                  <button className="ghost-icon" onClick={() => manageProject(project.id)} aria-label="Manage project"><Settings size={14} /></button>
                </div>
                {isDropTarget && <div className="drop-hint"><Plus size={12} /> Move here</div>}
                {isOpen && (
                  <div className="chat-list nested">
                    <button className="new-project-chat" onClick={() => createChat(project.id)}>
                      <Plus size={13} /> New chat
                    </button>
                    {projectChats.map((chat) => (
                      <ChatRow
                        key={chat.id}
                        chat={chat}
                        active={activeChat?.id === chat.id}
                        editing={editingChatId === chat.id}
                        editingName={editingName}
                        setEditingName={setEditingName}
                        renameChat={renameChat}
                        cancelRename={cancelRename}
                        selectChat={selectChat}
                        startRename={startRename}
                        deleteChat={deleteChat}
                        draggable
                        dragging={draggingChatId === chat.id}
                        onChatDragStart={onChatDragStart}
                        onChatDragEnd={onChatDragEnd}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {unfiledChats.filter(matchesSearch).length > 0 && (
          <section className="side-section">
            <div className="side-heading"><span>Recents</span></div>
            <div className="chat-list">
              {unfiledChats.filter(matchesSearch).map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  active={activeChat?.id === chat.id}
                  editing={editingChatId === chat.id}
                  editingName={editingName}
                  setEditingName={setEditingName}
                  renameChat={renameChat}
                  cancelRename={cancelRename}
                  selectChat={selectChat}
                  startRename={startRename}
                  deleteChat={deleteChat}
                  draggable
                  dragging={draggingChatId === chat.id}
                  onChatDragStart={onChatDragStart}
                  onChatDragEnd={onChatDragEnd}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <nav className="sidebar-nav">
        <button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}><MessageSquare size={16} /> Chat</button>
        <button className={view === "brain" ? "active" : ""} onClick={() => setView("brain")}><Brain size={16} /> Brain</button>
        <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><UserRound size={16} /> Profile</button>
        <button className={view === "notes" ? "active" : ""} onClick={() => setView("notes")}><Save size={16} /> Notes</button>
        <button className={view === "flashcards" ? "active" : ""} onClick={() => setView("flashcards")}><BookOpen size={16} /> Flashcards</button>
        <button className={view === "community" ? "active" : ""} onClick={() => setView("community")}><Users size={16} /> Rooms</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings size={16} /> Settings</button>
      </nav>
    </aside>
  );
}

function ChatRow({ chat, active, editing, editingName, setEditingName, renameChat, cancelRename, selectChat, startRename, deleteChat, draggable, dragging, onChatDragStart, onChatDragEnd }) {
  return (
    <div
      className={`chat-row ${active ? "active" : ""} ${dragging ? "dragging" : ""}`}
      draggable={draggable && !editing}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/peer-chat-id", chat.id);
        event.dataTransfer.effectAllowed = "move";
        onChatDragStart?.(chat.id);
      }}
      onDragEnd={() => onChatDragEnd?.()}
      onClick={() => selectChat(chat.id)}
      onKeyDown={(event) => {
        if (!editing && (event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
          event.preventDefault();
          selectChat(chat.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
    >
      <MessageSquare size={15} aria-hidden="true" />
      {editing ? (
        <input
          autoFocus
          value={editingName}
          aria-label="Chat name"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setEditingName(event.target.value)}
          onBlur={renameChat}
          onKeyDown={(event) => {
            if (event.key === "Enter") renameChat();
            if (event.key === "Escape") cancelRename();
          }}
        />
      ) : (
        <span>{chat.name}</span>
      )}
      {!editing && (
        <div className="row-actions">
          <button onClick={(event) => { event.stopPropagation(); startRename(chat); }} aria-label="Rename chat">Edit</button>
          <button onClick={(event) => { event.stopPropagation(); deleteChat(chat.id); }} aria-label="Delete chat"><Trash2 size={13} /></button>
        </div>
      )}
    </div>
  );
}

function ChatArea({ activeChat, activeProject, activeMode, loading, error, sendMessage, bottomRef, handleFeedback, saveNote, regenerateFrom, startTeachBack, reflectSession, makeFlashcards, generateImage, requestVisualBlueprint }) {
  if (!activeChat?.messages.length) {
    return (
      <section className="welcome">
        <div className="welcome-mark"><Brain size={31} /></div>
        <h1>{activeProject ? `Studying ${activeProject.name}` : "What do you want to understand?"}</h1>
        {activeProject && domainForProject(activeProject).id !== "general" && (
          <DomainBadge domain={domainForProject(activeProject)} />
        )}
        <p>
          Start in your own words. Peer adapts through the conversation and remembers what explanation styles work for you.
          {activeProject?.docs?.length ? ` This project has ${activeProject.docs.length} document${activeProject.docs.length > 1 ? "s" : ""} in its library.` : ""}
        </p>
        <div className="starter-grid">
          {STARTERS.map((starter) => {
            const Icon = starter.icon;
            return (
              <button key={starter.title} className="starter-card" onClick={() => sendMessage(starter.prompt, { mode: starter.mode })}>
                <Icon size={21} />
                <span>
                  <strong>{starter.title}</strong>
                  <small>{starter.sub}</small>
                </span>
              </button>
            );
          })}
        </div>
        {error && <div className="inline-error" role="alert">{error}</div>}
      </section>
    );
  }

  const streamingNow = loading || activeChat.messages.some((message) => message.streaming);

  return (
    <section className="messages" aria-label="Conversation">
      <div className="sr-only" role="status" aria-live="polite">
        {streamingNow ? "Peer is responding" : ""}
      </div>
      <div className="mode-banner">
        <activeMode.icon size={16} />
        <span>{activeMode.label} mode</span>
        <small>{activeMode.prompt}</small>
        <div className="mode-banner-actions">
          <button onClick={startTeachBack}><MessageSquare size={13} /> Teach back</button>
          <button onClick={reflectSession}><ClipboardCheck size={13} /> Reflect</button>
        </div>
      </div>
      {activeChat.messages.map((message, index) => (
        <article className={`message ${message.role}`} key={message.id || `${message.role}-${index}`}>
          <div className="avatar">{message.role === "assistant" ? <Brain size={17} /> : "You"}</div>
          <div className="message-stack">
            <div className="bubble">
            {message.role === "assistant"
              ? <StreamingMessage content={message.content} streaming={message.streaming} />
              : <p>{message.displayContent || message.content}</p>}
            {message.imageUrl && <img className="message-image" src={message.imageUrl} alt={message.imageAlt || "Generated educational visual"} />}
            {message.role === "user" && message.attachments?.length > 0 && (
              <div className="message-attachments">
                {message.attachments.map((file) => (
                  <span key={file.id}><FileText size={13} />{file.name}</span>
                ))}
              </div>
            )}
            </div>
            {message.role === "assistant" && (
              <MessageActions
                message={message}
                index={index}
                handleFeedback={handleFeedback}
                saveNote={saveNote}
                regenerateFrom={regenerateFrom}
                sendMessage={sendMessage}
                makeFlashcards={makeFlashcards}
                generateImage={generateImage}
                requestVisualBlueprint={requestVisualBlueprint}
              />
            )}
          </div>
        </article>
      ))}
      {loading && (
        <article className="message assistant">
          <div className="avatar" aria-hidden="true"><Brain size={17} /></div>
          <div className="typing" role="status" aria-label="Peer is thinking"><span /><span /><span /></div>
        </article>
      )}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div ref={bottomRef} />
    </section>
  );
}

function MessageActions({ message, index, handleFeedback, saveNote, regenerateFrom, sendMessage, makeFlashcards, generateImage, requestVisualBlueprint }) {
  return (
    <div className="message-actions" role="group" aria-label="Response feedback and actions">
      <button className={message.feedback === "understood" ? "active" : ""} onClick={() => handleFeedback(message, "understood")}><CheckCircle2 size={14} /> I get it</button>
      <button className={message.feedback === "confused" ? "active" : ""} onClick={() => handleFeedback(message, "confused")}><HelpCircle size={14} /> I'm confused</button>
      <button className={message.feedback === "alternate" ? "active" : ""} onClick={() => handleFeedback(message, "alternate")}><Wand2 size={14} /> Explain differently</button>
      <button className={message.feedback === "tooVague" ? "active" : ""} onClick={() => handleFeedback(message, "tooVague")}><Target size={14} /> Too vague</button>
      <button className={message.feedback === "tooAdvanced" ? "active" : ""} onClick={() => handleFeedback(message, "tooAdvanced")}><HelpCircle size={14} /> Too hard</button>
      <button className={message.feedback === "tooLong" ? "active" : ""} onClick={() => handleFeedback(message, "tooLong")}><RefreshCw size={14} /> Too long</button>
      <button className={message.feedback === "goodExample" ? "active" : ""} onClick={() => handleFeedback(message, "goodExample")}><CheckCircle2 size={14} /> Good example</button>
      <button className={message.feedback === "moreTechnical" ? "active" : ""} onClick={() => handleFeedback(message, "moreTechnical")}><Code2 size={14} /> More technical</button>
      <button className={message.feedback === "moreVisual" ? "active" : ""} onClick={() => handleFeedback(message, "moreVisual")}><Layers size={14} /> More visual</button>
      <button className={message.feedback === "quiz" ? "active" : ""} onClick={() => handleFeedback(message, "quiz")}><Target size={14} /> Quiz me</button>
      <button className={message.feedback === "teachBack" ? "active" : ""} onClick={() => handleFeedback(message, "teachBack")}><MessageSquare size={14} /> Teach back</button>
      <button onClick={() => saveNote(message)}><Save size={14} /> {message.savedNoteId ? "Saved" : "Save"}</button>
      <button onClick={() => regenerateFrom(index)}><RotateCcw size={14} /> Regenerate</button>
      <div className="action-divider" />
      <button className="action-highlight" onClick={() => makeFlashcards(message)}><BookOpen size={14} /> Make flashcards</button>
      <button onClick={() => sendMessage("Break this down step by step from the very beginning. Number each step and explain each one clearly.", { mode: "explain" })}><ChevronRight size={14} /> Step by step</button>
      <button onClick={() => generateImage(message)}><Layers size={14} /> Visualize</button>
      <button onClick={() => requestVisualBlueprint(message, "diagram")}><GitBranch size={14} /> Diagram</button>
      <button onClick={() => requestVisualBlueprint(message, "flowchart")}><GitBranch size={14} /> Flowchart</button>
      <button onClick={() => requestVisualBlueprint(message, "mindmap")}><Brain size={14} /> Memory map</button>
    </div>
  );
}

const SPEECH_LANG_MAP = { en: "en-US", nl: "nl-NL", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR", it: "it-IT", tr: "tr-TR", ar: "ar" };

function Composer({
  input,
  setInput,
  loading,
  sendMessage,
  activeProject,
  activeMode,
  setActiveMode,
  pendingFiles,
  removePendingFile,
  processChatAttachments,
  composerDragging,
  setComposerDragging,
  attachmentBusy,
  voiceMode,
  toggleVoiceMode,
  speaking,
  stopSpeaking,
  listening,
  startListening,
  stopListening,
  profileLanguage,
  explanationDepth,
  setExplanationDepth,
  usage,
}) {
  const attachRef = useRef(null);
  const hasSpeech = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const activeModeIndex = STUDY_MODES.findIndex((mode) => mode.id === activeMode.id);

  function toggleRecording() {
    if (listening) stopListening();
    else startListening();
  }

  return (
    <footer
      className={`composer-wrap ${composerDragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setComposerDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setComposerDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setComposerDragging(false);
        processChatAttachments(Array.from(event.dataTransfer.files || []));
      }}
    >
      <input
        ref={attachRef}
        className="hidden-file"
        type="file"
        multiple
        accept=".pdf,.txt,.md,.markdown,.csv,.json,.js,.jsx,.ts,.tsx,.html,.css,.c,.h,.cpp,.hpp,.py,.java,.rs,.go,.sh,image/*"
        onChange={(event) => {
          processChatAttachments(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <div className="mode-strip" style={{ "--active-mode-index": Math.max(0, activeModeIndex) }}>
        <span className="mode-strip-indicator" aria-hidden="true" />
        {STUDY_MODES.map((mode) => {
          const Icon = mode.icon;
          return (
            <button key={mode.id} className={activeMode.id === mode.id ? "active" : ""} onClick={() => setActiveMode(mode.id)}>
              <Icon size={14} /> {mode.label}
            </button>
          );
        })}
      </div>
      <div className="depth-strip" aria-label="Explanation depth">
        <span><SlidersHorizontal size={13} /> Depth</span>
        {DEPTH_OPTIONS.map((option) => (
          <button
            key={option.id}
            className={explanationDepth === option.id ? "active" : ""}
            onClick={() => setExplanationDepth(option.id)}
            title={option.hint}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {voiceMode && (
        <div className="voice-hud" role="status">
          <span className={`voice-hud-dot ${listening ? "hud-listening" : loading ? "hud-thinking" : speaking ? "hud-speaking" : ""}`} aria-hidden="true" />
          {listening
            ? "Listening — just talk, Peer is writing it down"
            : loading
              ? "Thinking…"
              : speaking
                ? "Speaking — tap the mic to interrupt"
                : "Voice conversation on — tap the mic to talk"}
        </div>
      )}
      {pendingFiles.length > 0 && (
        <div className="attachment-tray">
          {pendingFiles.map((file) => (
            <span key={file.id}>
              <FileText size={14} />
              {file.name}
              <button onClick={() => removePendingFile(file.id)} aria-label={`Remove ${file.name}`}><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="composer">
        <button className="attach-button" onClick={() => attachRef.current?.click()} disabled={attachmentBusy} aria-label="Attach study material">
          {attachmentBusy ? <RefreshCw className="spin" size={17} /> : <Paperclip size={17} />}
        </button>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          placeholder={listening ? "Listening… speak now" : activeProject ? `Ask about ${activeProject.name}...` : "Ask a question or explain what you are stuck on..."}
          aria-label="Message Peer"
          rows={1}
        />
        {hasSpeech && (
          <button
            className={`mic-button ${listening ? "recording" : ""}`}
            onClick={toggleRecording}
            aria-label={listening ? "Stop listening" : speaking ? "Interrupt and speak" : "Speak your question"}
            title={listening ? "Listening — click to stop" : speaking ? "Interrupt Peer and speak" : "Speak your question"}
          >
            {listening ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
        )}
        <button
          className={`voice-toggle ${voiceMode ? "active" : ""}`}
          onClick={toggleVoiceMode}
          aria-label={voiceMode ? "Disable voice responses" : "Enable voice responses"}
          title={voiceMode ? "Voice responses on - click to disable" : "Click to hear Peer's answers aloud"}
        >
          {voiceMode ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
        <button className="send-button" disabled={(!input.trim() && pendingFiles.length === 0) || loading || attachmentBusy} onClick={() => sendMessage()} aria-label="Send">
          {loading ? <RefreshCw className="spin" size={17} /> : <Send size={17} />}
        </button>
      </div>
      <div className="composer-hint">
        Drop PDFs, text, code, or images here. Peer saves them to this project automatically.
        {usage && Number.isFinite(usage.allowance) && (
          <span className={`usage-meter ${usage.usedToday / usage.allowance > 0.85 ? "usage-low" : ""}`}>
            {" · "}
            {Math.max(0, Math.round((usage.allowance - usage.usedToday) / 1000))}k AI tokens left today
            {usage.plan === "pro" ? " (Pro)" : ""}
          </span>
        )}
      </div>
    </footer>
  );
}

function BadgeMedallion({ def, earned, progress = 0, current = 0, onShare }) {
  const Icon = DOMAIN_ICONS[def.icon] || BADGE_ICONS[def.icon] || DOMAIN_ICONS.brain;
  return (
    <div
      className={`badge-medallion ${earned ? "earned" : "locked"}`}
      style={{ "--badge-accent": def.accent }}
      role="group"
      aria-label={`${def.title}: ${def.description} ${earned ? "Earned." : `Progress ${current} of ${def.target}.`}`}
    >
      <span className="badge-coin"><Icon size={20} aria-hidden="true" /></span>
      <strong>{def.title}</strong>
      <small>{def.description}</small>
      {earned ? (
        <button type="button" className="badge-share" onClick={() => onShare(def)}>
          <Share2 size={12} aria-hidden="true" /> Share
        </button>
      ) : (
        <span className="badge-progress" aria-hidden="true">
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function ProfilePanel({ profile, activeProject, activeChat, insights, activeMode, updateState, recap, badgeInfo, showToast }) {
  const [showAllBadges, setShowAllBadges] = useState(false);
  function shareBadge(def) {
    const text = `I just earned "${def.title}" on Peer — ${def.description}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
      showToast("Achievement copied — paste it anywhere.");
    }
  }
  const recipe = buildTeachingRecipe(profile, activeProject, activeMode.id);
  const concepts = activeProject?.mastery?.concepts || [];
  const misconceptions = activeProject?.mastery?.misconceptions || [];
  const skillTree = buildSkillTree(activeProject, profile.subject);
  const weakSpots = getWeakSpots(activeProject);
  const sessionRecap = buildSessionRecap(activeChat, activeProject);
  return (
    <section className="profile-panel">
      <div className="page-heading">
        <div>
          <h1>Learning profile</h1>
          <p>Peer uses these signals to adapt explanations over time.</p>
        </div>
        <span className="profile-mode"><activeMode.icon size={16} /> {activeMode.label}</span>
      </div>

      <div className="profile-grid">
        {recap && recap.totalConcepts > 0 && (
          <div className="profile-card wide recap-card">
            <h2>What Peer remembers</h2>
            <div className="recap-row">
              {recap.recent.length > 0 && (
                <div>
                  <strong>Recently studied</strong>
                  <div className="recap-chips">
                    {recap.recent.map((c) => (
                      <span key={c.id} className={`recap-chip traj-${c.trajectory}`}>{c.label} · {Math.round((c.confidence || 0) * 100)}%</span>
                    ))}
                  </div>
                </div>
              )}
              {recap.improving.length > 0 && (
                <div>
                  <strong>Improving ↗</strong>
                  <div className="recap-chips">{recap.improving.map((c) => <span key={c.id} className="recap-chip traj-improving">{c.label}</span>)}</div>
                </div>
              )}
              {recap.slipping.length > 0 && (
                <div>
                  <strong>Slipping ↘ · revisit</strong>
                  <div className="recap-chips">{recap.slipping.map((c) => <span key={c.id} className="recap-chip traj-slipping">{c.label}</span>)}</div>
                </div>
              )}
            </div>
            <p className="recap-foot">Tracking {recap.totalConcepts} concept{recap.totalConcepts === 1 ? "" : "s"} across your projects · {recap.streak}-day streak. Peer uses this to adapt every answer.</p>
          </div>
        )}
        <div className="profile-card wide">
          <h2>Trophy case · {badgeInfo.earned.length} of {badgeInfo.earned.length + badgeInfo.locked.length} earned</h2>
          {badgeInfo.earned.length === 0 && (
            <p>Your first badges are close — ask a question, keep a streak, save a note. Every subject has its own track.</p>
          )}
          <div className="badge-grid">
            {badgeInfo.earned.map((def) => (
              <BadgeMedallion key={def.id} def={def} earned onShare={shareBadge} />
            ))}
            {(showAllBadges ? badgeInfo.locked : badgeInfo.locked.slice(0, badgeInfo.earned.length ? 4 : 6)).map((def) => (
              <BadgeMedallion key={def.id} def={def} earned={false} progress={def.progress} current={def.current} onShare={shareBadge} />
            ))}
          </div>
          {badgeInfo.locked.length > 6 && (
            <button type="button" className="badge-toggle" onClick={() => setShowAllBadges((value) => !value)}>
              {showAllBadges ? "Show fewer" : `Show all ${badgeInfo.locked.length} remaining badges`}
            </button>
          )}
          {badgeInfo.next && (
            <p className="badge-next">
              Next up: <strong>{badgeInfo.next.title}</strong> — {badgeInfo.next.current}/{badgeInfo.next.target}
            </p>
          )}
        </div>
        <div className="profile-card">
          <h2>Current read</h2>
          <strong>{insights.headline}</strong>
          <p>{insights.description}</p>
        </div>
        <div className="profile-card">
          <h2>Signals</h2>
          <div className="signal-grid">
            <Metric label="Understood" value={profile.signals.understood} />
            <Metric label="Confused" value={profile.signals.confused} />
            <Metric label="Alternates" value={profile.signals.alternate} />
            <Metric label="Quizzes" value={profile.signals.quiz} />
          </div>
        </div>
        <div className="profile-card">
          <h2>Calm streak</h2>
          <div className="streak-card">
            <strong>{profile.streak?.count || 0}</strong>
            <span>day{(profile.streak?.count || 0) === 1 ? "" : "s"} in rhythm</span>
            <small>{profile.streak?.messagesToday || 0} study message{(profile.streak?.messagesToday || 0) === 1 ? "" : "s"} today</small>
          </div>
        </div>
        <div className="profile-card wide">
          <h2>Implicit learning</h2>
          <div className="signal-grid compact">
            <Metric label="File context" value={profile.signals.attachments} />
            <Metric label="Implicit reads" value={profile.signals.implicit} />
            <Metric label="Code mentions" value={profile.traits.codeMentions} />
            <Metric label="Example asks" value={profile.traits.asksExamples} />
            <Metric label="Why questions" value={profile.traits.asksWhy} />
            <Metric label="Confusion phrases" value={profile.traits.confusionPhrases} />
          </div>
        </div>
        <div className="profile-card wide">
          <h2>Teaching recipe</h2>
          <div className="recipe-list">
            {recipe.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div className="profile-card wide">
          <h2>Session recap</h2>
          <div className="session-recap">
            <Metric label="User turns" value={sessionRecap.userTurns} />
            <Metric label="AI turns" value={sessionRecap.assistantTurns} />
            <div>
              <strong>Learned</strong>
              <p>{sessionRecap.learned.join(", ")}</p>
            </div>
            <div>
              <strong>Review</strong>
              <p>{sessionRecap.review.join(", ")}</p>
            </div>
            <div className="session-next">
              <strong>Next step</strong>
              <p>{sessionRecap.nextStep}</p>
            </div>
          </div>
        </div>
        <div className="profile-card wide">
          <h2>Skill tree {activeProject ? `- ${activeProject.name}` : ""}</h2>
          {skillTree.groups.length ? (
            <div className="skill-tree">
              <div className="skill-root"><GitBranch size={16} /> {skillTree.label}</div>
              {skillTree.groups.map((group) => (
                <div className="skill-branch" key={group.id}>
                  <strong>{group.label}</strong>
                  <div>
                    {group.concepts.slice(0, 8).map((concept) => (
                      <span className={`skill-node ${concept.status}`} key={concept.id}>
                        {concept.label}
                        <small>{Math.round((concept.confidence || 0) * 100)}%</small>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No skill tree yet. Concepts appear here as you chat, quiz, and teach back.</p>
          )}
        </div>
        <div className="profile-card wide">
          <h2>Weak-spot detector</h2>
          {weakSpots.length ? (
            <div className="weakspot-list">
              {weakSpots.map((spot) => (
                <span key={spot.id}>
                  <HelpCircle size={14} />
                  <strong>{spot.label}</strong>
                  <small>{spot.evidence || spot.status}</small>
                </span>
              ))}
            </div>
          ) : (
            <p>No clear weak spot detected yet. Peer will surface patterns after more feedback and quiz answers.</p>
          )}
        </div>
        <div className="profile-card wide">
          <h2>Concept mastery {activeProject ? `- ${activeProject.name}` : ""}</h2>
          {concepts.length ? (
            <div className="concept-list">
              {concepts.slice(0, 10).map((concept) => (
                <div className="concept-row" key={concept.id}>
                  <span><strong>{concept.label}</strong><small>{concept.status} - {concept.evidence}</small></span>
                  <div><i style={{ width: `${Math.round((concept.confidence || 0) * 100)}%` }} /></div>
                  <b>{Math.round((concept.confidence || 0) * 100)}%</b>
                </div>
              ))}
            </div>
          ) : (
            <p>No concepts tracked yet. Ask questions, quiz yourself, or teach a topic back.</p>
          )}
        </div>
        <div className="profile-card wide">
          <h2>Misconceptions to revisit</h2>
          {misconceptions.length ? (
            <div className="misconception-list">
              {misconceptions.map((item) => (
                <span key={item.id}><strong>{item.concept}</strong>{item.belief}{" -> "}{item.correction}</span>
              ))}
            </div>
          ) : (
            <p>No clear misconceptions detected yet.</p>
          )}
        </div>
        <div className="profile-card wide">
          <h2>Style weights</h2>
          <PreferenceBars preferences={profile.preferences} />
        </div>
        <div className="profile-card wide">
          <h2>Study identity</h2>
          <div className="profile-form">
            <label>
              Subject
              <input value={profile.subject} onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, subject: event.target.value } }))} placeholder="Biology, history, Spanish, calculus, coding..." />
            </label>
            <label>
              Goal
              <input value={profile.goal} onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, goal: event.target.value } }))} placeholder="Pass an exam, hold a conversation in Spanish, master calculus..." />
            </label>
            <label>
              Language
              <LanguagePicker
                value={profile.language}
                onChange={(language) => updateState((current) => ({ ...current, profile: { ...current.profile, language } }))}
              />
            </label>
            <label>
              Explanation depth
              <select
                value={profile.explanationDepth}
                onChange={(event) => updateState((current) => ({ ...current, profile: setExplanationDepth(current.profile, event.target.value) }))}
              >
                {DEPTH_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Level
              <select
                value={profile.level}
                onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, level: event.target.value } }))}
              >
                {LEVEL_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Starting style
              <select
                value={profile.learningPreference}
                onChange={(event) => updateState((current) => ({
                  ...current,
                  profile: {
                    ...current.profile,
                    learningPreference: event.target.value,
                    preferences: seedPreferencesFromOnboarding(current.profile.preferences, event.target.value),
                  },
                }))}
              >
                {LEARNING_STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="profile-card wide">
          <h2>Recent observations</h2>
          {profile.observations.length ? (
            <div className="observation-list">
              {profile.observations.map((item) => <span key={item.id}>{item.text}</span>)}
            </div>
          ) : (
            <p>No learning signals yet. Use the feedback buttons after an answer to train Peer.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><strong>{value || 0}</strong><span>{label}</span></div>;
}

function PreferenceBars({ preferences }) {
  const entries = Object.entries(preferences);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return (
    <div className="preference-bars">
      {entries.map(([key, value]) => (
        <div className="preference-row" key={key}>
          <span>{key}</span>
          <div><i style={{ width: `${Math.max(8, (value / max) * 100)}%` }} /></div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function NotesPanel({ notes, projects, deleteNote, toggleShareNote, onPractice }) {
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const filtered = notes.filter((note) => {
    const text = `${note.title} ${note.content} ${note.category || ""} ${(note.tags || []).join(" ")}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    const matchesProject = projectFilter === "all" || note.projectId === projectFilter;
    return matchesQuery && matchesProject;
  });
  const grouped = filtered.reduce((groups, note) => {
    const key = note.category || projects.find((item) => item.id === note.projectId)?.name || "General";
    groups[key] = groups[key] || [];
    groups[key].push(note);
    return groups;
  }, {});

  return (
    <section className="notes-panel">
      <div className="page-heading">
        <div>
          <h1>Notebook</h1>
          <p>Organized explanations, tags, and shared study assets.</p>
        </div>
      </div>
      <div className="notebook-tools">
        <label>
          <Search size={14} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes, tags, concepts..." aria-label="Search notes" />
        </label>
        <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Filter notes by project">
          <option value="all">All projects</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>
      {notes.length === 0 ? (
        <div className="empty-state">
          <Save size={28} />
          <strong>No notes yet</strong>
          <span>Save strong AI answers, then organize and share them from this notebook.</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><Search size={28} /><strong>No matching notes</strong><span>Try another keyword or project filter.</span></div>
      ) : (
        <div className="notebook-groups">
          {Object.entries(grouped).map(([group, items]) => (
            <section className="notebook-group" key={group}>
              <h2>{group}</h2>
              <div className="notes-grid">
                {items.map((note) => {
                  const project = projects.find((item) => item.id === note.projectId);
                  return (
                    <article className="note-card" key={note.id}>
                      <header>
                        <strong>{note.title}</strong>
                        <span>
                          {onPractice && <button onClick={() => onPractice(note.title, { context: note.content })} title="Practice this note" aria-label={`Practice "${note.title}"`}><Target size={14} /></button>}
                          <button onClick={() => toggleShareNote(note.id)} title={note.shared ? "Unshare note" : "Share note locally"} aria-label={note.shared ? `Unshare "${note.title}"` : `Share "${note.title}"`}><Share2 size={14} /></button>
                          <button onClick={() => deleteNote(note.id)} aria-label={`Delete "${note.title}"`}><Trash2 size={14} /></button>
                        </span>
                      </header>
                      <small>{project?.name || "Unfiled"} - {new Date(note.createdAt).toLocaleDateString()} {note.shared ? "- shared" : ""}</small>
                      {note.tags?.length > 0 && <div className="note-tags">{note.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                      <p>{note.content.slice(0, 420)}{note.content.length > 420 ? "..." : ""}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}


function SettingsPanel({ state, updateState, resetData, loadSampleData, cloudSync, signOut, confirmDeleteAccount }) {
  const [tab, setTab] = useState("appearance");
  const provider = AUTH_PROVIDERS.find((item) => item.id === state.account?.provider);

  const syncDescriptions = {
    starting: "Checking cloud connection…",
    "signed-out": "Your data lives safely on this device. Cloud accounts (Google, email) arrive in the next update — sign-in will back everything up and sync it across devices automatically.",
    idle: cloudSync?.lastSyncAt
      ? `Everything is backed up and in sync. Last sync ${new Date(cloudSync.lastSyncAt).toLocaleTimeString()}.`
      : "Connected — waiting for the first sync.",
    syncing: "Syncing your latest changes…",
    offline: "You're offline. Changes are saved locally and will sync when you're back.",
    error: `Sync hit a snag${cloudSync?.lastError ? `: ${cloudSync.lastError}` : ""}. It retries automatically.`,
  };

  const tabs = [
    { id: "appearance", icon: Sun, label: "Appearance" },
    { id: "account", icon: UserRound, label: "Account" },
    { id: "data", icon: Trash2, label: "Data" },
  ];

  return (
    <section className="settings-panel">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Appearance, account, and your local data.</p>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-sidenav">
          <p className="settings-sidenav-label">Settings</p>
          {tabs.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={`settings-sidenav-btn${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="settings-body">
          {tab === "appearance" && (
            <>
              <div className="settings-group">
                <h2>Theme</h2>
                <div className="segmented">
                  <button className={state.theme === "dark" ? "active" : ""} onClick={() => updateState((c) => ({ ...c, theme: "dark" }))}>
                    <Moon size={15} /> Dark
                  </button>
                  <button className={state.theme === "light" ? "active" : ""} onClick={() => updateState((c) => ({ ...c, theme: "light" }))}>
                    <Sun size={15} /> Light
                  </button>
                </div>
              </div>

              <div className="settings-group">
                <h2>Reading font</h2>
                <div className="font-list">
                  {FONT_OPTIONS.map((font) => (
                    <button
                      key={font.id}
                      className={state.fontId === font.id ? "active" : ""}
                      style={{ fontFamily: font.family }}
                      onClick={() => updateState((c) => ({ ...c, fontId: font.id }))}
                    >
                      <span className="font-title">
                        {font.label}
                        {font.tag && <small>{font.tag}</small>}
                      </span>
                      <span>The quick brown fox jumps over the lazy dog.</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-group">
                <h2>Text size</h2>
                <div className="range-row">
                  <span style={{ fontSize: 13 }}>A</span>
                  <input type="range" min="13" max="19" value={state.textSize} onChange={(e) => updateState((c) => ({ ...c, textSize: Number(e.target.value) }))} />
                  <span style={{ fontSize: 18, fontWeight: 700 }}>A</span>
                  <strong className="settings-size-label">{state.textSize}px</strong>
                </div>
              </div>
            </>
          )}

          {tab === "account" && (
            <>
              <div className="settings-group">
                <h2>Profile</h2>
                <div className="account-summary">
                  <div className="account-avatar">{state.account?.name ? state.account.name.slice(0, 1).toUpperCase() : "P"}</div>
                  <div>
                    <strong>{state.account?.name || "Local learner"}</strong>
                    <span>{state.account?.verified ? state.account.email : "Guest mode — data lives on this device"}</span>
                    <small>{state.account?.verified ? `Signed in with ${provider?.label || "email"}` : "Sign in to back up and sync across devices"}</small>
                  </div>
                  {state.account?.verified ? (
                    <button onClick={signOut}>Sign out</button>
                  ) : (
                    <button className="primary-button" style={{ margin: 0 }} onClick={() => updateState((c) => ({ ...c, landingComplete: false }))}>Sign in</button>
                  )}
                </div>
              </div>

              {state.account?.verified && (
                <div className="settings-group">
                  <h2>Danger zone</h2>
                  <p className="settings-danger-desc">Permanently delete your account and every piece of cloud data. Local data on this device is kept.</p>
                  <button className="danger-btn" onClick={confirmDeleteAccount}>
                    <Trash2 size={15} /> Delete account
                  </button>
                </div>
              )}

              <div className="settings-group">
                <h2>Cloud sync</h2>
                <div className={`sync-status sync-${cloudSync?.status || "starting"}`} role="status">
                  <span className="sync-status-dot" aria-hidden="true" />
                  <p>{syncDescriptions[cloudSync?.status] || syncDescriptions.starting}</p>
                  {cloudSync?.status === "idle" && (
                    <button type="button" onClick={() => cloudSync.syncNow()}>Sync now</button>
                  )}
                </div>
              </div>

              <div className="settings-group">
                <h2>Coming soon</h2>
                <div className="roadmap-grid">
                  <span><UserRound size={15} /> Google, Facebook, and email sign-in</span>
                  <span><ClipboardCheck size={15} /> Usage limits, AI cost tracking, and audit logs</span>
                  <span><Languages size={15} /> OCR, multilingual parsing, and document search</span>
                  <span><Library size={15} /> Live study rooms with real partners</span>
                </div>
              </div>
            </>
          )}

          {tab === "data" && (
            <>
              <div className="settings-group">
                <h2>Sample data</h2>
                <p className="settings-danger-desc">Add two demo subjects (Neuroscience, Linear Algebra) fully populated with concepts, weak spots, notes, and flashcard decks — so the Brain, Notes, and Cards have something to show. Your existing data is untouched.</p>
                <button className="primary-button" style={{ margin: 0, width: "fit-content" }} onClick={loadSampleData}>
                  <Sparkles size={15} /> Load sample data
                </button>
              </div>
              <div className="settings-group">
                <h2>Reset data</h2>
                <p className="settings-danger-desc">This clears all chats, projects, and flashcards from local storage. Your profile and preferences are kept.</p>
                <button className="danger-btn" onClick={resetData}>
                  <Trash2 size={15} /> Reset local chats and projects
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ProjectModal({ project, selectedDoc, selectedDocId, setSelectedDocId, extracting, error, close, pickFile, addMaterials, removeDoc, deleteProject, runDocAction, setProjectDomain, ocrDoc }) {
  const [dragging, setDragging] = useState(false);
  const [selectedExcerpt, setSelectedExcerpt] = useState("");
  const trapRef = useFocusTrap(true, { onEscape: close });
  const codeFile = selectedDoc && /\.(c|h|cpp|hpp|js|jsx|ts|tsx|py|java|rs|go|sh|html|css)$/i.test(selectedDoc.name);

  useEffect(() => {
    setSelectedExcerpt("");
  }, [selectedDocId]);

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) addMaterials(files);
  }

  function captureSelection() {
    const selection = String(window.getSelection?.() || "").trim();
    if (selection) setSelectedExcerpt(selection.slice(0, 5000));
  }

  function run(action) {
    runDocAction(selectedDoc, action, selectedExcerpt);
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={trapRef}
        className={`modal document-modal ${dragging ? "dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${project.name} — project library`}
        onClick={(event) => event.stopPropagation()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <header className="modal-header">
          <span className="project-dot" style={{ background: project.color }} />
          <div>
            <h2>{project.name}</h2>
            <p>Subject library, extracted text, and document-grounded study prompts.</p>
          </div>
          <label className="domain-picker">
            Domain
            <select
              value={domainForProject(project).id}
              onChange={(event) => setProjectDomain(project.id, event.target.value)}
              aria-label="Subject domain"
            >
              {[...DOMAINS, GENERAL_DOMAIN].map((domain) => (
                <option key={domain.id} value={domain.id}>{domain.label}</option>
              ))}
            </select>
          </label>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="doc-workspace">
          <div className="doc-list">
            <button className="drop-zone" onClick={pickFile}>
              <Paperclip size={18} />
              <span>
                <strong>Drop files here</strong>
                <small>PDF, text, code, markdown, CSV, JSON, or images</small>
              </span>
            </button>
            {project.docs.length === 0 ? (
              <div className="empty-docs"><BookOpen size={23} /><span>No material yet</span></div>
            ) : project.docs.map((doc) => (
              <button className={`doc-row ${selectedDocId === doc.id ? "active" : ""}`} key={doc.id} onClick={() => setSelectedDocId(doc.id)}>
                <FileText size={18} />
                <span>
                  <strong>{doc.name}</strong>
                  <small>{doc.kind || "file"}{doc.pages ? ` - ${doc.pages} pages` : ""} - {(doc.chars / 1000).toFixed(1)}k chars{doc.chars > 40_000 ? " - trimmed" : ""}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="doc-preview">
            {selectedDoc ? (
              <>
                <div className="doc-preview-head">
                  <strong>{selectedDoc.name}</strong>
                <div>
                  <button onClick={() => run("ask")}><MessageSquare size={14} /> Ask</button>
                  <button onClick={() => removeDoc(project.id, selectedDoc.id)}><Trash2 size={14} /> Remove</button>
                </div>
              </div>
                {selectedDoc.previewUrl && <img className="doc-image-preview" src={selectedDoc.previewUrl} alt={selectedDoc.name} />}
                {selectedDoc.note && <div className="doc-note">{selectedDoc.note}</div>}
                <div className="doc-action-grid">
                  <button onClick={() => run("summary")}><ClipboardCheck size={14} /> Summary</button>
                  <button onClick={() => run("quiz")}><Target size={14} /> Quiz</button>
                  <button onClick={() => run("flashcards")}><BookOpen size={14} /> Flashcards</button>
                  <button onClick={() => run("diagram")}><GitBranch size={14} /> Diagram</button>
                  <button onClick={() => run("exam")}><GraduationCap size={14} /> Exam</button>
                  {selectedDoc.kind === "image" && <button onClick={() => run("vision")}><Layers size={14} /> Explain image</button>}
                  {selectedDoc.kind === "image" && <button onClick={() => ocrDoc(project.id, selectedDoc.id)}><FileText size={14} /> Extract text (OCR)</button>}
                  {codeFile && <button onClick={() => run("codeTutor")}><Code2 size={14} /> Code tutor</button>}
                </div>
                <div className="doc-highlight-box">
                  <label>
                    Ask about a highlighted part
                    <textarea
                      value={selectedExcerpt}
                      onChange={(event) => setSelectedExcerpt(event.target.value)}
                      placeholder="Select text in the preview and click Capture, or paste the exact part here."
                      rows={3}
                    />
                  </label>
                  <div>
                    <button onClick={captureSelection}><Search size={14} /> Capture selection</button>
                    <button onClick={() => run("highlight")} disabled={!selectedExcerpt.trim()}><MessageSquare size={14} /> Ask selection</button>
                  </div>
                </div>
                <pre onMouseUp={captureSelection}>{selectedDoc.text.slice(0, 2200)}{selectedDoc.text.length > 2200 ? "\n\n..." : ""}</pre>
              </>
            ) : (
              <div className="empty-docs"><FileText size={22} /><span>Select a document to preview extracted text</span></div>
            )}
          </div>
        </div>

        {error && <div className="inline-error">{error}</div>}

        <div className="modal-actions">
          <button className="primary-button wide" onClick={pickFile} disabled={extracting}>
            {extracting ? <Sparkles size={17} /> : <Paperclip size={17} />}
            {extracting ? "Reading PDF..." : "Add PDF material"}
          </button>
          <button className="delete-project" onClick={() => deleteProject(project.id)}>
            <Trash2 size={15} /> Delete project
          </button>
        </div>
      </section>
    </div>
  );
}

function OnboardingModal({ profileDraft, setProfileDraft, complete, skip }) {
  const trapRef = useFocusTrap(true, { onEscape: skip });
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section
        ref={trapRef}
        className="onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div className="welcome-mark"><Brain size={30} aria-hidden="true" /></div>
        <h1 id="onboarding-title">Set up Peer</h1>
        <p>A tiny bit of context helps Peer start closer to how you actually learn.</p>
        <label>
          What are you studying?
          <input value={profileDraft.subject} onChange={(event) => setProfileDraft((current) => ({ ...current, subject: event.target.value }))} placeholder="Biology, history, Spanish, calculus, coding..." />
        </label>
        <label>
          What is your goal?
          <input value={profileDraft.goal} onChange={(event) => setProfileDraft((current) => ({ ...current, goal: event.target.value }))} placeholder="Pass an exam, speak with confidence, truly get calculus..." />
        </label>
        <label>
          Current level
          <select value={profileDraft.level} onChange={(event) => setProfileDraft((current) => ({ ...current, level: event.target.value }))}>
            {LEVEL_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label} - {option.hint}</option>)}
          </select>
        </label>
        <label>
          Language
          <LanguagePicker
            value={profileDraft.language}
            onChange={(language) => setProfileDraft((current) => ({ ...current, language }))}
          />
        </label>
        <label>
          How should Peer start?
          <select value={profileDraft.learningPreference} onChange={(event) => setProfileDraft((current) => ({ ...current, learningPreference: event.target.value }))}>
            {LEARNING_STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <div className="onboarding-actions">
          <button onClick={skip}>Skip</button>
          <button className="primary-button" onClick={complete}>Start learning</button>
        </div>
      </section>
    </div>
  );
}

// AI gate: sign-in prompt (401) or the daily-quota paywall (402).
function PaywallModal({ gate, onClose, onSignIn, onUpgrade }) {
  const trapRef = useFocusTrap(true, { onEscape: onClose });
  const quota = gate.code === "quota_exhausted";
  const details = gate.details || {};
  const pct = details.allowance ? Math.min(100, Math.round(((details.usedToday || 0) / details.allowance) * 100)) : 100;

  return (
    <div className="modal-backdrop confirm-backdrop" onClick={onClose}>
      <section
        ref={trapRef}
        className="confirm-dialog paywall-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        onClick={(event) => event.stopPropagation()}
      >
        {quota ? (
          <>
            <h2 id="paywall-title">You've used today's free AI</h2>
            <div className="paywall-meter" role="img" aria-label={`${pct}% of today's allowance used`}>
              <div style={{ width: `${pct}%` }} />
            </div>
            <p>
              Free includes {Math.round((details.allowance || 30000) / 1000)}k AI tokens every day — you've spent today's.
              It resets at midnight, or go Pro for a far bigger daily allowance and a smarter tutor model.
            </p>
            <ul className="paywall-perks">
              <li>Much larger daily AI allowance</li>
              <li>Smarter tutor model (deeper explanations)</li>
              <li>Priority for upcoming features</li>
            </ul>
            <div className="confirm-actions paywall-actions">
              <button type="button" onClick={onClose} data-autofocus>Come back tomorrow</button>
              <button type="button" className="primary-button" onClick={() => onUpgrade("monthly")}>Go Pro — $8.99/mo</button>
              <button type="button" className="primary-button" onClick={() => onUpgrade("yearly")}>$79/yr (2 months free)</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="paywall-title">Sign in to use the AI tutor</h2>
            <p>
              Peer's AI needs an account so your daily free allowance is yours alone.
              Signing in also backs up your subjects, notes, and progress.
            </p>
            <div className="confirm-actions paywall-actions">
              <button type="button" onClick={onClose}>Not now</button>
              <button type="button" className="primary-button" onClick={onSignIn} data-autofocus>Sign in — it's free</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ConfirmDialog({ request, onConfirm, onCancel }) {
  const trapRef = useFocusTrap(true, { onEscape: onCancel });
  return (
    <div className="modal-backdrop confirm-backdrop" onClick={onCancel}>
      <section
        ref={trapRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{request.title}</h2>
        <p id="confirm-dialog-body">{request.body}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel} data-autofocus>Cancel</button>
          <button type="button" className="danger-btn" onClick={onConfirm}>{request.confirmLabel || "Delete"}</button>
        </div>
      </section>
    </div>
  );
}

function CommandPalette({ query, setQuery, close, commands }) {
  const filtered = commands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase()));
  const [activeIndex, setActiveIndex] = useState(0);
  const trapRef = useFocusTrap(true, { onEscape: close });
  const listRef = useRef(null);
  const clampedIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  function moveActive(delta) {
    if (!filtered.length) return;
    const next = (clampedIndex + delta + filtered.length) % filtered.length;
    setActiveIndex(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  }

  function onInputKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter" && filtered[clampedIndex]) {
      event.preventDefault();
      filtered[clampedIndex].run();
      close();
    }
  }

  return (
    <div className="command-backdrop" onClick={close}>
      <section ref={trapRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(event) => event.stopPropagation()}>
        <div className="command-header">
          <span>Command menu</span>
          <button type="button" onClick={close} aria-label="Close command menu"><X size={16} /></button>
        </div>
        <div className="command-input">
          <Search size={17} aria-hidden="true" />
          <input
            autoFocus
            data-autofocus
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={onInputKeyDown}
            placeholder="Run a command..."
            aria-label="Search commands"
          />
        </div>
        <div className="command-list" ref={listRef}>
          {filtered.length ? filtered.map((command, index) => {
            const Icon = command.icon;
            return (
              <button
                key={command.label}
                className={index === clampedIndex ? "kbd-active" : ""}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => { command.run(); close(); }}
              >
                <Icon size={17} aria-hidden="true" />
                <span><strong>{command.label}</strong><small>{command.hint}</small></span>
              </button>
            );
          }) : (
            <div className="command-empty">
              <Search size={18} />
              <strong>No command found</strong>
              <small>Try a chat name, note keyword, or action like room, quiz, upload.</small>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function LanguagePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = LANGUAGE_OPTIONS.find((language) => language.value === value) || LANGUAGE_OPTIONS[0];

  // Close on outside click / Escape so the popover never sticks open.
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`language-picker ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="language-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="language-popover">
          {LANGUAGE_OPTIONS.map((language) => (
            <button
              type="button"
              key={language.value}
              className={language.value === value ? "active" : ""}
              onClick={() => {
                onChange(language.value);
                setOpen(false);
              }}
            >
              {language.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StreamingMessage({ content, streaming }) {
  const wasStreaming = useRef(streaming);
  const [displayed, setDisplayed] = useState(wasStreaming.current ? "" : content);
  const contentRef = useRef(content);
  contentRef.current = content;
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  const anchorRef = useRef(null);

  useEffect(() => {
    if (!wasStreaming.current) return undefined;
    const interval = setInterval(() => {
      setDisplayed((prev) => {
        const target = contentRef.current;
        const remaining = target.length - prev.length;
        if (remaining <= 0) {
          // Fully caught up and the stream is over: this reveal loop is done.
          if (!streamingRef.current) clearInterval(interval);
          return prev;
        }
        // catch-up reveal: fast for long bursts, still smooth for short ones
        const step = Math.max(4, Math.ceil(remaining / 5));
        return target.slice(0, prev.length + step);
      });
    }, 24);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!wasStreaming.current || !anchorRef.current) return;
    const container = anchorRef.current.closest(".messages");
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 140;
    if (nearBottom) container.scrollTop = container.scrollHeight;
  }, [displayed]);

  const showCursor = streaming || displayed.length < content.length;

  return (
    <>
      <Markdown text={displayed} />
      {showCursor && <span className="stream-cursor" aria-hidden="true" />}
      <span ref={anchorRef} />
    </>
  );
}

function FlashcardsPanel({ flashcards, projects, setView, deleteFlashcardDeck, gradeFlashcard }) {
  const [activeDeckId, setActiveDeckId] = useState(flashcards[0]?.id || null);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewDone, setReviewDone] = useState(0);

  const reviewQueue = useMemo(() => dueQueue(flashcards), [flashcards]);
  const due = reviewQueue.length;

  // Review mode always works the FRONT of the live due queue; grading reschedules
  // a card out of "due", so the queue shifts forward on its own.
  const reviewItem = reviewMode ? reviewQueue[0] : null;
  const deck = reviewMode
    ? flashcards.find((d) => d.id === reviewItem?.deckId) || null
    : flashcards.find((d) => d.id === activeDeckId) || flashcards[0] || null;
  const effectiveIndex = reviewMode ? (reviewItem?.index ?? 0) : cardIndex;
  const card = reviewMode ? reviewItem?.card : deck?.cards[cardIndex] || null;
  const project = projects.find((p) => p.id === deck?.projectId);
  const progress = reviewMode
    ? (reviewTotal ? (reviewDone / reviewTotal) * 100 : 100)
    : deck ? ((cardIndex + 1) / deck.cards.length) * 100 : 0;

  function startReview() { if (!due) return; setReviewMode(true); setReviewTotal(due); setReviewDone(0); setFlipped(false); }
  function exitReview() { setReviewMode(false); setFlipped(false); }

  function grade(g) {
    if (!deck || !card) return;
    gradeFlashcard(deck.id, effectiveIndex, g);
    setFlipped(false);
    if (reviewMode) {
      setReviewDone((n) => n + 1);
      if (due <= 1) setReviewMode(false); // graded the last due card
    } else {
      next();
    }
  }

  function selectDeck(id) {
    setActiveDeckId(id);
    setCardIndex(0);
    setFlipped(false);
    setReviewMode(false);
  }

  function next() {
    if (!deck) return;
    setFlipped(false);
    setCardIndex((i) => (i + 1) % deck.cards.length);
  }

  function prev() {
    if (!deck) return;
    setFlipped(false);
    setCardIndex((i) => (i - 1 + deck.cards.length) % deck.cards.length);
  }

  useEffect(() => {
    function onKey(e) {
      // Never hijack keys while the user is typing or a dialog is open.
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!flashcards.length) {
    return (
      <section className="flashcards-panel">
        <div className="page-heading">
          <div><h1>Flashcards</h1><p>Generate flashcard decks from AI answers in chat.</p></div>
        </div>
        <div className="empty-state">
          <BookOpen size={28} />
          <strong>No flashcards yet</strong>
          <span>Click "Make flashcards" on any AI answer to create a deck.</span>
          <button className="primary-button" onClick={() => setView("chat")}>Go to chat</button>
        </div>
      </section>
    );
  }

  return (
    <section className="flashcards-panel">
      <div className="page-heading">
        <div><h1>Flashcards</h1><p>{reviewMode ? "Review mode — grade each card so Peer can reschedule it" : "Flip to reveal, then grade to schedule your next review"}</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          {reviewMode ? (
            <button onClick={exitReview}>Exit review</button>
          ) : (
            <button className={due ? "fc-review-btn" : ""} onClick={startReview} disabled={!due}>
              {due ? `Review due (${due})` : "Nothing due"}
            </button>
          )}
          <button onClick={() => setView("chat")}>Back to chat</button>
        </div>
      </div>
      <div className="flashcards-layout">
        <div className="deck-list">
          {flashcards.map((d) => {
            const proj = projects.find((p) => p.id === d.projectId);
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                className={`deck-row ${d.id === activeDeckId ? "active" : ""}`}
                style={{ "--deck-color": proj?.color || "var(--accent)" }}
                onClick={() => selectDeck(d.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectDeck(d.id); } }}
              >
                <BookOpen size={15} />
                <span>
                  <strong>{d.chatName}</strong>
                  <small>{proj?.name ? `${proj.name} - ` : ""}{d.cards.length} cards</small>
                </span>
                <button
                  className="ghost-icon"
                  onClick={(e) => { e.stopPropagation(); deleteFlashcardDeck(d.id); }}
                  aria-label="Delete deck"
                ><Trash2 size={13} /></button>
              </div>
            );
          })}
        </div>

        {deck && card && (
          <div className="flashcard-area">
            <div className="flashcard-progress">
              <span className="fc-count">{reviewMode ? `${Math.min(reviewDone + 1, reviewTotal)} / ${reviewTotal} due` : <>{cardIndex + 1}<em> / {deck.cards.length}</em></>}</span>
              <div className="fc-progress-bar">
                <div className="fc-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              {project && <span className="project-dot" style={{ background: project.color }} />}
            </div>

            <div
              className="flashcard"
              onClick={() => setFlipped((f) => !f)}
              role="button"
              tabIndex={0}
              aria-label={flipped ? `Answer: ${card.answer}. Press Enter to show the question.` : `Question: ${card.question}. Press Enter to reveal the answer.`}
              onKeyDown={(e) => e.key === "Enter" && setFlipped((f) => !f)}
            >
              <div className={`flashcard-inner ${flipped ? "flipped" : ""}`}>
                <div className="flashcard-front">
                  <div key={`q-${deck.id}-${effectiveIndex}`} className="fc-content">
                    <span className="fc-label">Question</span>
                    <p>{card.question}</p>
                    <small>Click or Space to reveal</small>
                  </div>
                </div>
                <div className="flashcard-back">
                  <div key={`a-${deck.id}-${effectiveIndex}`} className="fc-content">
                    <span className="fc-label fc-label-answer">Answer</span>
                    <p>{card.answer}</p>
                    <small>Click to flip back</small>
                  </div>
                </div>
              </div>
            </div>

            {!reviewMode && (
              <div className="flashcard-nav">
                <button className="fc-nav-btn" onClick={prev} disabled={deck.cards.length <= 1}>Prev</button>
                <button className="fc-nav-btn fc-flip-btn" onClick={() => setFlipped((f) => !f)}>
                  {flipped ? "Show question" : "Reveal answer"}
                </button>
                <button className="fc-nav-btn" onClick={next} disabled={deck.cards.length <= 1}>Next</button>
              </div>
            )}

            {/* spaced-repetition grading */}
            <div className="fc-grade-row">
              <button className="fc-grade fc-grade-again" onClick={() => grade("again")}>
                <RotateCcw size={16} /> Still learning
              </button>
              <button className="fc-grade fc-grade-good" onClick={() => grade("good")}>
                <CheckCircle2 size={16} /> I know this
              </button>
            </div>
          </div>
        )}
        {reviewMode && !card && (
          <div className="flashcard-area"><div className="empty-state"><CheckCircle2 size={28} /><strong>Review complete</strong><span>You've cleared everything due. Nicely done.</span><button className="primary-button" onClick={exitReview}>Done</button></div></div>
        )}
      </div>
    </section>
  );
}

function parseFlashcards(text) {
  const cards = [];
  let currentQ = null;
  let currentALines = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("Q: ")) {
      if (currentQ !== null && currentALines.length) {
        cards.push({ id: uid(), question: currentQ, answer: currentALines.join(" ").trim() });
      }
      currentQ = line.slice(3).trim();
      currentALines = [];
    } else if (line.startsWith("A: ")) {
      currentALines.push(line.slice(3).trim());
    } else if (currentALines.length > 0 && line.trim()) {
      currentALines.push(line.trim());
    }
  }
  if (currentQ !== null && currentALines.length) {
    cards.push({ id: uid(), question: currentQ, answer: currentALines.join(" ").trim() });
  }
  return cards;
}

function buildFlashcardPrompt(title, content, domain = null) {
  const domainLine = domain && domain.id !== "general"
    ? `Shape the cards for ${domain.label}: prefer ${domain.practice}.${domain.id === "language" ? " Put the target-language word or phrase on Q and its meaning plus one example sentence on A." : ""}`
    : "Write questions that test understanding, not just word recall.";
  return [
    `Generate 5-8 study flashcards from "${title}".`,
    domainLine,
    "Output ONLY Q&A pairs in this exact format with no intro text or commentary:",
    "",
    "Q: [concise question]",
    "A: [clear answer]",
    "",
    "Source:",
    String(content || "").slice(0, 3500),
  ].join("\n");
}

function friendlyError(err, fallback = "Something went wrong. Try again.") {
  const message = String(err?.message || err || "");
  if (!message) return fallback;
  if (/Unexpected end of JSON input|Failed to execute 'json'|JSON\.parse|not valid JSON/i.test(message)) {
    return "The server returned an incomplete response. Try again in a moment.";
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "Peer could not reach the local AI server. Check that the dev server is running.";
  }
  return message;
}

function inferNoteTags(content) {
  const raw = String(content || "");
  const text = raw.toLowerCase();
  const tags = [];
  const checks = [
    ["formula", /\$[^$\n]+\$|\\\(|\\\[|\b(equation|formula|theorem|proof)\b/],
    ["definition", /\b(is defined as|refers to|definition|means that)\b/],
    ["example", /\b(for example|for instance|e\.g\.)\b/],
    ["steps", /\b(step \d|first,|then,|finally,|worked solution)\b/],
    ["dates", /\b1[0-9]{3}\b|\b20[0-2][0-9]\b/],
    ["vocab", /\b(vocabulary|conjugat|pronunciation|translation|plural|tense)\b/],
    ["visual", /\b(diagram|visual|analogy|model|flowchart|timeline)\b/],
    ["exam", /\b(exam|test|quiz|practice|recall|mnemonic)\b/],
    ["code", /```|\b(function|compile|bug|variable|algorithm)\b/],
  ];
  for (const [tag, regex] of checks) {
    if (regex.test(text) || (tag === "formula" && /\$[^$\n]+\$/.test(raw))) tags.push(tag);
  }
  return tags.length ? tags.slice(0, 4) : ["study"];
}


function seedPreferencesFromOnboarding(preferences, learningPreference) {
  const next = { ...(preferences || {}) };
  const keyMap = {
    visual: "visual",
    examples: "exampleFirst",
    socratic: "socratic",
    challenge: "gamified",
    code: "technical",
  };
  const key = keyMap[learningPreference];
  if (key) next[key] = Math.max(Number(next[key] || 0), 2);
  return next;
}

function getProfileInsights(profile) {
  const entries = Object.entries(profile.preferences || {});
  const [topStyle, topValue] = entries.sort((a, b) => b[1] - a[1])[0] || ["adaptive", 0];
  const totalSignals = Object.values(profile.signals || {}).reduce((sum, value) => sum + Number(value || 0), 0);

  if (!totalSignals) {
    return {
      headline: "Still learning your style",
      description: "Use feedback buttons after answers and Peer will start shaping explanations around what lands.",
    };
  }

  const labels = {
    simple: "simpler step-by-step explanations",
    technical: "precise technical language",
    visual: "analogies and visual models",
    socratic: "guided questions",
    gamified: "mini challenges",
    concise: "shorter explanations",
    exampleFirst: "examples before theory",
  };

  return {
    headline: `Likely preference: ${labels[topStyle] || topStyle}`,
    description: topValue
      ? `Peer has ${totalSignals} learning signal${totalSignals === 1 ? "" : "s"} and will bias toward ${labels[topStyle] || topStyle}.`
      : `Peer has ${totalSignals} learning signal${totalSignals === 1 ? "" : "s"} and is still balancing styles.`,
  };
}
