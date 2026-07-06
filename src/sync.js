// ============================================================================
// Peer — offline-first cloud sync (IndexedDB ⇄ Supabase)
//
// Local state stays the source of truth for UX; the cloud is the sync layer.
// Design:
//  • Push: every syncable entity is flattened to rows; a row is pushed when
//    its hash differs from the snapshot taken at the last successful sync
//    (no per-mutation bookkeeping needed — missed call sites can't break it).
//  • Deletes: hard-deleted locally, recorded in state.tombstones, pushed as
//    soft-deleted rows so other devices learn about them on pull.
//  • Pull: cursor on server-set updated_at (with a small overlap window —
//    merging is idempotent). Local entities that changed since the last sync
//    win over incoming rows (they'll be re-pushed next cycle): deterministic
//    last-write-wins without data corruption.
//
// The mapping + merge core is pure and unit-tested; runSyncCycle does I/O.
// ============================================================================

export const SYNC_TABLES = ["projects", "documents", "chats", "messages", "notes", "decks", "cards", "badges"];
const PULL_ORDER = ["projects", "chats", "decks", "documents", "messages", "notes", "cards", "badges", "profiles"];
const CURSOR_OVERLAP_MS = 2000;

// ---------- stable hashing (djb2 over stable-stringified rows) ----------
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function hashRow(row) {
  const text = stableStringify(row);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}

const toIso = (ms) => new Date(Number(ms) || Date.now()).toISOString();
const toMs = (iso) => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
};

// ---------- local state → per-table rows ----------
export function stateToRows(state, userId) {
  const rows = {
    projects: [],
    documents: [],
    chats: [],
    messages: [],
    notes: [],
    decks: [],
    cards: [],
    badges: [],
    profiles: [],
  };

  for (const project of state.projects || []) {
    rows.projects.push({
      user_id: userId,
      id: project.id,
      name: project.name || "Untitled subject",
      domain_id: project.domainId || "general",
      color: project.color || "#9c8b74",
      mastery: project.mastery || {},
      deleted: false,
      created_at: toIso(project.createdAt || project.mastery?.updatedAt),
    });
    for (const doc of project.docs || []) {
      rows.documents.push({
        user_id: userId,
        id: doc.id,
        project_id: project.id,
        name: doc.name || "Untitled document",
        kind: doc.kind || "text",
        language: doc.language || null,
        pages: doc.pages || 0,
        chars: doc.chars || 0,
        // image previews are data URLs — those move to Storage later; sync text
        content: doc.kind === "code" ? String(doc.content || "") : String(doc.text || ""),
        note: doc.note || "",
        deleted: false,
        created_at: toIso(doc.addedAt || doc.createdAt),
      });
    }
  }

  for (const chat of state.chats || []) {
    rows.chats.push({
      user_id: userId,
      id: chat.id,
      project_id: chat.projectId || null,
      name: chat.name || "New chat",
      deleted: false,
      created_at: toIso(chat.createdAt),
    });
    for (const message of chat.messages || []) {
      if (message.streaming) continue; // never sync a half-streamed answer
      rows.messages.push({
        user_id: userId,
        id: message.id,
        chat_id: chat.id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: String(message.content || ""),
        display_content: message.displayContent || null,
        feedback: message.feedback || null,
        image_url: message.imageUrl || null,
        attachments: (message.attachments || []).map((file) => ({ id: file.id, name: file.name, kind: file.kind, chars: file.chars || 0 })),
        deleted: false,
        created_at: toIso(message.createdAt),
      });
    }
  }

  for (const note of state.notes || []) {
    rows.notes.push({
      user_id: userId,
      id: note.id,
      project_id: note.projectId || null,
      chat_id: note.chatId || null,
      title: note.title || "Study note",
      category: note.category || null,
      source: note.source || null,
      tags: note.tags || [],
      content: String(note.content || ""),
      shared: Boolean(note.shared),
      deleted: false,
      created_at: toIso(note.createdAt),
    });
  }

  for (const deck of state.flashcards || []) {
    rows.decks.push({
      user_id: userId,
      id: deck.id,
      project_id: deck.projectId || null,
      chat_id: deck.chatId || null,
      name: deck.chatName || "Flashcards",
      shared: Boolean(deck.shared),
      deleted: false,
      created_at: toIso(deck.createdAt),
    });
    (deck.cards || []).forEach((card, index) => {
      const { id, question, answer, ...srs } = card;
      rows.cards.push({
        user_id: userId,
        id: id,
        deck_id: deck.id,
        position: index,
        question: String(question || ""),
        answer: String(answer || ""),
        srs,
        deleted: false,
        created_at: toIso(card.createdAt || deck.createdAt),
      });
    });
  }

  for (const badge of state.badges || []) {
    rows.badges.push({
      user_id: userId,
      id: badge.id,
      badge_id: badge.badgeId,
      domain_id: badge.domainId || null,
      earned_at: toIso(badge.earnedAt),
    });
  }

  rows.profiles.push({
    user_id: userId,
    data: state.profile || {},
    settings: {
      theme: state.theme,
      colorTheme: state.colorTheme,
      fontId: state.fontId,
      textSize: state.textSize,
      activeMode: state.activeMode,
      onboardingComplete: Boolean(state.onboardingComplete),
    },
  });

  return rows;
}

