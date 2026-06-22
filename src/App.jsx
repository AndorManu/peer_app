import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
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
  Lightbulb,
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
import { buildSystemPrompt } from "./peerPrompt.js";
import { loadState, saveState, setSaveErrorHandler } from "./storage.js";
import {
  addReflection,
  applyFeedback,
  applyReflection,
  buildSessionRecap,
  buildSkillTree,
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
  COMMUNITY_CHALLENGES,
  DEPTH_OPTIONS,
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
  normalizeAccount,
  normalizeState,
  uid,
} from "./stateModel.js";

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [managedProjectId, setManagedProjectId] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
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
  const voiceModeRef = useRef(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  const activeChat = state.chats.find((chat) => chat.id === state.activeId) || state.chats[0];
  const activeProject = state.projects.find((project) => project.id === activeChat?.projectId) || null;
  const managedProject = state.projects.find((project) => project.id === managedProjectId) || null;
  const selectedDoc = managedProject?.docs.find((doc) => doc.id === selectedDocId) || managedProject?.docs[0] || null;
  const unfiledChats = state.chats.filter((chat) => !chat.projectId);
  const font = FONT_OPTIONS.find((option) => option.id === state.fontId) || FONT_OPTIONS[0];
  const activeMode = STUDY_MODES.find((mode) => mode.id === state.activeMode) || STUDY_MODES[0];
  const insights = getProfileInsights(state.profile);

  const appClass = useMemo(() => `app ${state.theme === "light" ? "theme-light" : "theme-dark"}`, [state.theme]);

  // Hydrate persisted state from IndexedDB once on mount, then resync the
  // onboarding draft so it reflects the loaded profile.
  useEffect(() => {
    let cancelled = false;
    setSaveErrorHandler((error) => {
      setToast({
        id: uid(),
        message:
          error?.name === "QuotaExceededError"
            ? "Local storage is full. Remove some documents or notes to keep saving."
            : "Could not save your latest changes locally.",
      });
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
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [activeChat?.messages, loading]);
  useEffect(() => {
    const onResize = () => setSidebarOpen(window.innerWidth >= 820);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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
  const showToast = (message) => {
    setToast({ id: uid(), message });
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(null), 2800);
  };

  function createChat(projectId = null) {
    const chat = makeChat(projectId);
    updateState((current) => ({ ...current, chats: [...current.chats, chat], activeId: chat.id }));
    setView("chat");
    if (window.innerWidth < 820) setSidebarOpen(false);
  }

  function deleteChat(id) {
    updateState((current) => {
      const remaining = current.chats.filter((chat) => chat.id !== id);
      if (!remaining.length) {
        const chat = makeChat();
        return { ...current, chats: [chat], activeId: chat.id };
      }
      return {
        ...current,
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
    updateState((current) => ({
      ...current,
      projects: [
        ...current.projects,
        { id, name, color: PROJECT_COLORS[current.projects.length % PROJECT_COLORS.length], docs: [], mastery: makeMastery() },
      ],
    }));
    setExpanded((current) => ({ ...current, [id]: true }));
    setNewProjectName("");
    showToast(`Project "${name}" created`);
  }

  function deleteProject(id) {
    updateState((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== id),
      chats: current.chats.map((chat) => chat.projectId === id ? { ...chat, projectId: null } : chat),
    }));
    setManagedProjectId(null);
    showToast("Project deleted");
  }

  async function handleMaterialInput(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !managedProject) return;
    await addMaterials(files, managedProject.id);
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
    updateState((current) => ({
      ...current,
      projects: [
        ...current.projects,
        { id: projectId, name, color: PROJECT_COLORS[current.projects.length % PROJECT_COLORS.length], docs: [], mastery: makeMastery() },
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
      projects: current.projects.map((project) => (
        project.id === projectId ? { ...project, docs: project.docs.filter((doc) => doc.id !== docId) } : project
      )),
    }));
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
          ? { ...project, mastery: updateMasteryFromFeedback(project.mastery, type, message.content) }
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: buildSystemPrompt(project, profileOverride, modeId, recipe),
        messages,
        imageDataUrls: imageAttachments.map((f) => ({ dataUrl: f.previewUrl, name: f.name })),
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "The AI request failed.");
    }

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
      ? { ...currentProject, mastery: updateMasteryFromMessage(currentProject.mastery, visibleContent) }
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
        speak(finalContent);
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
    updateState((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== noteId) }));
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

  function speak(text) {
    if (!voiceModeRef.current || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/#{1,3} /g, "")
      .replace(/^[-*] /gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    const langMap = { en: "en-US", nl: "nl-NL", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR", it: "it-IT", tr: "tr-TR", ar: "ar" };
    const langCode = langMap[state.profile.language] || "";
    if (langCode) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang.startsWith(langCode.slice(0, 2)));
      if (match) utterance.voice = match;
      utterance.lang = langCode;
    }
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Image generation failed.");
      const imgMsg = { id: uid(), role: "assistant", content: "Here's a visual representation:", imageUrl: data.url, createdAt: Date.now() };
      updateState((current) => ({
        ...current,
        chats: current.chats.map((chat) =>
          chat.id === activeChat.id ? { ...chat, messages: [...chat.messages, imgMsg] } : chat
        ),
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
    updateState((current) => ({ ...current, flashcards: current.flashcards.filter((deck) => deck.id !== id) }));
    showToast("Flashcard deck deleted");
  }

  async function makeFlashcards(message) {
    if (loading) return;
    setLoading(true);
    showToast("Generating flashcards...");
    try {
      const prompt = buildFlashcardPrompt("this explanation", message.content);
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
        [{ role: "user", content: buildFlashcardPrompt(title, content) }],
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
    if (profileDraft.subject.trim() && state.projects.length === 1 && state.projects[0].name === "C Programming") {
      updateState((current) => ({
        ...current,
        projects: current.projects.map((project, index) => index === 0 ? { ...project, name: profileDraft.subject.trim() } : project),
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

  function completeAccount(account) {
    updateState((current) => ({
      ...current,
      landingComplete: true,
      account: normalizeAccount({
        ...account,
        verified: true,
        lastLoginAt: Date.now(),
      }),
    }));
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

  function createStudyRoom(project = activeProject) {
    const topic = project?.name || state.profile.subject || "General study";
    const room = {
      id: uid(),
      name: `${topic} room`,
      topic,
      projectId: project?.id || null,
      members: 1,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    updateState((current) => ({ ...current, studyRooms: [room, ...current.studyRooms] }));
    setView("community");
    showToast(`Created ${room.name}`);
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
    { label: "Quiz mode", hint: "Ask one question at a time", icon: Target, run: () => updateState((current) => ({ ...current, activeMode: "quiz" })) },
    { label: "Challenge mode", hint: "Turn learning into levels", icon: Trophy, run: () => updateState((current) => ({ ...current, activeMode: "challenge" })) },
    { label: "Upload material", hint: "Open current project library", icon: Paperclip, run: () => activeProject && setManagedProjectId(activeProject.id) },
    { label: "Create study room", hint: activeProject ? `Room for ${activeProject.name}` : "Room for this subject", icon: Users, run: () => createStudyRoom() },
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
        style={{ "--app-font": font.family, "--text-size": `${state.textSize}px` }}
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
          "--app-font": font.family,
          "--text-size": `${state.textSize}px`,
        }}
      >
        <LandingAuthFlow complete={completeAccount} continueAsGuest={continueAsGuest} />
      </div>
    );
  }

  return (
    <div
      className={appClass}
      style={{
        "--app-font": font.family,
        "--text-size": `${state.textSize}px`,
      }}
    >
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

      {sidebarOpen && (
        <Sidebar
          state={state}
          activeChat={activeChat}
          expanded={expanded}
          setExpanded={setExpanded}
          unfiledChats={unfiledChats}
          chatSearch={chatSearch}
          setChatSearch={setChatSearch}
          createChat={createChat}
          deleteChat={deleteChat}
          editingChatId={editingChatId}
          editingName={editingName}
          setEditingName={setEditingName}
          startRename={(chat) => {
            setEditingChatId(chat.id);
            setEditingName(chat.name);
          }}
          renameChat={renameChat}
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
          }}
          setView={setView}
          view={view}
        />
      )}

      <main
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
          <button className="topbar-action" onClick={() => setView("brain")}>
            <Brain size={15} /> Brain
          </button>
          <button className="topbar-action" onClick={() => setView("profile")}>
            <UserRound size={15} /> Profile
          </button>
          {speaking && (
            <button className="topbar-action speaking-badge" onClick={stopSpeaking}>
              <Volume2 size={15} className="speaking-icon" /> Stop
            </button>
          )}
          <div className="status-pill"><span /> Local app</div>
        </header>

        {view === "settings" && <SettingsPanel state={state} updateState={updateState} resetData={resetData} />}
        {view === "profile" && <ProfilePanel profile={state.profile} activeProject={activeProject} activeChat={activeChat} insights={insights} activeMode={activeMode} updateState={updateState} />}
        {view === "brain" && <LearningBrainPanel state={state} activeProject={activeProject} setView={setView} updateState={updateState} setManagedProjectId={setManagedProjectId} setSelectedDocId={setSelectedDocId} />}
        {view === "notes" && <NotesPanel notes={state.notes} projects={state.projects} deleteNote={deleteNote} toggleShareNote={toggleShareNote} />}
        {view === "flashcards" && <FlashcardsPanel flashcards={state.flashcards} projects={state.projects} setView={setView} deleteFlashcardDeck={deleteFlashcardDeck} />}
        {view === "community" && (
          <SocialPanel
            state={state}
            activeProject={activeProject}
            createStudyRoom={createStudyRoom}
            toggleShareNote={toggleShareNote}
            toggleShareDeck={toggleShareDeck}
            startTeachBack={startTeachBack}
            startCommunityChallenge={startCommunityChallenge}
          />
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
            profileLanguage={state.profile.language}
            explanationDepth={state.profile.explanationDepth}
            setExplanationDepth={changeExplanationDepth}
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
          deleteProject={deleteProject}
          runDocAction={runDocAction}
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

      {toast && <div className="toast"><CheckCircle2 size={16} />{toast.message}</div>}
    </div>
  );
}

function LandingAuthFlow({ complete, continueAsGuest }) {
  const [step, setStep] = useState("intro");
  const [provider, setProvider] = useState(AUTH_PROVIDERS[0]);
  const [form, setForm] = useState({ name: "", email: "" });
  const [verificationCode, setVerificationCode] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [error, setError] = useState("");

  const selectedProvider = AUTH_PROVIDERS.find((item) => item.id === provider.id) || AUTH_PROVIDERS[0];

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function chooseProvider(nextProvider) {
    setProvider(nextProvider);
    setStep("account");
    setError("");
  }

  function sendVerification(event) {
    event.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    if (name.length < 2) {
      setError("Add your name so Peer can personalize the workspace.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Add a valid email address for verification.");
      return;
    }
    setVerificationCode(String(Math.floor(100000 + Math.random() * 900000)));
    setEnteredCode("");
    setStep("verify");
  }

  function verifyAccount(event) {
    event.preventDefault();
    if (enteredCode.trim() !== verificationCode) {
      setError("That code does not match. Check the demo code and try again.");
      return;
    }
    complete({
      id: uid(),
      name: form.name.trim(),
      email: form.email.trim(),
      provider: selectedProvider.id,
      createdAt: Date.now(),
    });
  }

  return (
    <section className="landing-shell">
      <div className="landing-hero">
        <div className="landing-brand">
          <PeerLogo size={30} />
          <span>peer</span>
        </div>
        <div className="landing-copy">
          <span className="landing-kicker">Adaptive peer-to-peer learning</span>
          <h1>Learn like you have a patient study partner beside you.</h1>
          <p>
            Peer watches how you ask questions, what confuses you, what clicks, and which examples help.
            Then it adapts explanations, quizzes, documents, notes, and teach-back practice around your actual learning pattern.
          </p>
        </div>
        <div className="landing-actions">
          <button className="primary-button" onClick={() => setStep("account")}>Create account</button>
          <button onClick={continueAsGuest}>Try local guest mode</button>
        </div>
        <div className="landing-points">
          <span><Sparkles size={15} /> Learns from feedback</span>
          <span><FileText size={15} /> Saves study materials</span>
          <span><ShieldCheckIcon /> Verified local profile</span>
        </div>
      </div>

      <div className="auth-panel">
        {step === "intro" && (
          <>
            <h2>How Peer works</h2>
            <div className="peer-steps">
              <span><strong>1</strong><b>You ask naturally</b><small>No learning-style quiz needed.</small></span>
              <span><strong>2</strong><b>Peer adapts</b><small>Shorter, deeper, visual, quiz, or teach-back depending on signals.</small></span>
              <span><strong>3</strong><b>Your memory grows</b><small>Projects track concepts, misconceptions, notes, and files.</small></span>
            </div>
            <button className="primary-button wide" onClick={() => setStep("account")}>Continue to account</button>
          </>
        )}

        {step === "account" && (
          <>
            <h2>Create your learning account</h2>
            <p className="auth-note">
              This local prototype stores only minimal account metadata in this browser. Real Google/Microsoft/GitHub login and encrypted cloud storage should be added with a backend before production.
            </p>
            <div className="provider-grid">
              {AUTH_PROVIDERS.map((item) => (
                <button key={item.id} className={selectedProvider.id === item.id ? "active" : ""} onClick={() => chooseProvider(item)}>
                  <span>{item.badge}</span>
                  <b>{item.label}</b>
                  <small>{item.hint}</small>
                </button>
              ))}
            </div>
            <form className="auth-form" onSubmit={sendVerification}>
              <label>
                Name
                <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Your name" />
              </label>
              <label>
                Email
                <input value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="you@example.com" />
              </label>
              {error && <div className="auth-error">{error}</div>}
              <button className="primary-button wide" type="submit">Send verification code</button>
            </form>
          </>
        )}

        {step === "verify" && (
          <>
            <h2>Verify your email</h2>
            <p className="auth-note">Enter the 6-digit code for {form.email}. In this local build, the demo code is shown below instead of sent by email.</p>
            <div className="demo-code"><span>Demo verification code</span><strong>{verificationCode}</strong></div>
            <form className="auth-form" onSubmit={verifyAccount}>
              <label>
                Verification code
                <input value={enteredCode} onChange={(event) => { setEnteredCode(event.target.value); setError(""); }} placeholder="123456" inputMode="numeric" maxLength={6} />
              </label>
              {error && <div className="auth-error">{error}</div>}
              <button className="primary-button wide" type="submit">Verify and enter Peer</button>
              <button type="button" className="auth-secondary" onClick={() => setStep("account")}>Back to account details</button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

function ShieldCheckIcon() {
  return <CheckCircle2 size={15} />;
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

  return (
    <aside className="sidebar">
      <div className="brand">
        <PeerLogo size={28} />
        <div>
          <strong>peer</strong>
          <span>learning terminal</span>
        </div>
      </div>

      <button className="primary-button" onClick={() => createChat()}>
        <Plus size={17} /> New chat
      </button>

      <div className="sidebar-search">
        <Search size={14} />
        <input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats..." />
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
            return (
              <div className="project-group" key={project.id}>
                <div
                  className="project-row"
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.currentTarget.classList.add("drag-over");
                  }}
                  onDragLeave={(event) => event.currentTarget.classList.remove("drag-over")}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.currentTarget.classList.remove("drag-over");
                    const chatId = event.dataTransfer.getData("text/peer-chat-id");
                    if (chatId) moveChatToProject(chatId, project.id);
                  }}
                >
                  <button className="project-toggle" onClick={() => setExpanded((current) => ({ ...current, [project.id]: !isOpen }))} aria-label="Toggle project">
                    <ChevronRight className={isOpen ? "rotated" : ""} size={15} />
                  </button>
                  <span className="project-dot" style={{ background: project.color }} />
                  <span className="project-name">{project.name}</span>
                  {project.docs.length > 0 && <span className="doc-count"><FileText size={12} />{project.docs.length}</span>}
                  <button className="ghost-icon" onClick={() => manageProject(project.id)} aria-label="Manage project"><Settings size={14} /></button>
                </div>
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
                        selectChat={selectChat}
                        startRename={startRename}
                        deleteChat={deleteChat}
                        draggable
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
                  selectChat={selectChat}
                  startRename={startRename}
                  deleteChat={deleteChat}
                  draggable
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

function ChatRow({ chat, active, editing, editingName, setEditingName, renameChat, selectChat, startRename, deleteChat, draggable }) {
  return (
    <div
      className={`chat-row ${active ? "active" : ""}`}
      draggable={draggable && !editing}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/peer-chat-id", chat.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => selectChat(chat.id)}
    >
      <MessageSquare size={15} />
      {editing ? (
        <input
          autoFocus
          value={editingName}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setEditingName(event.target.value)}
          onBlur={renameChat}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") renameChat();
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

function LearningBrainPanel({ state, activeProject, setView, updateState, setManagedProjectId, setSelectedDocId }) {
  const firstProjectId = state.projects[0]?.id || "";
  const [scope, setScope] = useState("global");
  const [projectId, setProjectId] = useState(activeProject?.id || firstProjectId);
  const [query, setQuery] = useState("");
  const [cameraReset, setCameraReset] = useState(0);
  const [filters, setFilters] = useState({
    projects: true,
    concepts: true,
    weak: true,
    files: true,
    notes: true,
    chats: true,
    quizzes: true,
  });
  const [selectedNodeId, setSelectedNodeId] = useState("");

  useEffect(() => {
    if (!projectId && firstProjectId) setProjectId(firstProjectId);
  }, [firstProjectId, projectId]);

  const focusedProject = scope === "project"
    ? state.projects.find((item) => item.id === projectId) || state.projects[0] || null
    : null;
  const graph = useMemo(
    () => buildLearningBrainGraph(state, focusedProject, filters, { query }),
    [state, focusedProject, filters, query]
  );
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || graph.nodes[0] || null;

  useEffect(() => {
    if (!graph.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(graph.nodes[0]?.id || "");
    }
  }, [graph.nodes, selectedNodeId]);

  function toggleFilter(key) {
    setFilters((current) => ({ ...current, [key]: !current[key] }));
  }

  function openNode(node) {
    if (!node) return;
    if (node.type === "brain") {
      setView("profile");
      return;
    }
    if (node.type === "project") {
      setScope("project");
      setProjectId(node.sourceId || node.projectId);
      setSelectedNodeId("");
      setCameraReset((value) => value + 1);
      return;
    }
    if (node.type === "chat") {
      updateState((current) => ({ ...current, activeId: node.sourceId }));
      setView("chat");
    }
    if (node.type === "file") {
      setManagedProjectId(node.projectId);
      setSelectedDocId(node.sourceId);
    }
    if (node.type === "note") setView("notes");
    if (node.type === "quiz") setView("flashcards");
  }

  return (
    <section className="learning-brain-panel">
      <div className="brain-heading">
        <div>
          <span className="brain-kicker"><GitBranch size={14} /> Learning graph</span>
          <h1>Learning brain</h1>
          <p>Peer maps every project, concept, weak spot, file, note, deck, and chat into one navigable system.</p>
        </div>
        <div className="brain-summary">
          <span><strong>{graph.summary.projects}</strong> projects</span>
          <span><strong>{graph.summary.concepts}</strong> concepts</span>
          <span><strong>{graph.summary.weak}</strong> weak spots</span>
          <span><strong>{graph.summary.sources}</strong> sources</span>
        </div>
      </div>

      <div className="brain-toolbar">
        <div className="brain-toolbar-fields">
          <label>
            Scope
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="global">All projects</option>
              <option value="project">Single project</option>
            </select>
          </label>
          <label>
            Project
            <select
              value={projectId}
              disabled={scope === "global"}
              onChange={(event) => {
                setProjectId(event.target.value);
                setCameraReset((value) => value + 1);
              }}
            >
              {state.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="brain-search">
            Search brain
            <span>
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Concept, file, chat..." />
            </span>
          </label>
        </div>
        <div className="brain-filter-row">
          {[
            ["projects", "Projects"],
            ["concepts", "Concepts"],
            ["weak", "Weak spots"],
            ["files", "Files"],
            ["notes", "Notes"],
            ["chats", "Chats"],
            ["quizzes", "Quizzes"],
          ].map(([key, label]) => (
            <button key={key} className={filters[key] ? "active" : ""} onClick={() => toggleFilter(key)}>
              {label}
            </button>
          ))}
          <button className="brain-reset-view" onClick={() => setCameraReset((value) => value + 1)}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      <div className="brain-workspace">
        <div className="brain-map-card">
          <div className="brain-map-legend" aria-hidden="true">
            <span><i className="brain-dot project" /> Project</span>
            <span><i className="brain-dot concept" /> Concept</span>
            <span><i className="brain-dot weak" /> Weak</span>
            <span><i className="brain-dot file" /> File</span>
            <span><i className="brain-dot note" /> Note</span>
            <span><i className="brain-dot chat" /> Chat</span>
            <span><i className="brain-dot quiz" /> Quiz</span>
          </div>
          <ThreeBrainMap
            graph={graph}
            selectedNodeId={selectedNode?.id || ""}
            setSelectedNodeId={setSelectedNodeId}
            resetSignal={cameraReset}
          />
        </div>

        <aside className="brain-detail">
          {selectedNode ? (
            <>
              <span className={`brain-detail-type ${selectedNode.type}`}>{nodeTypeLabel(selectedNode)}</span>
              <h2>{selectedNode.label}</h2>
              <p>{selectedNode.description}</p>
              <div className="brain-detail-metrics">
                <span><strong>{selectedNode.status || "active"}</strong>Status</span>
                {selectedNode.confidence != null && <span><strong>{Math.round(selectedNode.confidence * 100)}%</strong>Mastery</span>}
                {selectedNode.updatedAt && <span><strong>{relativeDate(selectedNode.updatedAt)}</strong>Updated</span>}
              </div>
              {selectedNode.evidence && (
                <div className="brain-evidence">
                  <strong>Why Peer linked this</strong>
                  <p>{selectedNode.evidence}</p>
                </div>
              )}
              {selectedNode.related.length > 0 && (
                <div className="brain-related">
                  <strong>Connected to</strong>
                  {selectedNode.related.slice(0, 6).map((item) => (
                    <button key={item.id} onClick={() => setSelectedNodeId(item.id)}>
                      <span className={`brain-dot ${item.type}`} />
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
              <button className="brain-open-btn" onClick={() => openNode(selectedNode)}>
                {selectedNode.type === "brain"
                  ? "Open profile"
                  : selectedNode.type === "project"
                    ? "Focus project"
                    : selectedNode.type === "concept" || selectedNode.type === "weak"
                      ? "Inspect connections"
                      : "Open source"}
              </button>
            </>
          ) : (
            <div className="empty-state compact">
              <Brain size={28} />
              <strong>No brain nodes yet</strong>
              <span>Start a chat or drop materials into a project to grow the graph.</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

const BRAIN_PALETTE = {
  brain: { core: 0x86d8ff, glow: 0x49bdff },
  project: { core: 0xb9a3ff, glow: 0x8a6bff },
  concept: { core: 0x57d8ff, glow: 0x2bb8ff },
  weak: { core: 0xff7d9c, glow: 0xff4d74 },
  file: { core: 0x6ba6ff, glow: 0x3d7bff },
  note: { core: 0xffcd86, glow: 0xffab47 },
  chat: { core: 0x66e9c9, glow: 0x2fd4aa },
  quiz: { core: 0xa6e981, glow: 0x76d44f },
};

function brainPalette(type) {
  return BRAIN_PALETTE[type] || BRAIN_PALETTE.concept;
}

function brainNodeRadius(node) {
  if (node.type === "brain") return 1.3;
  if (node.type === "project") return 0.78;
  const confidence = Number(node.confidence ?? 0.4);
  const base = node.type === "weak" ? 0.4 : 0.32;
  return base + Math.max(0, Math.min(1, confidence)) * 0.36;
}

function brainLinkRest(link, nodeMap) {
  if (link.kind === "related") return 4.6;
  const source = nodeMap.get(link.source);
  if (source?.type === "brain") return 7;
  if (source?.type === "project") return 5.2;
  return 6;
}

function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.28)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ThreeBrainMap({ graph, selectedNodeId, setSelectedNodeId, resetSignal }) {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const positionsRef = useRef(new Map());
  const setSelectedRef = useRef(setSelectedNodeId);
  const [labels, setLabels] = useState([]);

  useEffect(() => {
    setSelectedRef.current = setSelectedNodeId;
  }, [setSelectedNodeId]);

  // Mount-once engine: renderer, scene, camera, lights, simulation, interaction.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070d, 0.014);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xcfe9ff, 1.05));
    const key = new THREE.PointLight(0x69d9ff, 1.6, 0, 1.4);
    key.position.set(-8, 9, 16);
    scene.add(key);
    const warm = new THREE.PointLight(0xffd6a0, 0.7, 0, 1.6);
    warm.position.set(10, -6, 10);
    scene.add(warm);

    const glowTexture = makeGlowTexture();
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 22);

    // Soft focal haze behind the graph.
    const hazeMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: 0x0f3149, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const haze = new THREE.Sprite(hazeMaterial);
    haze.scale.setScalar(52);
    haze.position.set(0, 0, -8);
    scene.add(haze);

    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);

    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lineSegments);

    // ---- Simulation + render state ----
    const state = {
      nodes: [],
      links: [],
      index: new Map(),
      nodeMap: new Map(),
      adjacency: new Map(),
      pos: [],
      vel: [],
      forces: [],
      meshes: [],
      materials: [],
      glows: [],
      glowMaterials: [],
      baseRadius: [],
      linePositions: null,
      lineColors: null,
      alpha: 1,
      hovered: null,
      selected: "",
      pinned: -1,
      dragMoved: false,
    };

    const cam = { radius: 26, theta: 0.7, phi: 1.12, target: new THREE.Vector3() };
    const goal = { radius: 26, theta: 0.7, phi: 1.12, target: new THREE.Vector3() };
    let autoFit = true;

    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    const projV = new THREE.Vector3();
    const dragPlane = new THREE.Plane();
    const dragPoint = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pointerState = { down: false, mode: "idle", x: 0, y: 0 };
    let frame = 0;
    let animationId = 0;

    function disposeGraph() {
      for (const mesh of state.meshes) nodeGroup.remove(mesh);
      for (const glow of state.glows) nodeGroup.remove(glow);
      for (const material of state.materials) material.dispose();
      for (const material of state.glowMaterials) material.dispose();
      state.meshes = [];
      state.glows = [];
      state.materials = [];
      state.glowMaterials = [];
    }

    function seedPosition(node, idx) {
      const saved = positionsRef.current.get(node.id);
      if (saved) return new THREE.Vector3(saved.x, saved.y, saved.z);
      if (idx === 0) return new THREE.Vector3(0, 0, 0);
      const ring = node.type === "project" ? 6 : 9 + Math.random() * 4;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      return new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * ring,
        Math.cos(phi) * ring * 0.7,
        Math.sin(phi) * Math.sin(theta) * ring,
      );
    }

    function setGraph(graphData) {
     try {
      disposeGraph();
      const nodes = graphData.nodes || [];
      state.nodes = nodes;
      state.nodeMap = graphData.nodeMap || new Map(nodes.map((node) => [node.id, node]));
      state.index = new Map(nodes.map((node, i) => [node.id, i]));
      state.links = (graphData.links || []).filter((link) => state.index.has(link.source) && state.index.has(link.target));

      const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
      for (const link of state.links) {
        adjacency.get(link.source).add(link.target);
        adjacency.get(link.target).add(link.source);
      }
      state.adjacency = adjacency;

      state.pos = nodes.map((node, i) => seedPosition(node, i));
      state.vel = nodes.map(() => new THREE.Vector3());
      state.forces = nodes.map(() => new THREE.Vector3());
      state.baseRadius = nodes.map((node) => brainNodeRadius(node));

      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const palette = brainPalette(node.type);
        const radius = state.baseRadius[i];
        const material = new THREE.MeshStandardMaterial({
          color: palette.core,
          emissive: palette.core,
          emissiveIntensity: node.type === "brain" ? 0.5 : node.type === "project" ? 0.46 : 0.4,
          roughness: 0.4,
          metalness: 0.0,
          transparent: true,
          opacity: 1,
        });
        const mesh = new THREE.Mesh(sphereGeometry, material);
        mesh.scale.setScalar(radius);
        mesh.position.copy(state.pos[i]);
        mesh.userData = { id: node.id, i };
        nodeGroup.add(mesh);
        state.meshes.push(mesh);
        state.materials.push(material);

        const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: palette.glow, transparent: true, opacity: 0.52, blending: THREE.AdditiveBlending, depthWrite: false });
        const glow = new THREE.Sprite(glowMaterial);
        const glowScale = radius * (node.type === "brain" ? 4 : node.type === "project" ? 3.8 : 3.4);
        glow.scale.setScalar(glowScale);
        glow.position.copy(state.pos[i]);
        nodeGroup.add(glow);
        state.glows.push(glow);
        state.glowMaterials.push(glowMaterial);
      }

      const linkCount = state.links.length;
      state.linePositions = new Float32Array(linkCount * 6);
      state.lineColors = new Float32Array(linkCount * 6);
      lineGeometry.setAttribute("position", new THREE.BufferAttribute(state.linePositions, 3));
      lineGeometry.setAttribute("color", new THREE.BufferAttribute(state.lineColors, 3));
      lineGeometry.setDrawRange(0, linkCount * 2);

      state.alpha = 1;
      updateLinkColors();
      updateNodeEmphasis(true);
     } catch (err) {
      console.error("brain setGraph failed:", err);
     }
    }

    // Hovering a node focuses the graph on its neighbourhood. Selection (from the
    // side panel) only emphasises a single node and never dims the rest.
    function hoverSet() {
      const focus = state.hovered;
      if (!focus || !state.adjacency.has(focus)) return null;
      const set = new Set(state.adjacency.get(focus));
      set.add(focus);
      return set;
    }

    function updateLinkColors() {
      if (!state.lineColors) return;
      const set = hoverSet();
      const colors = state.lineColors;
      for (let i = 0; i < state.links.length; i += 1) {
        const link = state.links[i];
        const related = link.kind === "related";
        let r;
        let g;
        let b;
        const touches = set ? (set.has(link.source) && set.has(link.target)) : false;
        if (set && touches) {
          if (related) { r = 0.34; g = 1.0; b = 0.8; } else { r = 0.46; g = 0.78; b = 1.0; }
        } else if (set) {
          r = 0.05; g = 0.08; b = 0.12;
        } else if (related) {
          r = 0.15; g = 0.44; b = 0.38;
        } else {
          r = 0.17; g = 0.28; b = 0.4;
        }
        const o = i * 6;
        colors[o] = r; colors[o + 1] = g; colors[o + 2] = b;
        colors[o + 3] = r; colors[o + 4] = g; colors[o + 5] = b;
      }
      lineGeometry.getAttribute("color").needsUpdate = true;
    }

    function updateNodeEmphasis(immediate) {
      const set = hoverSet();
      for (let i = 0; i < state.meshes.length; i += 1) {
        const node = state.nodes[i];
        const inSet = set ? set.has(node.id) : true;
        const isHot = node.id === state.hovered || node.id === state.selected;
        const targetOpacity = set ? (inSet ? 1 : 0.14) : 1;
        const baseEmissive = node.type === "brain" ? 0.5 : node.type === "project" ? 0.46 : 0.4;
        const targetEmissive = isHot ? 0.95 : inSet ? baseEmissive : baseEmissive * 0.45;
        const targetScale = (isHot ? 1.4 : 1) * state.baseRadius[i];
        const material = state.materials[i];
        const glowMaterial = state.glowMaterials[i];
        if (immediate) {
          material.opacity = targetOpacity;
          material.emissiveIntensity = targetEmissive;
          state.meshes[i].scale.setScalar(targetScale);
        }
        material.userData = { targetOpacity, targetEmissive, targetScale };
        glowMaterial.userData = { targetOpacity: set ? (inSet ? 0.6 : 0.06) : 0.52 };
      }
    }

    function applyForces(dt) {
      const { pos, vel, forces, nodes, links } = state;
      const n = nodes.length;
      for (let i = 0; i < n; i += 1) forces[i].set(0, 0, 0);

      const repulsion = 26;
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          tmpDir.subVectors(pos[i], pos[j]);
          let distSq = tmpDir.lengthSq();
          if (distSq > 900) continue;
          if (distSq < 0.05) { distSq = 0.05; tmpDir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5); }
          const dist = Math.sqrt(distSq);
          const force = repulsion / distSq;
          tmpDir.multiplyScalar(force / dist);
          forces[i].add(tmpDir);
          forces[j].sub(tmpDir);
        }
      }

      const spring = 0.055;
      for (const link of links) {
        const a = state.index.get(link.source);
        const b = state.index.get(link.target);
        tmpDir.subVectors(pos[b], pos[a]);
        const dist = Math.max(0.01, tmpDir.length());
        const rest = brainLinkRest(link, state.nodeMap);
        const force = (dist - rest) * spring * (link.kind === "related" ? 1.3 : 1);
        tmpDir.multiplyScalar(force / dist);
        forces[a].add(tmpDir);
        forces[b].sub(tmpDir);
      }

      const gravity = 0.03;
      for (let i = 0; i < n; i += 1) {
        tmpA.copy(pos[i]).multiplyScalar(-gravity);
        forces[i].add(tmpA);
      }

      const damping = 0.8;
      for (let i = 0; i < n; i += 1) {
        if (i === 0 || i === state.pinned) continue;
        vel[i].add(tmpB.copy(forces[i]).multiplyScalar(state.alpha * dt));
        vel[i].multiplyScalar(damping);
        pos[i].add(tmpA.copy(vel[i]).multiplyScalar(dt));
      }
      if (n > 0) {
        pos[0].set(0, 0, 0);
        vel[0].set(0, 0, 0);
      }
    }

    function updateProjectionLabels() {
      const width = renderer.domElement.clientWidth;
      const height = renderer.domElement.clientHeight;
      const set = hoverSet();
      const zoomedIn = cam.radius < 22;
      const knowledgeTypes = new Set(["brain", "project", "concept", "weak"]);
      const next = [];
      for (let i = 0; i < state.nodes.length; i += 1) {
        const node = state.nodes[i];
        projV.copy(state.pos[i]).project(camera);
        if (projV.z >= 1) continue; // behind the camera
        // Always label the meaningful "knowledge" nodes; reveal source nodes on
        // hover, on selection, or when zoomed in close.
        let show = knowledgeTypes.has(node.type) || zoomedIn;
        if (set) show = set.has(node.id) || knowledgeTypes.has(node.type); // hover: neighbourhood + concept map
        if (node.id === state.selected || node.id === state.hovered) show = true;
        if (!show) continue;
        const strong = node.id === state.hovered || node.id === state.selected || node.type === "brain";
        next.push({
          id: node.id,
          label: node.label,
          type: node.type,
          strong,
          dim: set ? !set.has(node.id) : false,
          x: (projV.x * 0.5 + 0.5) * width,
          y: (-projV.y * 0.5 + 0.5) * height,
        });
      }
      setLabels(next);
    }

    function tick() {
      animationId = requestAnimationFrame(tick);
      frame += 1;
      const dt = 0.85;
      hazeMaterial.opacity = 0.26 + Math.sin(frame * 0.018) * 0.06;

      const ready = state.nodes.length > 0
        && state.pos.length === state.nodes.length
        && state.forces.length === state.nodes.length
        && state.meshes.length === state.nodes.length;

      const simActive = (state.alpha > 0.025 || state.pinned >= 0) && ready;
      if (simActive) {
        applyForces(dt);
        if (state.pinned < 0) state.alpha *= 0.98;
      }

      // Push positions to meshes + glows.
      if (ready) for (let i = 0; i < state.meshes.length; i += 1) {
        state.meshes[i].position.copy(state.pos[i]);
        state.glows[i].position.copy(state.pos[i]);
        const material = state.materials[i];
        const mUd = material.userData;
        if (mUd && mUd.targetOpacity != null) {
          material.opacity += (mUd.targetOpacity - material.opacity) * 0.16;
          material.emissiveIntensity += (mUd.targetEmissive - material.emissiveIntensity) * 0.16;
          const mesh = state.meshes[i];
          const s = mesh.scale.x + (mUd.targetScale - mesh.scale.x) * 0.18;
          mesh.scale.setScalar(s);
        }
        const gUd = state.glowMaterials[i].userData;
        if (gUd && gUd.targetOpacity != null) {
          state.glowMaterials[i].opacity += (gUd.targetOpacity - state.glowMaterials[i].opacity) * 0.16;
        }
      }

      // Update link endpoints.
      if (ready && state.linePositions) {
        const positions = state.linePositions;
        for (let i = 0; i < state.links.length; i += 1) {
          const a = state.index.get(state.links[i].source);
          const b = state.index.get(state.links[i].target);
          const o = i * 6;
          positions[o] = state.pos[a].x; positions[o + 1] = state.pos[a].y; positions[o + 2] = state.pos[a].z;
          positions[o + 3] = state.pos[b].x; positions[o + 4] = state.pos[b].y; positions[o + 5] = state.pos[b].z;
        }
        lineGeometry.getAttribute("position").needsUpdate = true;
      }

      // Frame the whole graph until the user takes control of zoom.
      if (autoFit && ready) {
        let maxSq = 4;
        for (let i = 0; i < state.pos.length; i += 1) {
          const d = state.pos[i].lengthSq();
          if (d > maxSq) maxSq = d;
        }
        const fit = Math.max(15, Math.min(58, Math.sqrt(maxSq) * 2.15 + 5));
        goal.radius += (fit - goal.radius) * 0.05;
      }

      // Smooth camera toward goal.
      cam.theta += (goal.theta - cam.theta) * 0.08;
      cam.phi += (goal.phi - cam.phi) * 0.08;
      cam.radius += (goal.radius - cam.radius) * 0.08;
      cam.target.lerp(goal.target, 0.08);
      const sinPhi = Math.sin(cam.phi);
      camera.position.set(
        cam.target.x + cam.radius * sinPhi * Math.cos(cam.theta),
        cam.target.y + cam.radius * Math.cos(cam.phi),
        cam.target.z + cam.radius * sinPhi * Math.sin(cam.theta),
      );
      camera.lookAt(cam.target);

      renderer.render(scene, camera);

      if (ready && frame % 3 === 0) updateProjectionLabels();
      if (ready && frame % 30 === 0) savePositions();
    }

    function savePositions() {
      for (let i = 0; i < state.nodes.length; i += 1) {
        const p = state.pos[i];
        if (!p) continue;
        positionsRef.current.set(state.nodes[i].id, { x: p.x, y: p.y, z: p.z });
      }
    }

    function setNdc(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickMesh(event) {
      setNdc(event);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(state.meshes, false)[0];
      return hit ? hit.object : null;
    }

    function onPointerDown(event) {
      pointerState.down = true;
      pointerState.x = event.clientX;
      pointerState.y = event.clientY;
      state.dragMoved = false;
      const mesh = pickMesh(event);
      if (mesh) {
        pointerState.mode = "node";
        state.pinned = mesh.userData.i;
        camera.getWorldDirection(tmpDir);
        dragPlane.setFromNormalAndCoplanarPoint(tmpDir, state.pos[state.pinned]);
      } else {
        pointerState.mode = "orbit";
      }
      renderer.domElement.setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event) {
      if (!pointerState.down) {
        // Hover detection.
        const mesh = pickMesh(event);
        const id = mesh ? mesh.userData.id : null;
        if (id !== state.hovered) {
          state.hovered = id;
          renderer.domElement.style.cursor = id ? "pointer" : "grab";
          updateNodeEmphasis(false);
          updateLinkColors();
        }
        return;
      }
      const dx = event.clientX - pointerState.x;
      const dy = event.clientY - pointerState.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) state.dragMoved = true;
      pointerState.x = event.clientX;
      pointerState.y = event.clientY;
      if (pointerState.mode === "node" && state.pinned >= 0) {
        setNdc(event);
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          state.pos[state.pinned].copy(dragPoint);
          state.vel[state.pinned].set(0, 0, 0);
        }
      } else {
        goal.theta -= dx * 0.006;
        goal.phi = Math.max(0.25, Math.min(Math.PI - 0.25, goal.phi - dy * 0.006));
      }
    }

    function onPointerUp(event) {
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      if (pointerState.mode === "node" && !state.dragMoved) {
        const mesh = pickMesh(event);
        if (mesh) setSelectedRef.current(mesh.userData.id);
      }
      if (state.pinned >= 0) state.alpha = Math.max(state.alpha, 0.45);
      state.pinned = -1;
      pointerState.down = false;
      pointerState.mode = "idle";
    }

    function onWheel(event) {
      event.preventDefault();
      autoFit = false;
      goal.radius = Math.max(11, Math.min(64, goal.radius + event.deltaY * 0.02));
    }

    function resize() {
      const width = Math.max(320, mount.clientWidth);
      const height = Math.max(360, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    const engine = {
      setGraph,
      focus(id) {
        state.selected = id || "";
        updateNodeEmphasis(false);
        updateLinkColors();
      },
      resetCamera() {
        autoFit = true;
        goal.theta = 0.7;
        goal.phi = 1.12;
        goal.target.set(0, 0, 0);
      },
    };
    engineRef.current = engine;

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    tick();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      disposeGraph();
      sphereGeometry.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      hazeMaterial.dispose();
      glowTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engineRef.current = null;
    };
  }, []);

  // Rebuild graph objects when the graph changes (without tearing down WebGL).
  useEffect(() => {
    if (engineRef.current) engineRef.current.setGraph(graph);
  }, [graph]);

  // Focus the externally selected node.
  useEffect(() => {
    if (engineRef.current) engineRef.current.focus(selectedNodeId);
  }, [selectedNodeId]);

  // Camera reset signal.
  useEffect(() => {
    if (engineRef.current && resetSignal) engineRef.current.resetCamera();
  }, [resetSignal]);

  return (
    <div className="brain-3d-shell">
      <div ref={mountRef} className="brain-3d-canvas" />
      <div className="brain-3d-labels" aria-hidden="true">
        {labels.map((label) => (
          <span
            key={label.id}
            className={`brain-node-label ${label.type} ${label.strong ? "strong" : ""} ${label.dim ? "dim" : ""}`}
            style={{ transform: `translate3d(${label.x}px, ${label.y}px, 0) translate(-50%, 14px)` }}
          >
            <i className="brain-node-dot" />
            {shortLabel(label.label, label.type === "brain" || label.type === "project" ? 30 : 24)}
          </span>
        ))}
      </div>
      <div className="brain-3d-help">
        <span>Drag to orbit</span>
        <span>Scroll to zoom</span>
        <span>Drag a node to pull it</span>
      </div>
    </div>
  );
}

function ChatArea({ activeChat, activeProject, activeMode, loading, error, sendMessage, bottomRef, handleFeedback, saveNote, regenerateFrom, startTeachBack, reflectSession, makeFlashcards, generateImage, requestVisualBlueprint }) {
  if (!activeChat?.messages.length) {
    return (
      <section className="welcome">
        <div className="welcome-mark"><Brain size={31} /></div>
        <h1>{activeProject ? `Studying ${activeProject.name}` : "What do you want to understand?"}</h1>
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
        {error && <div className="inline-error">{error}</div>}
      </section>
    );
  }

  return (
    <section className="messages">
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
            {message.imageUrl && <img className="message-image" src={message.imageUrl} alt="Generated visual" />}
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
          <div className="avatar"><Brain size={17} /></div>
          <div className="typing"><span /><span /><span /></div>
        </article>
      )}
      {error && <div className="inline-error">{error}</div>}
      <div ref={bottomRef} />
    </section>
  );
}

function MessageActions({ message, index, handleFeedback, saveNote, regenerateFrom, sendMessage, makeFlashcards, generateImage, requestVisualBlueprint }) {
  return (
    <div className="message-actions">
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
  profileLanguage,
  explanationDepth,
  setExplanationDepth,
}) {
  const attachRef = useRef(null);
  const recognitionRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const hasSpeech = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const activeModeIndex = STUDY_MODES.findIndex((mode) => mode.id === activeMode.id);

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    if (speaking) stopSpeaking();
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.lang = SPEECH_LANG_MAP[profileLanguage] || "en-US";
    rec.continuous = Boolean(voiceMode);
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setRecording(false);
      sendMessage(transcript);
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
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
          placeholder={recording ? "Listening..." : activeProject ? `Ask about ${activeProject.name}...` : "Ask a question or explain what you are stuck on..."}
          rows={1}
        />
        {hasSpeech && (
          <button
            className={`mic-button ${recording ? "recording" : ""}`}
            onClick={toggleRecording}
            aria-label={recording ? "Stop recording" : speaking ? "Interrupt and speak" : "Speak your question"}
            title={speaking ? "Interrupt Peer and speak" : "Speak your question"}
          >
            {recording ? <MicOff size={17} /> : <Mic size={17} />}
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
      </div>
    </footer>
  );
}

function ProfilePanel({ profile, activeProject, activeChat, insights, activeMode, updateState }) {
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
              <input value={profile.subject} onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, subject: event.target.value } }))} placeholder="C programming, biology, calculus..." />
            </label>
            <label>
              Goal
              <input value={profile.goal} onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, goal: event.target.value } }))} placeholder="Pass an exam, understand pointers, prepare for Codam..." />
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

function NotesPanel({ notes, projects, deleteNote, toggleShareNote }) {
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
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes, tags, concepts..." />
        </label>
        <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
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
                          <button onClick={() => toggleShareNote(note.id)} title={note.shared ? "Unshare note" : "Share note locally"}><Share2 size={14} /></button>
                          <button onClick={() => deleteNote(note.id)}><Trash2 size={14} /></button>
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

function SocialPanel({ state, activeProject, createStudyRoom, toggleShareNote, toggleShareDeck, startTeachBack, startCommunityChallenge }) {
  const sharedNotes = state.notes.filter((note) => note.shared);
  const sharedDecks = state.flashcards.filter((deck) => deck.shared);
  const subject = activeProject?.name || state.profile.subject || "your subject";
  const buddyMatches = buildBuddyMatches(state.profile, activeProject);

  return (
    <section className="social-panel">
      <div className="page-heading">
        <div>
          <h1>Peer rooms</h1>
          <p>Local prototype for study rooms, buddy matching, shared decks, and teach-back practice.</p>
        </div>
        <button onClick={() => createStudyRoom(activeProject)}><Users size={15} /> Create room</button>
      </div>

      <div className="social-grid">
        <div className="profile-card wide">
          <h2>Study rooms</h2>
          {state.studyRooms.length ? (
            <div className="room-list">
              {state.studyRooms.map((room) => (
                <article className="room-card" key={room.id}>
                  <span><Users size={17} /></span>
                  <div>
                    <strong>{room.name}</strong>
                    <small>{room.topic} - {room.members} member{room.members === 1 ? "" : "s"} - local room</small>
                  </div>
                  <button onClick={startTeachBack}>Teach back</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <Users size={24} />
              <strong>No rooms yet</strong>
              <span>Create a local room for {subject}, then use teach-back or shared notes inside it.</span>
            </div>
          )}
        </div>

        <div className="profile-card wide">
          <h2>AI-matched study buddies</h2>
          <div className="buddy-grid">
            {buddyMatches.map((buddy) => (
              <article className="buddy-card" key={buddy.id}>
                <div className="account-avatar">{buddy.initials}</div>
                <strong>{buddy.name}</strong>
                <p>{buddy.reason}</p>
                <small>{buddy.fit}</small>
              </article>
            ))}
          </div>
        </div>

        <div className="profile-card wide">
          <h2>Shared notes and decks</h2>
          <div className="shared-assets">
            <div>
              <strong>Notes</strong>
              {state.notes.length ? state.notes.slice(0, 4).map((note) => (
                <button key={note.id} onClick={() => toggleShareNote(note.id)}>
                  <Share2 size={14} />
                  {note.shared ? "Shared" : "Share"} - {note.title}
                </button>
              )) : <p>No notes to share yet.</p>}
            </div>
            <div>
              <strong>Decks</strong>
              {state.flashcards.length ? state.flashcards.slice(0, 4).map((deck) => (
                <button key={deck.id} onClick={() => toggleShareDeck(deck.id)}>
                  <BookOpen size={14} />
                  {deck.shared ? "Shared" : "Share"} - {deck.chatName}
                </button>
              )) : <p>No decks to share yet.</p>}
            </div>
          </div>
          {(sharedNotes.length > 0 || sharedDecks.length > 0) && (
            <p className="shared-summary">{sharedNotes.length} shared note{sharedNotes.length === 1 ? "" : "s"} and {sharedDecks.length} shared deck{sharedDecks.length === 1 ? "" : "s"} ready for future cloud sync.</p>
          )}
        </div>

        <div className="profile-card wide">
          <h2>Explain to a peer</h2>
          <div className="teachback-card">
            <MessageSquare size={22} />
            <div>
              <strong>Teach it out loud or in chat</strong>
              <p>Peer asks you to explain the topic, scores clarity, catches missing steps, and suggests one next improvement.</p>
            </div>
            <button className="primary-button" onClick={startTeachBack}>Start scored teach-back</button>
          </div>
        </div>

        <div className="profile-card wide">
          <h2>Community challenge sets</h2>
          <div className="challenge-grid">
            {COMMUNITY_CHALLENGES.map((challenge) => (
              <article className="challenge-card" key={challenge.id}>
                <span>{challenge.subject}</span>
                <strong>{challenge.title}</strong>
                <small>{challenge.level}</small>
                <button onClick={() => startCommunityChallenge(challenge)}>Start</button>
              </article>
            ))}
          </div>
        </div>

        <div className="profile-card wide">
          <h2>Production account path</h2>
          <div className="roadmap-grid">
            <span><UserRound size={15} /> Supabase/Firebase/Auth0 login providers</span>
            <span><Library size={15} /> Cloud projects, notes, decks, and rooms</span>
            <span><Share2 size={15} /> Permissioned sharing and invite links</span>
            <span><ClipboardCheck size={15} /> Audit-safe storage rules and deletion controls</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({ state, updateState, resetData }) {
  const [tab, setTab] = useState("appearance");
  const provider = AUTH_PROVIDERS.find((item) => item.id === state.account?.provider);

  const tabs = [
    { id: "appearance", icon: Sun, label: "Appearance" },
    { id: "account", icon: UserRound, label: "Account" },
    { id: "data", icon: Trash2, label: "Data" },
  ];

  return (
    <section className="settings-panel">
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
                      <span>The quick brown fox jumps over memory addresses.</span>
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
                    <span>{state.account?.email || "Guest mode"} {state.account?.verified ? "- verified" : "- local guest"}</span>
                    <small>{provider?.label || "Email"} - stored locally for this prototype</small>
                  </div>
                  <button onClick={() => updateState((c) => ({ ...c, landingComplete: false }))}>Review intro</button>
                </div>
              </div>

              <div className="settings-group">
                <h2>Coming soon</h2>
                <div className="roadmap-grid">
                  <span><UserRound size={15} /> Supabase, Firebase, or Auth0 social login</span>
                  <span><Library size={15} /> Encrypted cloud sync for chats, files, notes, and rooms</span>
                  <span><ClipboardCheck size={15} /> Usage limits, AI cost tracking, and audit logs</span>
                  <span><Languages size={15} /> OCR, multilingual parsing, and vector document search</span>
                </div>
              </div>
            </>
          )}

          {tab === "data" && (
            <div className="settings-group">
              <h2>Reset data</h2>
              <p className="settings-danger-desc">This clears all chats, projects, and flashcards from local storage. Your profile and preferences are kept.</p>
              <button className="danger-btn" onClick={resetData}>
                <Trash2 size={15} /> Reset local chats and projects
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ProjectModal({ project, selectedDoc, selectedDocId, setSelectedDocId, extracting, error, close, pickFile, addMaterials, removeDoc, deleteProject, runDocAction }) {
  const [dragging, setDragging] = useState(false);
  const [selectedExcerpt, setSelectedExcerpt] = useState("");
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
        className={`modal document-modal ${dragging ? "dragging" : ""}`}
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
            <p>Project library, extracted text, and document-grounded study prompts.</p>
          </div>
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
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section className="onboarding-modal">
        <div className="welcome-mark"><Brain size={30} /></div>
        <h1>Set up Peer</h1>
        <p>A tiny bit of context helps Peer start closer to how you actually learn.</p>
        <label>
          What are you studying?
          <input value={profileDraft.subject} onChange={(event) => setProfileDraft((current) => ({ ...current, subject: event.target.value }))} placeholder="C programming, math, biology..." />
        </label>
        <label>
          What is your goal?
          <input value={profileDraft.goal} onChange={(event) => setProfileDraft((current) => ({ ...current, goal: event.target.value }))} placeholder="Understand pointers, pass an exam, finish a project..." />
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

function CommandPalette({ query, setQuery, close, commands }) {
  const filtered = commands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="command-backdrop" onClick={close}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(event) => event.stopPropagation()}>
        <div className="command-header">
          <span>Command menu</span>
          <button type="button" onClick={close} aria-label="Close command menu"><X size={16} /></button>
        </div>
        <div className="command-input">
          <Search size={17} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Run a command..." />
        </div>
        <div className="command-list">
          {filtered.length ? filtered.map((command) => {
            const Icon = command.icon;
            return (
              <button key={command.label} onClick={() => { command.run(); close(); }}>
                <Icon size={17} />
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
  const selected = LANGUAGE_OPTIONS.find((language) => language.value === value) || LANGUAGE_OPTIONS[0];

  return (
    <div className={`language-picker ${open ? "open" : ""}`}>
      <button type="button" className="language-trigger" onClick={() => setOpen((current) => !current)}>
        <span>{selected.label}</span>
        <ChevronRight size={15} />
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
  const anchorRef = useRef(null);

  useEffect(() => {
    if (!wasStreaming.current) return;
    const interval = setInterval(() => {
      setDisplayed((prev) => {
        const target = contentRef.current;
        if (prev.length >= target.length) return prev;
        return target.slice(0, prev.length + 3);
      });
    }, 40);
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

function FlashcardsPanel({ flashcards, projects, setView, deleteFlashcardDeck }) {
  const [activeDeckId, setActiveDeckId] = useState(flashcards[0]?.id || null);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const deck = flashcards.find((d) => d.id === activeDeckId) || flashcards[0] || null;
  const card = deck?.cards[cardIndex] || null;
  const project = projects.find((p) => p.id === deck?.projectId);
  const progress = deck ? ((cardIndex + 1) / deck.cards.length) * 100 : 0;

  function selectDeck(id) {
    setActiveDeckId(id);
    setCardIndex(0);
    setFlipped(false);
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
        <div><h1>Flashcards</h1><p>Space to flip - use arrow keys to navigate - click card to flip</p></div>
        <button onClick={() => setView("chat")}>Back to chat</button>
      </div>
      <div className="flashcards-layout">
        <div className="deck-list">
          {flashcards.map((d) => {
            const proj = projects.find((p) => p.id === d.projectId);
            return (
              <button
                key={d.id}
                className={`deck-row ${d.id === activeDeckId ? "active" : ""}`}
                style={{ "--deck-color": proj?.color || "var(--accent)" }}
                onClick={() => selectDeck(d.id)}
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
              </button>
            );
          })}
        </div>

        {deck && card && (
          <div className="flashcard-area">
            <div className="flashcard-progress">
              <span className="fc-count">{cardIndex + 1}<em> / {deck.cards.length}</em></span>
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
              onKeyDown={(e) => e.key === "Enter" && setFlipped((f) => !f)}
            >
              <div className={`flashcard-inner ${flipped ? "flipped" : ""}`}>
                <div className="flashcard-front">
                  <div key={`q-${cardIndex}`} className="fc-content">
                    <span className="fc-label">Question</span>
                    <p>{card.question}</p>
                    <small>Click or Space to reveal</small>
                  </div>
                </div>
                <div className="flashcard-back">
                  <div key={`a-${cardIndex}`} className="fc-content">
                    <span className="fc-label fc-label-answer">Answer</span>
                    <p>{card.answer}</p>
                    <small>Click to flip back</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="flashcard-nav">
              <button className="fc-nav-btn" onClick={prev} disabled={deck.cards.length <= 1}>Prev</button>
              <button className="fc-nav-btn fc-flip-btn" onClick={() => setFlipped((f) => !f)}>
                {flipped ? "Show question" : "Reveal answer"}
              </button>
              <button className="fc-nav-btn" onClick={next} disabled={deck.cards.length <= 1}>Next</button>
            </div>
          </div>
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

function buildFlashcardPrompt(title, content) {
  return [
    `Generate 5-8 study flashcards from "${title}".`,
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

function buildLearningBrainGraph(state, project, filters, options = {}) {
  const center = { x: 500, y: 320 };
  const nodes = [];
  const links = [];
  const query = normalizeBrainKey(options.query);
  const scopedProjects = project ? [project] : state.projects;
  const projectById = new Map(state.projects.map((item) => [item.id, item]));
  const isGlobal = !project;
  const rootId = isGlobal ? "brain:global" : `project:${project.id}`;

  const root = {
    id: rootId,
    sourceId: project?.id,
    projectId: project?.id,
    type: isGlobal ? "brain" : "project",
    label: isGlobal ? "Peer learning brain" : project.name,
    symbol: isGlobal ? "P" : "B",
    description: isGlobal
      ? "The complete map of your learning system. Every project, chat, file, note, deck, weak spot, and concept can grow from here."
      : "The center of this project. Every chat, file, note, quiz, and concept in this project grows from here.",
    status: state.profile.level || "active",
    confidence: isGlobal ? globalConfidence(state.projects) : projectConfidence(project.mastery),
    evidence: state.profile.goal ? `Current goal: ${state.profile.goal}` : "Peer builds this map from local learning activity.",
    updatedAt: Math.max(...state.projects.map((item) => item.mastery?.updatedAt || 0), state.profile.updatedAt || 0),
    radius: 44,
    x: center.x,
    y: center.y,
    related: [],
    sourceText: `${state.profile.subject || ""} ${state.profile.goal || ""}`,
    labelWidth: measureBrainLabel(isGlobal ? "Peer learning brain" : project.name, 160),
  };
  nodes.push(root);

  const projectNodes = isGlobal && filters.projects
    ? state.projects.map((item) => ({
      id: `project:${item.id}`,
      sourceId: item.id,
      projectId: item.id,
      type: "project",
      label: item.name,
      symbol: "P",
      description: "A project inside your full learning brain. Focus it to inspect its local concepts and sources.",
      status: `${item.docs?.length || 0} files`,
      confidence: projectConfidence(item.mastery),
      evidence: `${state.chats.filter((chat) => chat.projectId === item.id).length} chats, ${state.notes.filter((note) => note.projectId === item.id).length} notes, ${(item.mastery?.concepts || []).length} tracked concepts.`,
      updatedAt: item.mastery?.updatedAt || item.docs?.at?.(-1)?.addedAt || Date.now(),
      radius: 34,
      related: [],
      sourceText: `${item.name} ${state.profile.subject || ""}`,
      labelWidth: measureBrainLabel(item.name, 142),
    }))
    : [];

  const scopedChats = state.chats.filter((chat) => !project || chat.projectId === project.id).slice().sort(byBrainRecency);
  const scopedNotes = state.notes.filter((note) => !project || note.projectId === project.id).slice().sort(byBrainRecency);
  const scopedDecks = state.flashcards.filter((deck) => !project || deck.projectId === project.id).slice().sort(byBrainRecency);
  const scopedDocs = scopedProjects.flatMap((item) => (item.docs || []).map((doc) => ({ ...doc, projectId: item.id, projectName: item.name }))).sort(byBrainRecency);

  const conceptItems = scopedProjects.flatMap((item) => (item.mastery?.concepts || []).slice().sort(byBrainConcept).slice(0, isGlobal ? 8 : 14).map((concept) => ({
    ...concept,
    projectId: item.id,
    projectName: item.name,
  })));
  const weakKeys = new Set(scopedProjects.flatMap((item) => (item.mastery?.misconceptions || []).map((entry) => normalizeBrainKey(entry.concept))));
  const conceptNodes = conceptItems
    .filter((concept) => filters.concepts || (filters.weak && isWeakConcept(concept)))
    .map((concept) => ({
      id: `concept:${concept.projectId}:${concept.id || concept.key}`,
      sourceId: concept.id,
      projectId: concept.projectId,
      type: isWeakConcept(concept) ? "weak" : "concept",
      label: concept.label,
      key: normalizeBrainKey(concept.key || concept.label),
      symbol: isWeakConcept(concept) ? "!" : "C",
      description: isWeakConcept(concept)
        ? `Peer thinks this concept needs reinforcement in ${concept.projectName}.`
        : `A concept Peer has seen in ${concept.projectName}.`,
      status: isWeakConcept(concept) ? "weak" : concept.status || "learning",
      confidence: Number(concept.confidence ?? 0.35),
      evidence: concept.evidence || `Detected from learning activity in ${concept.projectName}.`,
      updatedAt: concept.updatedAt || concept.createdAt,
      radius: radiusFromConfidence(concept.confidence),
      related: [],
      sourceText: `${concept.label} ${concept.projectName}`,
      labelWidth: measureBrainLabel(concept.label),
    }));

  const misconceptionNodes = filters.weak
    ? scopedProjects.flatMap((projectItem) => (projectItem.mastery?.misconceptions || []).slice().sort(byBrainRecency).slice(0, isGlobal ? 5 : 8).map((item) => ({
      id: `misconception:${projectItem.id}:${item.id}`,
      sourceId: item.id,
      projectId: projectItem.id,
      type: "weak",
      label: item.concept,
      key: normalizeBrainKey(item.concept),
      symbol: "!",
      description: item.correction || `A possible misunderstanding Peer detected in ${projectItem.name}.`,
      status: "misconception",
      confidence: 0.18,
      evidence: item.belief || "Possible misconception detected.",
      updatedAt: item.createdAt,
      radius: 24,
      related: [],
      sourceText: `${item.concept} ${item.belief} ${item.correction} ${projectItem.name}`,
      labelWidth: measureBrainLabel(item.concept),
    })))
    : [];

  const fileNodes = filters.files
    ? scopedDocs.slice(0, isGlobal ? 18 : 12).map((doc) => ({
      id: `file:${doc.projectId}:${doc.id}`,
      sourceId: doc.id,
      projectId: doc.projectId,
      type: "file",
      label: doc.name,
      symbol: doc.kind === "image" ? "I" : "F",
      description: doc.kind === "image" ? `Image material attached to ${doc.projectName}.` : `Study material Peer can ground answers in for ${doc.projectName}.`,
      status: doc.kind || "file",
      evidence: `${doc.chars || doc.content?.length || 0} extracted character${(doc.chars || doc.content?.length || 0) === 1 ? "" : "s"}.`,
      updatedAt: doc.createdAt || doc.addedAt,
      radius: 22,
      related: [],
      sourceText: `${doc.name} ${doc.content || ""} ${doc.projectName}`,
      labelWidth: measureBrainLabel(doc.name),
    }))
    : [];

  const noteNodes = filters.notes
    ? scopedNotes.slice(0, isGlobal ? 18 : 12).map((note) => ({
      id: `note:${note.id}`,
      sourceId: note.id,
      projectId: note.projectId,
      type: "note",
      label: note.title,
      symbol: "N",
      description: `A saved explanation or study note connected to ${projectById.get(note.projectId)?.name || "a project"}.`,
      status: note.category || "note",
      evidence: note.tags?.length ? `Tags: ${note.tags.join(", ")}` : "Saved from a useful answer.",
      updatedAt: note.createdAt,
      radius: 21,
      related: [],
      sourceText: `${note.title} ${note.content} ${(note.tags || []).join(" ")} ${projectById.get(note.projectId)?.name || ""}`,
      labelWidth: measureBrainLabel(note.title),
    }))
    : [];

  const chatNodes = filters.chats
    ? scopedChats.slice(0, isGlobal ? 18 : 12).map((chat) => ({
      id: `chat:${chat.id}`,
      sourceId: chat.id,
      projectId: chat.projectId,
      type: "chat",
      label: chat.name,
      symbol: "Q",
      description: `A study conversation inside ${projectById.get(chat.projectId)?.name || "a project"}.`,
      status: `${chat.messages?.length || 0} messages`,
      evidence: latestUserQuestion(chat) || "Study thread in this project.",
      updatedAt: chat.updatedAt || chat.createdAt,
      radius: 21,
      related: [],
      sourceText: `${chat.name} ${(chat.messages || []).map((message) => message.displayContent || message.content).join(" ")} ${projectById.get(chat.projectId)?.name || ""}`,
      labelWidth: measureBrainLabel(chat.name),
    }))
    : [];

  const quizNodes = filters.quizzes
    ? scopedDecks.slice(0, isGlobal ? 14 : 10).map((deck) => ({
      id: `quiz:${deck.id}`,
      sourceId: deck.id,
      projectId: deck.projectId,
      type: "quiz",
      label: deck.chatName || "Flashcards",
      symbol: "R",
      description: "Recall practice generated from chats or study material.",
      status: `${deck.cards?.length || 0} cards`,
      evidence: deck.shared ? "Shared deck for future study rooms." : "Local practice deck.",
      updatedAt: deck.createdAt,
      radius: 21,
      related: [],
      sourceText: `${deck.chatName} ${(deck.cards || []).map((card) => `${card.q} ${card.a}`).join(" ")} ${projectById.get(deck.projectId)?.name || ""}`,
      labelWidth: measureBrainLabel(deck.chatName || "Flashcards"),
    }))
    : [];

  const generatedConceptNodes = conceptNodes.length || !filters.concepts
    ? []
    : scopedProjects.flatMap((projectItem) => inferBrainConceptsFromActivity(state, projectItem).slice(0, isGlobal ? 4 : 10).map((label, index) => ({
      id: `seed:${projectItem.id}:${normalizeBrainKey(label)}`,
      projectId: projectItem.id,
      type: index === 0 && weakKeys.has(normalizeBrainKey(label)) ? "weak" : "concept",
      label,
      key: normalizeBrainKey(label),
      symbol: "C",
      description: `A starter concept inferred from ${projectItem.name} until more mastery data exists.`,
      status: "emerging",
      confidence: 0.32,
      evidence: "Inferred from project name, notes, chats, or uploaded material.",
      updatedAt: Date.now(),
      radius: 22,
      related: [],
      sourceText: `${label} ${projectItem.name}`,
      labelWidth: measureBrainLabel(label),
    })));

  const filteredProjectNodes = projectNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredConceptNodes = conceptNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredMisconceptionNodes = misconceptionNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredFileNodes = fileNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredNoteNodes = noteNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredChatNodes = chatNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredQuizNodes = quizNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredGeneratedConceptNodes = generatedConceptNodes.filter((node) => matchesBrainQuery(node, query));

  if (isGlobal) {
    layoutBrainOrbit(filteredProjectNodes, center, 170, -110, 300);
    nodes.push(...filteredProjectNodes);
  }

  const groups = [
    { nodes: filteredFileNodes, anchor: { x: 210, y: 112 }, columns: 4, xGap: 108, yGap: 72 },
    { nodes: [...filteredConceptNodes, ...filteredGeneratedConceptNodes], anchor: { x: 116, y: 252 }, columns: 3, xGap: 106, yGap: 82 },
    { nodes: filteredMisconceptionNodes, anchor: { x: 690, y: 210 }, columns: 3, xGap: 96, yGap: 82 },
    { nodes: filteredNoteNodes, anchor: { x: 138, y: 500 }, columns: 4, xGap: 106, yGap: 68 },
    { nodes: filteredQuizNodes, anchor: { x: 594, y: 520 }, columns: 3, xGap: 104, yGap: 68 },
    { nodes: filteredChatNodes, anchor: { x: 735, y: 350 }, columns: 2, xGap: 112, yGap: 78 },
  ];

  for (const group of groups) {
    layoutBrainCluster(group.nodes, group.anchor, group.columns, group.xGap, group.yGap);
    nodes.push(...group.nodes);
  }

  const visibleIds = new Set(nodes.map((node) => node.id));
  const projectNodeIds = new Map(nodes.filter((node) => node.type === "project").map((node) => [node.projectId || node.sourceId, node.id]));

  for (const node of nodes) {
    if (node.id === rootId) continue;
    const projectNodeId = isGlobal && node.type !== "project" ? projectNodeIds.get(node.projectId) : null;
    if (projectNodeId && visibleIds.has(projectNodeId)) links.push({ source: projectNodeId, target: node.id, kind: "root" });
    else links.push({ source: rootId, target: node.id, kind: "root" });
  }

  const conceptLike = nodes.filter((node) => (node.type === "concept" || node.type === "weak") && node.key);
  const sources = nodes.filter((node) => ["file", "note", "chat", "quiz", "project"].includes(node.type));
  for (const concept of conceptLike) {
    const matcher = brainKeyRegex(concept.key);
    if (!matcher) continue;
    for (const source of sources) {
      if (source.id !== concept.id && source.sourceText && matcher.test(source.sourceText)) {
        links.push({ source: concept.id, target: source.id, kind: "related" });
      }
    }
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (const link of links) {
    const source = nodeMap.get(link.source);
    const target = nodeMap.get(link.target);
    if (!source || !target) continue;
    if (target.id !== rootId) target.related.push(source.id === rootId ? root : source);
    if (source.id !== rootId) source.related.push(target);
  }

  return {
    nodes,
    links: dedupeBrainLinks(links).slice(0, isGlobal ? 180 : 120),
    nodeMap,
    summary: {
      projects: isGlobal ? filteredProjectNodes.length : 1,
      concepts: conceptLike.length,
      weak: nodes.filter((node) => node.type === "weak").length,
      sources: sources.length,
    },
  };
}

function layoutBrainCluster(nodes, anchor, columns = 3, xGap = 110, yGap = 92) {
  nodes.forEach((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const stagger = row % 2 ? xGap * 0.28 : 0;
    node.x = clampBrain(anchor.x + column * xGap + stagger, 76, 924);
    node.y = clampBrain(anchor.y + row * yGap, 76, 564);
  });
}

function layoutBrainOrbit(nodes, center, radius, start = -120, spread = 300) {
  const count = nodes.length;
  if (!count) return;
  nodes.forEach((node, index) => {
    const angle = count === 1 ? -90 : start + (spread * index) / Math.max(1, count - 1);
    const wobble = (index % 2 ? 26 : -12) + Math.min(34, Math.floor(index / 6) * 14);
    const point = polarPoint(center, radius + wobble, angle);
    node.x = clampBrain(point.x, 70, 930);
    node.y = clampBrain(point.y, 70, 570);
  });
}

function clampBrain(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function polarPoint(center, radius, degrees) {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: Math.round(center.x + Math.cos(angle) * radius),
    y: Math.round(center.y + Math.sin(angle) * radius),
  };
}

function radiusFromConfidence(confidence = 0.35) {
  return Math.round(20 + Math.max(0, Math.min(1, confidence)) * 10);
}

function projectConfidence(mastery) {
  const concepts = mastery?.concepts || [];
  if (!concepts.length) return 0.25;
  return concepts.reduce((sum, concept) => sum + Number(concept.confidence || 0), 0) / concepts.length;
}

function globalConfidence(projects) {
  const values = projects.map((project) => projectConfidence(project.mastery));
  if (!values.length) return 0.25;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isWeakConcept(concept) {
  return concept?.status === "weak" || Number(concept?.confidence || 0) < 0.45;
}

function inferBrainConceptsFromActivity(state, project) {
  const text = [
    project?.name,
    state.profile.subject,
    state.profile.goal,
    ...(project?.docs || []).map((doc) => `${doc.name} ${doc.content || ""}`),
    ...state.notes.filter((note) => !project || note.projectId === project.id).map((note) => `${note.title} ${note.content}`),
    ...state.chats.filter((chat) => !project || chat.projectId === project.id).map((chat) => `${chat.name} ${(chat.messages || []).map((message) => message.content).join(" ")}`),
  ].join(" ").toLowerCase();
  const candidates = [
    "pointers", "memory", "arrays", "loops", "functions", "structs", "debugging", "security", "state",
    "components", "networking", "algorithms", "recursion", "api", "terminal", "authentication",
  ];
  const found = candidates.filter((item) => text.includes(item.replace(/s$/, "")));
  return (found.length ? found : [project?.name || state.profile.subject || "Core concepts", "Practice", "Questions"]).slice(0, 10);
}

function dedupeBrainLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    const key = [link.source, link.target].sort().join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function latestUserQuestion(chat) {
  return (chat?.messages || []).filter((message) => message.role === "user").at(-1)?.displayContent
    || (chat?.messages || []).filter((message) => message.role === "user").at(-1)?.content
    || "";
}

function normalizeBrainKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function brainRecency(item) {
  return Number(item?.updatedAt || item?.createdAt || item?.addedAt || 0);
}

function byBrainRecency(a, b) {
  return brainRecency(b) - brainRecency(a);
}

function byBrainConcept(a, b) {
  const weakA = isWeakConcept(a) ? 1 : 0;
  const weakB = isWeakConcept(b) ? 1 : 0;
  if (weakA !== weakB) return weakB - weakA;
  return brainRecency(b) - brainRecency(a);
}

function brainKeyRegex(key) {
  const value = normalizeBrainKey(key);
  if (value.length < 3) return null;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
}

function matchesBrainQuery(node, query) {
  if (!query) return true;
  return normalizeBrainKey(`${node.label || ""} ${node.description || ""} ${node.evidence || ""} ${node.sourceText || ""}`).includes(query);
}

function shortLabel(value, max = 16) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function measureBrainLabel(value, max = 118) {
  const text = String(value || "");
  return Math.min(max, Math.max(58, text.length * 7.4 + 18));
}

function nodeTypeLabel(node) {
  const labels = {
    brain: "Global brain",
    project: "Project center",
    concept: "Concept",
    weak: node.status === "misconception" ? "Misconception" : "Weak spot",
    file: "Material",
    note: "Saved note",
    chat: "Chat thread",
    quiz: "Recall deck",
  };
  return labels[node.type] || "Node";
}

function relativeDate(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "unknown";
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.max(1, Math.round(delta / 3_600_000))}h ago`;
  return `${Math.max(1, Math.round(delta / 86_400_000))}d ago`;
}

function inferNoteTags(content) {
  const text = String(content || "").toLowerCase();
  const tags = [];
  const checks = [
    ["code", /\b(code|function|bug|compile|react|python|javascript|c programming)\b/],
    ["memory", /\b(memory|pointer|malloc|free|address)\b/],
    ["visual", /\b(diagram|visual|analogy|model|flowchart)\b/],
    ["exam", /\b(exam|test|quiz|practice|recall)\b/],
    ["concept", /\b(concept|means|because|why|how)\b/],
  ];
  for (const [tag, regex] of checks) {
    if (regex.test(text)) tags.push(tag);
  }
  return tags.length ? tags.slice(0, 4) : ["study"];
}

function buildBuddyMatches(profile, activeProject) {
  const subject = activeProject?.name || profile.subject || "your subject";
  const visual = (profile.preferences?.visual || 0) + (profile.preferences?.exampleFirst || 0);
  const technical = profile.preferences?.technical || 0;
  const socratic = profile.preferences?.socratic || 0;
  return [
    {
      id: "builder",
      initials: "CB",
      name: "Concept Builder",
      reason: `Good match for building ${subject} from examples into rules.`,
      fit: visual >= technical ? "High fit: examples and visuals" : "Medium fit: adds concrete examples",
    },
    {
      id: "debugger",
      initials: "DR",
      name: "Debug Reviewer",
      reason: `Pairs well when you want precise feedback, bugs, and edge cases.`,
      fit: technical > 1 ? "High fit: technical signals detected" : "Medium fit: useful for code sessions",
    },
    {
      id: "coach",
      initials: "QC",
      name: "Quiz Coach",
      reason: `Best for recall, one-question-at-a-time practice, and teach-back scoring.`,
      fit: socratic > 1 || profile.signals?.quiz > 0 ? "High fit: quiz signals detected" : "Medium fit: builds active recall",
    },
  ];
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
