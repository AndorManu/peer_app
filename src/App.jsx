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
import { LearningBrainPanel } from "./LearningBrain.jsx";
import PeerNavRail from "./components/PeerNavRail.jsx";
import CodingPanel from "./CodingPanel.jsx";
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
  const [listening, setListening] = useState(false);
  const voiceModeRef = useRef(false);
  const listeningRef = useRef(false);
  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const loadingRef = useRef(false);
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

  // Practice generator — turn any topic/concept/note into a targeted quiz.
  function generatePractice(topic, opts = {}) {
    const t = String(topic || "").trim();
    if (!t) { showToast("Pick a concept or note to practice."); return; }
    const n = opts.count || 5;
    const grounding = opts.context ? `\n\nGround the questions in this material:\n${String(opts.context).slice(0, 1500)}` : "";
    setView("chat");
    sendMessage(
      `Create a focused ${n}-question practice set on "${t}". Ask one question at a time, wait for my answer, then give brief feedback before moving on. Mix recall and application. Start with question 1 now.${grounding}`,
      { mode: "quiz" },
    );
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
      .replace(/```[\s\S]*?```/g, " (code block) ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/#{1,3} /g, "")
      .replace(/^[-*] /gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
    if (!clean) {
      maybeListenAfterSpeak();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.04;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      setSpeaking(false);
      maybeListenAfterSpeak();
    };
    utterance.onerror = () => {
      setSpeaking(false);
      maybeListenAfterSpeak();
    };
    const langCode = SPEECH_LANG_MAP[state.profile.language] || "";
    if (langCode) {
      const voices = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang.toLowerCase().startsWith(langCode.slice(0, 2)));
      if (match) utterance.voice = match;
      utterance.lang = langCode;
    }
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
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
    if (profileDraft.subject.trim() && state.projects.length === 1 && state.projects[0].name === "My first topic") {
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
      className={`${appClass} peer-skin view-${view}`}
      style={{
        "--app-font": font.family,
        "--text-size": `${state.textSize}px`,
      }}
    >
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
          {speaking && (
            <button className="topbar-action speaking-badge" onClick={stopSpeaking}>
              <Volume2 size={15} className="speaking-icon" /> Stop
            </button>
          )}
          <div className="status-pill"><span /> Local app</div>
        </header>

        {view === "settings" && <SettingsPanel state={state} updateState={updateState} resetData={resetData} loadSampleData={loadSampleData} />}
        {view === "profile" && <ProfilePanel profile={state.profile} activeProject={activeProject} activeChat={activeChat} insights={insights} activeMode={activeMode} updateState={updateState} recap={buildLearnerRecap(state)} />}
        {view === "brain" && <LearningBrainPanel state={state} activeProject={activeProject} setView={setView} updateState={updateState} setManagedProjectId={setManagedProjectId} setSelectedDocId={setSelectedDocId} onPractice={generatePractice} />}
        {view === "code" && <CodingPanel profile={state.profile} />}
        {view === "notes" && <NotesPanel notes={state.notes} projects={state.projects} deleteNote={deleteNote} toggleShareNote={toggleShareNote} onPractice={generatePractice} />}
        {view === "flashcards" && <FlashcardsPanel flashcards={state.flashcards} projects={state.projects} setView={setView} deleteFlashcardDeck={deleteFlashcardDeck} gradeFlashcard={gradeFlashcard} />}
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
            listening={listening}
            startListening={startListening}
            stopListening={stopListening}
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
  const [draggingChatId, setDraggingChatId] = useState(null);
  const [dropProjectId, setDropProjectId] = useState(null);

  const onChatDragStart = (chatId) => setDraggingChatId(chatId);
  const onChatDragEnd = () => { setDraggingChatId(null); setDropProjectId(null); };

  return (
    <aside className="sidebar">
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
                  <span className="project-name">{project.name}</span>
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

function ChatRow({ chat, active, editing, editingName, setEditingName, renameChat, selectChat, startRename, deleteChat, draggable, dragging, onChatDragStart, onChatDragEnd }) {
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
  listening,
  startListening,
  stopListening,
  profileLanguage,
  explanationDepth,
  setExplanationDepth,
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
      </div>
    </footer>
  );
}

function ProfilePanel({ profile, activeProject, activeChat, insights, activeMode, updateState, recap }) {
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
                          {onPractice && <button onClick={() => onPractice(note.title, { context: note.content })} title="Practice this note"><Target size={14} /></button>}
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

function SettingsPanel({ state, updateState, resetData, loadSampleData }) {
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
          <input value={profileDraft.subject} onChange={(event) => setProfileDraft((current) => ({ ...current, subject: event.target.value }))} placeholder="Biology, history, Spanish, calculus, coding..." />
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