export function rowKey(table, row) {
  return `${table}/${table === "profiles" ? "me" : row.id}`;
}

export function computeSnapshot(rowsByTable) {
  const snapshot = {};
  for (const [table, rows] of Object.entries(rowsByTable)) {
    for (const row of rows) snapshot[rowKey(table, row)] = hashRow(row);
  }
  return snapshot;
}

// Rows whose hash differs from the snapshot (new or changed since last sync).
export function diffAgainstSnapshot(rowsByTable, snapshot = {}) {
  const changed = {};
  for (const [table, rows] of Object.entries(rowsByTable)) {
    const dirty = rows.filter((row) => snapshot[rowKey(table, row)] !== hashRow(row));
    if (dirty.length) changed[table] = dirty;
  }
  return changed;
}

// Tombstone upserts for locally deleted entities.
export function tombstoneRows(state, userId) {
  const byTable = {};
  for (const tomb of state.tombstones || []) {
    if (!SYNC_TABLES.includes(tomb.table)) continue;
    (byTable[tomb.table] ||= []).push({
      user_id: userId,
      id: tomb.id,
      deleted: true,
      ...(tomb.table === "messages" ? { chat_id: tomb.parentId || "unknown", role: "user" } : {}),
      ...(tomb.table === "documents" ? { project_id: tomb.parentId || "unknown" } : {}),
      ...(tomb.table === "cards" ? { deck_id: tomb.parentId || "unknown" } : {}),
    });
  }
  return byTable;
}

// ---------- pulled rows → local entities ----------
function rowToDoc(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind || "text",
    language: row.language || undefined,
    pages: row.pages || 0,
    chars: row.chars || 0,
    ...(row.kind === "code" ? { content: row.content || "" } : { text: row.content || "" }),
    previewUrl: null,
    note: row.note || "",
    addedAt: toMs(row.created_at),
    createdAt: toMs(row.created_at),
  };
}

function rowToMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content || "",
    displayContent: row.display_content || null,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    feedback: row.feedback || null,
    imageUrl: row.image_url || null,
    createdAt: toMs(row.created_at),
    streaming: false,
  };
}

function rowToCard(row) {
  return {
    id: row.id,
    question: row.question || "",
    answer: row.answer || "",
    ...(row.srs && typeof row.srs === "object" ? row.srs : {}),
  };
}

