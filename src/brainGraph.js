// ============================================================================
// Peer — learning-brain graph builder
// Turns the learner's projects, concepts, notes, chats, decks, and documents
// into the node/link graph the 3D map and the accessible outline both render.
// Pure data logic (no React, no Three.js) so it can be unit-tested.
//
// Structure (global scope):
//   brain root → domain clusters (when ≥2 domains) → projects → concepts/sources
// Domain nodes carry their taxonomy accent; every node also gets a SHAPE cue
// (ring/circle/diamond/square) so type is never conveyed by color alone.
// ============================================================================
import { domainForProject } from "./subjects.js";

// Design palette (Peer.dc.html): project=violet, concept=cyan, weak=amber,
// with complementary hues for the extra node types the real feature keeps.
// "Study Hall" node palette (mockup: amber hubs, sky concepts, rose weak
// spots, sand files, pine notes, clay chats — warm editorial, no neon).
export const BRAIN_PALETTE = {
  brain: { core: 0xf0d9a8, glow: 0xe0a039 },
  domain: { core: 0xf0d9a8, glow: 0xe0a039 }, // per-node accent overrides this
  project: { core: 0xf0c987, glow: 0xe0a039 },
  concept: { core: 0xb3d4ea, glow: 0x6fa8c9 },
  weak: { core: 0xe8ab9e, glow: 0xc96a5a },
  file: { core: 0xe3d2b3, glow: 0xc9a875 },
  note: { core: 0x9ccfb8, glow: 0x3f8f74 },
  chat: { core: 0xdbbc9e, glow: 0xb98a63 },
  quiz: { core: 0xd9b3cc, glow: 0xb57ba6 },
  code: { core: 0xc2ccd6, glow: 0x8a95a3 },
};

function lightenInt(hex, amount) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const up = (v) => Math.min(255, Math.round(v + (255 - v) * amount));
  return (up(r) << 16) | (up(g) << 8) | up(b);
}

// Hub nodes wear the ACTIVE theme's accent — WebGL materials can't consume
// CSS var(), so LearningBrain calls this when it builds a scene. Node TYPE
// colors (concept/weak/file/note/chat/quiz/code) are semantic data-viz
// coding and deliberately stay fixed across themes.
export function refreshBrainThemeAccent() {
  let glow = 0xe0a039;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--sh-accent").trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) glow = parseInt(v.slice(1), 16);
  } catch { /* non-DOM (tests) keep the default */ }
  BRAIN_PALETTE.brain = { core: lightenInt(glow, 0.55), glow };
  BRAIN_PALETTE.domain = { core: lightenInt(glow, 0.55), glow };
  BRAIN_PALETTE.project = { core: lightenInt(glow, 0.4), glow };
}

// Accepts a node (preferred) or a bare type string. Domain nodes tint to
// their taxonomy accent so each cluster reads as its subject.
export function brainPalette(nodeOrType) {
  const node = typeof nodeOrType === "string" ? { type: nodeOrType } : (nodeOrType || {});
  if (node.type === "domain" && node.accent) {
    const glow = parseInt(node.accent.slice(1), 16);
    return { core: lightenInt(glow, 0.45), glow };
  }
  return BRAIN_PALETTE[node.type] || BRAIN_PALETTE.concept;
}

// Shape cue per node family — colorblind-safe redundancy for the color coding.
// ring = hubs (brain / domain / project), circle = concept, diamond = weak
// spot / misconception, square = source material (file, code, note, chat, quiz).
export function shapeForType(type) {
  if (type === "brain" || type === "domain" || type === "project") return "ring";
  if (type === "weak") return "diamond";
  if (type === "concept") return "circle";
  return "square";
}

export function brainNodeRadius(node) {
  if (node.type === "brain") return 1.3;
  if (node.type === "domain") return 0.95;
  if (node.type === "project") return 0.78;
  if (node.type === "code") return 0.5;
  const confidence = Number(node.confidence ?? 0.4);
  const base = node.type === "weak" ? 0.4 : 0.32;
  return base + Math.max(0, Math.min(1, confidence)) * 0.36;
}

