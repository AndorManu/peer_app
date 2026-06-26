// The "learning brain" subsystem: an interactive 3D concept map (Three.js)
// plus the graph-building logic that turns the learner's projects, concepts,
// notes, and chats into nodes and links. Extracted wholesale from App.jsx —
// it is self-contained and its only public entry point is LearningBrainPanel.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Brain, GitBranch, RotateCcw, Search } from "lucide-react";

export function LearningBrainPanel({ state, activeProject, setView, updateState, setManagedProjectId, setSelectedDocId, onPractice }) {
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
    code: true,
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
          <h1>Your Brain</h1>
          <p>A living map of everything you're learning · drag to orbit, click a node</p>
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
            ["code", "Code"],
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
            <span><i className="brain-dot code" /> Code</span>
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
              {(selectedNode.type === "concept" || selectedNode.type === "weak") && onPractice && (
                <button className="brain-open-btn" onClick={() => onPractice(selectedNode.label, { context: selectedNode.evidence })}>
                  Practice this
                </button>
              )}
              <button className="brain-open-btn brain-open-secondary" onClick={() => openNode(selectedNode)}>
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

// Design palette (Peer.dc.html): project=violet, concept=cyan, weak=amber,
// with complementary hues for the extra node types the real feature keeps.
const BRAIN_PALETTE = {
  brain: { core: 0xc9c2fb, glow: 0x8b5cf6 },
  project: { core: 0xb9a8ff, glow: 0x8b5cf6 },
  concept: { core: 0x7fe9ff, glow: 0x22d3ee },
  weak: { core: 0xffd08a, glow: 0xf59e0b },
  file: { core: 0xa5b4fc, glow: 0x818cf8 },
  note: { core: 0xffcd86, glow: 0xfb923c },
  chat: { core: 0x8ef0c9, glow: 0x34d399 },
  quiz: { core: 0xf3b6f7, glow: 0xe879f9 },
  code: { core: 0xeaffb0, glow: 0x84cc16 },
};

function brainPalette(type) {
  return BRAIN_PALETTE[type] || BRAIN_PALETTE.concept;
}

function brainNodeRadius(node) {
  if (node.type === "brain") return 1.3;
  if (node.type === "project") return 0.78;
  if (node.type === "code") return 0.5;
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
    scene.fog = new THREE.FogExp2(0x07070c, 0.014);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // Nodes are pure additive glow+core sprites (design look) — no lighting needed.
    const lightenColor = (hex, amt) => { const c = new THREE.Color(hex); c.r += (1 - c.r) * amt; c.g += (1 - c.g) * amt; c.b += (1 - c.b) * amt; return c; };
    const glowTexture = makeGlowTexture();

    // Soft focal haze behind the graph.
    const hazeMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: 0x1b1640, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const haze = new THREE.Sprite(hazeMaterial);
    haze.scale.setScalar(52);
    haze.position.set(0, 0, -8);
    scene.add(haze);

    // Star field (design aesthetic) — a sphere of faint points, slow rotation.
    const starCount = 1100;
    const starPos = new Float32Array(starCount * 3);
    for (let s = 0; s < starCount; s += 1) {
      const sr = 90 + Math.random() * 160;
      const sth = Math.random() * Math.PI * 2;
      const sph = Math.acos(2 * Math.random() - 1);
      starPos[s * 3] = sr * Math.sin(sph) * Math.cos(sth);
      starPos[s * 3 + 1] = sr * Math.sin(sph) * Math.sin(sth);
      starPos[s * 3 + 2] = sr * Math.cos(sph);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.45, sizeAttenuation: true, depthWrite: false });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

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
        // bright additive core sprite (replaces the old lit sphere)
        const material = new THREE.SpriteMaterial({ map: glowTexture, color: lightenColor(palette.core, 0.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.95 });
        const mesh = new THREE.Sprite(material);
        mesh.scale.setScalar(radius);
        mesh.position.copy(state.pos[i]);
        mesh.userData = { id: node.id, i };
        mesh.renderOrder = 2;
        nodeGroup.add(mesh);
        state.meshes.push(mesh);
        state.materials.push(material);

        const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: palette.glow, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
        const glow = new THREE.Sprite(glowMaterial);
        const glowScale = radius * (node.type === "brain" ? 4 : node.type === "project" ? 3.8 : 3.4);
        glow.scale.setScalar(glowScale);
        glow.position.copy(state.pos[i]);
        glow.renderOrder = 1;
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
          material.opacity = targetOpacity * 0.95;
          state.meshes[i].scale.setScalar(targetScale);
        }
        material.userData = { targetOpacity: targetOpacity * 0.95, targetScale };
        glowMaterial.userData = { targetOpacity: set ? (inSet ? 0.6 : 0.06) : 0.6 };
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
      stars.rotation.y = frame * 0.0004;

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
      lineGeometry.dispose();
      lineMaterial.dispose();
      hazeMaterial.dispose();
      starGeo.dispose(); starMat.dispose();
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
  const filteredCodeNodes = codeNodes.filter((node) => matchesBrainQuery(node, query));
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