// Every fresh device starts with an untouched "My first topic" starter
// project. When bootstrap pulls real projects from the cloud, that local
// starter (never renamed, no docs, no tracked concepts, no chat messages)
// is just a duplicate-in-waiting — drop it before it gets pushed.
export function prunePristineStarter(state, pulledProjectIds = new Set()) {
  if (!pulledProjectIds.size) return state;
  const isPristine = (project) =>
    project.name === "My first topic"
    && !pulledProjectIds.has(project.id)
    && !(project.docs || []).length
    && !(project.mastery?.concepts || []).length
    && (state.chats || []).filter((chat) => chat.projectId === project.id).every((chat) => !(chat.messages || []).length);
  const pruned = (state.projects || []).filter((project) => !isPristine(project));
  if (pruned.length === (state.projects || []).length || !pruned.length) return state;
  const prunedIds = new Set((state.projects || []).filter(isPristine).map((project) => project.id));
  const chats = (state.chats || []).filter((chat) => !prunedIds.has(chat.projectId));
  const activeId = chats.some((chat) => chat.id === state.activeId) ? state.activeId : chats[0]?.id || null;
  return { ...state, projects: pruned, chats, activeId };
}

// Apply pulled rows to local state. `dirtyKeys` are local rows changed since
// the last sync — those keep their local version (they win, and re-push).
export function applyPull(state, pulledByTable, dirtyKeys = new Set()) {
  let next = state;
  const clone = () => {
    if (next === state) next = { ...state };
    return next;
  };

  for (const table of PULL_ORDER) {
    const rows = pulledByTable[table] || [];
    for (const row of rows) {
      const key = rowKey(table, row);
      if (dirtyKeys.has(key)) continue; // local change wins

      if (table === "projects") {
        const target = clone();
        const existing = target.projects.find((item) => item.id === row.id);
        if (row.deleted) {
          if (existing) target.projects = target.projects.filter((item) => item.id !== row.id);
          continue;
        }
        const mapped = {
          id: row.id,
          name: row.name,
          domainId: row.domain_id || "general",
          color: row.color || "#9c8b74",
          mastery: row.mastery && typeof row.mastery === "object" ? row.mastery : { concepts: [], misconceptions: [], reflections: [], updatedAt: 0 },
          docs: existing?.docs || [],
          createdAt: toMs(row.created_at),
        };
        target.projects = existing
          ? target.projects.map((item) => (item.id === row.id ? { ...existing, ...mapped } : item))
          : [...target.projects, mapped];
      }

      if (table === "documents") {
        const target = clone();
        target.projects = target.projects.map((project) => {
          const has = (project.docs || []).some((doc) => doc.id === row.id);
          if (row.deleted) {
            return has ? { ...project, docs: project.docs.filter((doc) => doc.id !== row.id) } : project;
          }
          if (project.id !== row.project_id) {
            return has ? { ...project, docs: project.docs.filter((doc) => doc.id !== row.id) } : project;
          }
          const mapped = rowToDoc(row);
          return {
            ...project,
            docs: has
              ? project.docs.map((doc) => (doc.id === row.id ? { ...doc, ...mapped, previewUrl: doc.previewUrl } : doc))
              : [...(project.docs || []), mapped],
          };
        });
      }

      if (table === "chats") {
        const target = clone();
        const existing = target.chats.find((item) => item.id === row.id);
        if (row.deleted) {
          if (existing) target.chats = target.chats.filter((item) => item.id !== row.id);
          continue;
        }
        const mapped = {
          id: row.id,
          name: row.name,
          projectId: row.project_id || null,
          messages: existing?.messages || [],
          createdAt: toMs(row.created_at),
        };
        target.chats = existing
          ? target.chats.map((item) => (item.id === row.id ? { ...existing, ...mapped } : item))
          : [...target.chats, mapped];
      }

      if (table === "messages") {
        const target = clone();
        target.chats = target.chats.map((chat) => {
          const has = (chat.messages || []).some((message) => message.id === row.id);
          if (row.deleted || chat.id !== row.chat_id) {
            return has && (row.deleted || chat.id !== row.chat_id)
              ? { ...chat, messages: chat.messages.filter((message) => message.id !== row.id) }
              : chat;
          }
          const mapped = rowToMessage(row);
          const messages = has
            ? chat.messages.map((message) => (message.id === row.id ? { ...message, ...mapped } : message))
            : [...(chat.messages || []), mapped].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          return { ...chat, messages };
        });
      }

      if (table === "notes") {
        const target = clone();
        const existing = target.notes.find((item) => item.id === row.id);
        if (row.deleted) {
          if (existing) target.notes = target.notes.filter((item) => item.id !== row.id);
          continue;
        }
        const mapped = {
          id: row.id,
          projectId: row.project_id || null,
          chatId: row.chat_id || null,
          title: row.title,
          category: row.category || null,
          source: row.source || null,
          tags: Array.isArray(row.tags) ? row.tags : [],
          content: row.content || "",
          shared: Boolean(row.shared),
          createdAt: toMs(row.created_at),
        };
        target.notes = existing
          ? target.notes.map((item) => (item.id === row.id ? { ...existing, ...mapped } : item))
          : [mapped, ...target.notes];
      }

      if (table === "decks") {
        const target = clone();
        const existing = target.flashcards.find((item) => item.id === row.id);
        if (row.deleted) {
          if (existing) target.flashcards = target.flashcards.filter((item) => item.id !== row.id);
          continue;
        }
        const mapped = {
          id: row.id,
          projectId: row.project_id || null,
          chatId: row.chat_id || null,
          chatName: row.name,
          shared: Boolean(row.shared),
          cards: existing?.cards || [],
          createdAt: toMs(row.created_at),
        };
        target.flashcards = existing
          ? target.flashcards.map((item) => (item.id === row.id ? { ...existing, ...mapped } : item))
          : [...target.flashcards, mapped];
      }

      if (table === "cards") {
        const target = clone();
        target.flashcards = target.flashcards.map((deck) => {
          const has = (deck.cards || []).some((card) => card.id === row.id);
          if (row.deleted || deck.id !== row.deck_id) {
            return has && (row.deleted || deck.id !== row.deck_id)
              ? { ...deck, cards: deck.cards.filter((card) => card.id !== row.id) }
              : deck;
          }
          const mapped = rowToCard(row);
          let cards;
          if (has) {
            cards = deck.cards.map((card) => (card.id === row.id ? { ...card, ...mapped } : card));
          } else {
            cards = [...(deck.cards || [])];
            cards.splice(Math.min(row.position ?? cards.length, cards.length), 0, mapped);
          }
          return { ...deck, cards };
        });
      }

      if (table === "badges") {
        const target = clone();
        const existing = (target.badges || []).find((item) => item.id === row.id);
        if (!existing) {
          target.badges = [...(target.badges || []), {
            id: row.id,
            badgeId: row.badge_id,
            domainId: row.domain_id || null,
            earnedAt: toMs(row.earned_at),
          }];
        }
      }

      if (table === "profiles") {
        const target = clone();
        if (row.data && typeof row.data === "object" && Object.keys(row.data).length) {
          target.profile = row.data;
        }
        const settings = row.settings || {};
        if (settings.theme === "light" || settings.theme === "dark") target.theme = settings.theme;
        if (["studyhall", "indigo", "mono"].includes(settings.colorTheme)) target.colorTheme = settings.colorTheme;
        if (settings.fontId) target.fontId = settings.fontId;
        if (Number.isFinite(Number(settings.textSize))) target.textSize = Number(settings.textSize);
        if (settings.activeMode) target.activeMode = settings.activeMode;
        if (settings.onboardingComplete) target.onboardingComplete = true;
      }
    }
  }

  return next;
}