export function brainLinkRest(link, nodeMap) {
  if (link.kind === "related") return 4.6;
  const source = nodeMap.get(link.source);
  if (source?.type === "brain") return 7;
  if (source?.type === "domain") return 5.6;
  if (source?.type === "project") return 5.2;
  return 6;
}

export function buildLearningBrainGraph(state, project, filters, options = {}) {
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
      ? "The complete map of your learning system. Every subject, chat, file, note, deck, weak spot, and concept can grow from here."
      : "The center of this subject. Every chat, file, note, quiz, and concept in this subject grows from here.",
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

  // ---- domain cluster layer (global scope, ≥2 distinct real domains) ----
  const domainByProject = new Map(state.projects.map((item) => [item.id, domainForProject(item)]));
  const realDomains = new Map(); // domainId -> { domain, projects: [] }
  if (isGlobal) {
    for (const item of state.projects) {
      const domain = domainByProject.get(item.id);
      if (!domain || domain.id === "general") continue;
      if (!realDomains.has(domain.id)) realDomains.set(domain.id, { domain, projects: [] });
      realDomains.get(domain.id).projects.push(item);
    }
  }
  const useDomainLayer = isGlobal && filters.projects && realDomains.size >= 2;
  const domainNodes = useDomainLayer
    ? [...realDomains.values()].map(({ domain, projects }) => ({
      id: `domain:${domain.id}`,
      type: "domain",
      domainId: domain.id,
      accent: domain.accent,
      icon: domain.icon,
      label: domain.label,
      symbol: "D",
      description: `Your ${domain.label} cluster — everything you're learning in this field grows from here.`,
      status: `${projects.length} subject${projects.length === 1 ? "" : "s"}`,
      confidence: projects.reduce((sum, item) => sum + projectConfidence(item.mastery), 0) / projects.length,
      evidence: projects.map((item) => item.name).join(", "),
      updatedAt: Math.max(...projects.map((item) => item.mastery?.updatedAt || 0)),
      radius: 38,
      related: [],
      sourceText: `${domain.label} ${projects.map((item) => item.name).join(" ")}`,
      labelWidth: measureBrainLabel(domain.label, 150),
    }))
    : [];

  const projectNodes = isGlobal && filters.projects
    ? state.projects.map((item) => ({
      id: `project:${item.id}`,
      sourceId: item.id,
      projectId: item.id,
      domainId: domainByProject.get(item.id)?.id,
      type: "project",
      label: item.name,
      symbol: "P",
      description: "A subject inside your full learning brain. Focus it to inspect its local concepts and sources.",
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
      history: Array.isArray(concept.history) ? concept.history : [],
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
    ? scopedDocs.filter((doc) => doc.kind !== "code").slice(0, isGlobal ? 18 : 12).map((doc) => ({
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

  const codeNodes = filters.code
    ? scopedDocs.filter((doc) => doc.kind === "code").slice(0, isGlobal ? 16 : 12).map((doc) => ({
      id: `code:${doc.projectId}:${doc.id}`,
      sourceId: doc.id,
      projectId: doc.projectId,
      type: "code",
      label: doc.name,
      symbol: "</>",
      description: `A code snippet you wrote in the Code lab (${doc.language || "code"}), connected to ${doc.projectName}.`,
      status: doc.language || "code",
      evidence: doc.content ? `${(doc.content.match(/\n/g)?.length || 0) + 1} lines of ${doc.language || "code"}.` : "Saved from the Code lab.",
      updatedAt: doc.createdAt || doc.addedAt,
      radius: 24,
      related: [],
      sourceText: `${doc.name} ${doc.language || ""} ${doc.content || ""} ${doc.projectName}`,
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
      description: `A saved explanation or study note connected to ${projectById.get(note.projectId)?.name || "a subject"}.`,
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
      description: `A study conversation inside ${projectById.get(chat.projectId)?.name || "a subject"}.`,
      status: `${chat.messages?.length || 0} messages`,
      evidence: latestUserQuestion(chat) || "Study thread in this subject.",
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
      sourceText: `${deck.chatName} ${(deck.cards || []).map((card) => `${card.question || ""} ${card.answer || ""}`).join(" ")} ${projectById.get(deck.projectId)?.name || ""}`,
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
      evidence: "Inferred from subject name, notes, chats, or uploaded material.",
      updatedAt: Date.now(),
      radius: 22,
      related: [],
      sourceText: `${label} ${projectItem.name}`,
      labelWidth: measureBrainLabel(label),
    })));

  const filteredConceptNodes = conceptNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredMisconceptionNodes = misconceptionNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredFileNodes = fileNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredCodeNodes = codeNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredNoteNodes = noteNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredChatNodes = chatNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredQuizNodes = quizNodes.filter((node) => matchesBrainQuery(node, query));
  const filteredGeneratedConceptNodes = generatedConceptNodes.filter((node) => matchesBrainQuery(node, query));
  // A search keeps matching nodes AND their ancestors: a subject stays when
  // any of its children match, a domain stays while any member subject stays.
  const matchedChildProjectIds = new Set([
    ...filteredConceptNodes, ...filteredMisconceptionNodes, ...filteredFileNodes,
    ...filteredCodeNodes, ...filteredNoteNodes, ...filteredChatNodes,
    ...filteredQuizNodes, ...filteredGeneratedConceptNodes,
  ].map((node) => node.projectId));
  const filteredProjectNodes = projectNodes.filter((node) => (
    matchesBrainQuery(node, query) || matchedChildProjectIds.has(node.projectId)
  ));
  const visibleProjectIds = new Set(filteredProjectNodes.map((node) => node.projectId));
  const filteredDomainNodes = domainNodes.filter((node) => (
    matchesBrainQuery(node, query)
    || realDomains.get(node.domainId)?.projects.some((item) => visibleProjectIds.has(item.id))
  ));

  if (isGlobal) {
    nodes.push(...filteredDomainNodes);
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
    { nodes: filteredCodeNodes, anchor: { x: 388, y: 96 }, columns: 4, xGap: 104, yGap: 70 },
  ];

  for (const group of groups) {
    layoutBrainCluster(group.nodes, group.anchor, group.columns, group.xGap, group.yGap);
    nodes.push(...group.nodes);
  }

  const visibleIds = new Set(nodes.map((node) => node.id));
  const projectNodeIds = new Map(nodes.filter((node) => node.type === "project").map((node) => [node.projectId || node.sourceId, node.id]));

  for (const node of nodes) {
    if (node.id === rootId) continue;
    if (node.type === "domain") {
      links.push({ source: rootId, target: node.id, kind: "root" });
      continue;
    }
    if (node.type === "project" && isGlobal) {
      const domainNodeId = node.domainId && node.domainId !== "general" ? `domain:${node.domainId}` : null;
      links.push({
        source: domainNodeId && visibleIds.has(domainNodeId) ? domainNodeId : rootId,
        target: node.id,
        kind: "root",
      });
      continue;
    }
    const projectNodeId = isGlobal && node.type !== "project" ? projectNodeIds.get(node.projectId) : null;
    if (projectNodeId && visibleIds.has(projectNodeId)) links.push({ source: projectNodeId, target: node.id, kind: "root" });
    else links.push({ source: rootId, target: node.id, kind: "root" });
  }

  const conceptLike = nodes.filter((node) => (node.type === "concept" || node.type === "weak") && node.key);
  const sources = nodes.filter((node) => ["file", "code", "note", "chat", "quiz", "project"].includes(node.type));
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
    links: dedupeBrainLinks(links).slice(0, isGlobal ? 200 : 120),
    nodeMap,
    summary: {
      projects: isGlobal ? filteredProjectNodes.length : 1,
      domains: filteredDomainNodes.length,
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
  // Seed candidates from the project's own domain so a history or language
  // subject sprouts history/language concepts, not programming ones.
  const domain = domainForProject(project);
  const candidates = domain.conceptHints.length ? domain.conceptHints : [];
  const found = candidates.filter((item) => text.includes(item.toLowerCase().replace(/s$/, "")));
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

export function shortLabel(value, max = 16) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function measureBrainLabel(value, max = 118) {
  const text = String(value || "");
  return Math.min(max, Math.max(58, text.length * 7.4 + 18));
}

export function nodeTypeLabel(node) {
  const labels = {
    brain: "Global brain",
    domain: "Domain cluster",
    project: "Subject center",
    concept: "Concept",
    weak: node.status === "misconception" ? "Misconception" : "Weak spot",
    file: "Material",
    code: "Code cell",
    note: "Saved note",
    chat: "Chat thread",
    quiz: "Recall deck",
  };
  return labels[node.type] || "Node";
}

export function relativeDate(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "unknown";
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.max(1, Math.round(delta / 3_600_000))}h ago`;
  return `${Math.max(1, Math.round(delta / 86_400_000))}d ago`;
}

// Trajectory of a concept node's mastery history (mirrors learningModel's
// conceptTrajectory but works on graph nodes).
export function nodeTrajectory(node) {
  const history = Array.isArray(node?.history) ? node.history : [];
  if (history.length < 2) return "new";
  const delta = (history[history.length - 1].confidence || 0) - (history[0].confidence || 0);
  if (delta > 0.08) return "improving";
  if (delta < -0.08) return "slipping";
  return "steady";
}

// Hierarchy for the accessible outline view: domains → projects → concepts →
// sources — the same graph, keyboard/screen-reader friendly.
export function buildBrainOutline(graph) {
  const nodes = graph.nodes || [];
  const byId = graph.nodeMap || new Map(nodes.map((node) => [node.id, node]));
  const root = nodes[0] || null;
  const domains = nodes.filter((node) => node.type === "domain");
  const projects = nodes.filter((node) => node.type === "project" && node.id !== root?.id);
  const rest = nodes.filter((node) => !["brain", "domain", "project"].includes(node.type) || (node.type === "project" && node.id === root?.id));

  const projectEntry = (projectNode, projectId) => ({
    node: projectNode,
    concepts: nodes.filter((node) => (node.type === "concept" || node.type === "weak") && node.projectId === projectId),
    sources: nodes.filter((node) => ["file", "code", "note", "chat", "quiz"].includes(node.type) && node.projectId === projectId),
  });

  if (root?.type === "project") {
    // single-project scope: one entry, no domain layer
    return { root, groups: [{ domain: null, projects: [projectEntry(root, root.projectId || root.sourceId)] }], orphans: [] };
  }

  const grouped = [];
  const seenProjects = new Set();
  for (const domainNode of domains) {
    const members = projects.filter((node) => node.domainId === domainNode.domainId);
    members.forEach((node) => seenProjects.add(node.id));
    grouped.push({ domain: domainNode, projects: members.map((node) => projectEntry(node, node.projectId || node.sourceId)) });
  }
  const ungrouped = projects.filter((node) => !seenProjects.has(node.id));
  if (ungrouped.length) {
    grouped.push({ domain: null, projects: ungrouped.map((node) => projectEntry(node, node.projectId || node.sourceId)) });
  }

  // sources whose project has no project node (edge case: filtered out)
  const coveredProjectIds = new Set(projects.map((node) => node.projectId || node.sourceId));
  const orphans = rest.filter((node) => node.type !== "project" && !coveredProjectIds.has(node.projectId));

  return { root, groups: grouped, orphans };
}