// Remove tombstones that were successfully pushed.
export function clearTombstones(state, pushedKeys) {
  const remaining = (state.tombstones || []).filter((tomb) => !pushedKeys.has(`${tomb.table}/${tomb.id}`));
  if (remaining.length === (state.tombstones || []).length) return state;
  return { ...state, tombstones: remaining };
}

// ---------- the I/O cycle ----------
async function pullPhase(client, cursor) {
  const pulled = {};
  let count = 0;
  let maxSeen = cursor;
  for (const table of PULL_ORDER) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .gt("updated_at", cursor)
      .order("updated_at", { ascending: true })
      .limit(2000);
    if (error) throw new Error(`pull ${table}: ${error.message}`);
    if (data?.length) {
      pulled[table] = data;
      count += data.length;
      const last = data[data.length - 1].updated_at;
      if (last > maxSeen) maxSeen = last;
    }
  }
  return { pulled, count, maxSeen };
}

// getState(): current local state; applyState(updater): commit a state update
// atomically (App passes its updateState). Returns updated sync meta.
export async function runSyncCycle({ client, userId, getState, applyState, meta = {} }) {
  const snapshot = meta.snapshot || {};
  const isBootstrap = !meta.cursor;
  const cursor = meta.cursor || new Date(0).toISOString();

  // ---- bootstrap: pull FIRST so a fresh device never clobbers the cloud ----
  // (every state has e.g. a default profile row; pushing it before the first
  // pull would overwrite the real one). Cloud wins on bootstrap; anything
  // that only exists locally — a guest's pre-sign-in work — is still dirty
  // afterwards and gets pushed below.
  let workingState = getState();
  let bootPulledCount = 0;
  let maxSeen = cursor;
  if (isBootstrap) {
    const boot = await pullPhase(client, cursor);
    bootPulledCount = boot.count;
    if (boot.maxSeen > maxSeen) maxSeen = boot.maxSeen;
    if (boot.count) {
      const pulledProjectIds = new Set((boot.pulled.projects || []).map((row) => row.id));
      applyState((current) => prunePristineStarter(applyPull(current, boot.pulled, new Set()), pulledProjectIds));
      workingState = prunePristineStarter(applyPull(workingState, boot.pulled, new Set()), pulledProjectIds);
    }
  }

  // ---- push local changes (diff vs last-sync snapshot) ----
  const rows = stateToRows(workingState, userId);
  const changed = diffAgainstSnapshot(rows, snapshot);
  const tombs = tombstoneRows(workingState, userId);

  let pushedCount = 0;
  const pushedTombKeys = new Set();

  for (const table of PULL_ORDER) {
    const upserts = [...(changed[table] || []), ...(tombs[table] || [])];
    if (!upserts.length) continue;
    const conflictKey = table === "profiles" ? "user_id" : "user_id,id";
    for (let i = 0; i < upserts.length; i += 200) {
      const batch = upserts.slice(i, i + 200);
      const { data, error } = await client.from(table).upsert(batch, { onConflict: conflictKey }).select("updated_at");
      if (error) throw new Error(`push ${table}: ${error.message}`);
      pushedCount += batch.length;
      for (const row of data || []) {
        if (row.updated_at > maxSeen) maxSeen = row.updated_at;
      }
    }
    for (const tomb of tombs[table] || []) pushedTombKeys.add(`${table}/${tomb.id}`);
  }

  // ---- steady-state pull (bootstrap already pulled everything) ----
  let pulled = {};
  let pulledCount = 0;
  if (!isBootstrap) {
    const phase = await pullPhase(client, cursor);
    pulled = phase.pulled;
    pulledCount = phase.count;
    if (phase.maxSeen > maxSeen) maxSeen = phase.maxSeen;
  }

  // Locally dirty rows win over pulled rows (they re-push next cycle).
  const dirtyKeys = new Set(
    Object.entries(changed).flatMap(([table, tableRows]) => tableRows.map((row) => rowKey(table, row))),
  );

  // Compute the snapshot from a synchronous preview merge — React applies the
  // real update asynchronously (and against the then-current state, so edits
  // made mid-sync survive; any divergence simply re-pushes next cycle).
  const mergedPreview = clearTombstones(applyPull(workingState, pulled, dirtyKeys), pushedTombKeys);
  applyState((current) => clearTombstones(applyPull(current, pulled, dirtyKeys), pushedTombKeys));

  const nextSnapshot = computeSnapshot(stateToRows(mergedPreview, userId));
  const nextCursor = new Date(Math.max(0, toMs(maxSeen) - CURSOR_OVERLAP_MS)).toISOString();

  return {
    meta: { snapshot: nextSnapshot, cursor: nextCursor },
    pushed: pushedCount,
    pulled: pulledCount + bootPulledCount,
  };
}
