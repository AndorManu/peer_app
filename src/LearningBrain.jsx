// The "learning brain" subsystem: an interactive 3D concept map (Three.js)
// with a fully equivalent accessible outline view. Graph-building logic lives
// in brainGraph.js (pure, unit-tested); this file renders it.
//
// Views:
//  • Map — additive-glow 3D graph. Shape-coded sprites (ring = hub, circle =
//    concept, diamond = weak spot, square = source) so type never relies on
//    color alone. Mouse, trackpad, and touch (drag-orbit, pinch-zoom, tap).
//  • Outline — keyboard/screen-reader equivalent tree of the same graph:
//    domains → subjects → concepts → sources, same selection + actions.
// If WebGL is unavailable the outline takes over automatically.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import StyledSelect from "./components/StyledSelect.jsx";
import { Brain, GitBranch, List, Maximize2, Minimize2, Minus, Orbit, RotateCcw, Search, TrendingDown, TrendingUp } from "lucide-react";
import {
  brainLinkRest,
  brainNodeRadius,
  brainPalette,
  buildBrainOutline,
  buildLearningBrainGraph,
  nodeTrajectory,
  nodeTypeLabel,
  refreshBrainThemeAccent,
  relativeDate,
  shapeForType,
  shortLabel,
} from "./brainGraph.js";

const TRAJECTORY_META = {
  improving: { icon: TrendingUp, label: "Improving", className: "traj-improving" },
  slipping: { icon: TrendingDown, label: "Slipping — revisit soon", className: "traj-slipping" },
  steady: { icon: Minus, label: "Steady", className: "traj-steady" },
};

export function LearningBrainPanel({ state, activeProject, setView, updateState, setManagedProjectId, setSelectedDocId, onPractice, onExplain }) {
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
  const [webglFailed, setWebglFailed] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem("peer-brain-view") === "list" ? "list" : "map"; }
    catch { return "map"; }
  });
  const effectiveMode = webglFailed ? "list" : viewMode;
  const [isFullscreen, setIsFullscreen] = useState(false);

  function chooseViewMode(mode) {
    setViewMode(mode);
    try { localStorage.setItem("peer-brain-view", mode); } catch { /* private mode */ }
  }

  // Fullscreen = immersive mode: the app chrome (nav rail / bottom nav)
  // collapses so the canvas genuinely fills the viewport, PLUS true browser
  // fullscreen wherever the environment allows it (some webviews deny the
  // Fullscreen API — the chrome collapse must not depend on it).
  const browserFsRef = useRef(false);
  async function toggleFullscreen() {
    if (isFullscreen) {
      setIsFullscreen(false);
      if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* fine */ } }
      return;
    }
    setIsFullscreen(true);
    try {
      await document.documentElement.requestFullscreen();
      browserFsRef.current = true;
    } catch { browserFsRef.current = false; }
  }
  useEffect(() => {
    // leaving REAL browser fullscreen (Escape/F11) also leaves immersive mode
    const onChange = () => {
      if (!document.fullscreenElement && browserFsRef.current) {
        browserFsRef.current = false;
        setIsFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("brain-fullscreen", isFullscreen);
    return () => document.body.classList.remove("brain-fullscreen");
  }, [isFullscreen]);

  useEffect(() => {
    if (!projectId && firstProjectId) setProjectId(firstProjectId);
  }, [firstProjectId, projectId]);

  const focusedProject = scope === "project"
    ? state.projects.find((item) => item.id === projectId) || state.projects[0] || null
    : null;
  const graph = useMemo(
    () => {
      refreshBrainThemeAccent(); // hub colors follow the active data-theme
      return buildLearningBrainGraph(state, focusedProject, filters, { query });
    },
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
    if (node.type === "domain") {
      // focus the cluster's first subject
      const member = graph.nodes.find((item) => item.type === "project" && item.domainId === node.domainId);
      if (member) {
        setScope("project");
        setProjectId(member.sourceId || member.projectId);
        setSelectedNodeId("");
        setCameraReset((value) => value + 1);
      }
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
    if (node.type === "file" || node.type === "code") {
      setManagedProjectId(node.projectId);
      setSelectedDocId(node.sourceId);
    }
    if (node.type === "note") setView("notes");
    if (node.type === "quiz") setView("flashcards");
  }

  const isConceptNode = selectedNode && (selectedNode.type === "concept" || selectedNode.type === "weak");
  const trajectory = isConceptNode ? nodeTrajectory(selectedNode) : null;
  const trajectoryMeta = trajectory && TRAJECTORY_META[trajectory];

  return (
    <section className="learning-brain-panel">
      <div className="brain-heading">
        <div>
          <span className="brain-kicker"><GitBranch size={14} /> Learning graph</span>
          <h1>Your Brain</h1>
          <p>A living map of everything you're learning · {effectiveMode === "map" ? "drag to orbit · right-drag or two fingers to pan · scroll/pinch zooms where you point · Reset re-frames it all" : "browse the outline, every node is a button"}</p>
        </div>
        <div className="brain-summary">
          <span><strong>{graph.summary.projects}</strong> subjects</span>
          <span><strong>{graph.summary.concepts}</strong> concepts</span>
          <span><strong>{graph.summary.weak}</strong> weak spots</span>
          <span><strong>{graph.summary.sources}</strong> sources</span>
        </div>
      </div>

      <div className="brain-toolbar">
        <div className="brain-toolbar-fields">
          <label>
            Scope
            <StyledSelect value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="global">All subjects</option>
              <option value="project">Single subject</option>
            </StyledSelect>
          </label>
          <label>
            Subject
            <StyledSelect
              value={projectId}
              disabled={scope === "global"}
              onChange={(event) => {
                setProjectId(event.target.value);
                setCameraReset((value) => value + 1);
              }}
            >
              {state.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </StyledSelect>
          </label>
          <label className="brain-search">
            Search brain
            <span>
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Concept, file, chat..." aria-label="Search the brain" />
            </span>
          </label>
        </div>
        <div className="brain-filter-row">
          <div className="brain-view-toggle" role="group" aria-label="Brain view mode">
            <button
              type="button"
              className={effectiveMode === "map" ? "active" : ""}
              aria-pressed={effectiveMode === "map"}
              disabled={webglFailed}
              title={webglFailed ? "3D is unavailable on this device" : "3D map view"}
              onClick={() => chooseViewMode("map")}
            >
              <Orbit size={14} aria-hidden="true" /> Map
            </button>
            <button
              type="button"
              className={effectiveMode === "list" ? "active" : ""}
              aria-pressed={effectiveMode === "list"}
              onClick={() => chooseViewMode("list")}
            >
              <List size={14} aria-hidden="true" /> Outline
            </button>
          </div>
          {[
            ["projects", "Subjects"],
            ["concepts", "Concepts"],
            ["weak", "Weak spots"],
            ["files", "Files"],
            ["code", "Code"],
            ["notes", "Notes"],
            ["chats", "Chats"],
            ["quizzes", "Quizzes"],
          ].map(([key, label]) => (
            <button key={key} className={filters[key] ? "active" : ""} aria-pressed={filters[key]} onClick={() => toggleFilter(key)}>
              {label}
            </button>
          ))}
          {effectiveMode === "map" && (
            <button className="brain-reset-view" onClick={() => setCameraReset((value) => value + 1)}>
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </button>
          )}
          <button
            className="brain-reset-view"
            onClick={toggleFullscreen}
            aria-pressed={isFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen — the map takes the whole screen"}
          >
            {isFullscreen ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
            {isFullscreen ? " Exit" : " Fullscreen"}
          </button>
        </div>
      </div>

      <div className="brain-workspace">
        <div className={`brain-map-card ${effectiveMode === "list" ? "outline-mode" : ""}`}>
          {effectiveMode === "map" ? (
            <>
              <div className="brain-map-legend" aria-hidden="true">
                <span><i className="brain-dot domain" /> Domain</span>
                <span><i className="brain-dot project" /> Subject</span>
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
                onContextFail={() => setWebglFailed(true)}
              />
            </>
          ) : (
            <BrainOutline
              graph={graph}
              selectedNodeId={selectedNode?.id || ""}
              setSelectedNodeId={setSelectedNodeId}
              webglFailed={webglFailed}
            />
          )}
        </div>

        <aside className="brain-detail" aria-label="Selected node details">
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
              {trajectoryMeta && (
                <div className={`brain-trajectory ${trajectoryMeta.className}`}>
                  <trajectoryMeta.icon size={15} aria-hidden="true" />
                  <span>{trajectoryMeta.label}</span>
                  <MasterySparkline history={selectedNode.history} />
                </div>
              )}
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
                      <span className={`brain-dot ${item.type}`} aria-hidden="true" />
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
              {isConceptNode && onPractice && (
                <button className="brain-open-btn" onClick={() => onPractice(selectedNode.label, { context: selectedNode.evidence, projectId: selectedNode.projectId })}>
                  Practice this
                </button>
              )}
              {isConceptNode && onExplain && (
                <button className="brain-open-btn brain-open-secondary" onClick={() => onExplain(selectedNode.label, { context: selectedNode.evidence, projectId: selectedNode.projectId })}>
                  Explain this to me
                </button>
              )}
              <button className="brain-open-btn brain-open-secondary" onClick={() => openNode(selectedNode)}>
                {selectedNode.type === "brain"
                  ? "Open profile"
                  : selectedNode.type === "domain" || selectedNode.type === "project"
                    ? "Focus this"
                    : isConceptNode
                      ? "Inspect connections"
                      : "Open source"}
              </button>
            </>
          ) : (
            <div className="empty-state compact">
              <Brain size={28} />
              <strong>No brain nodes yet</strong>
              <span>Start a chat or drop materials into a subject to grow the graph.</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

// Tiny mastery-over-time line for the detail panel.
function MasterySparkline({ history }) {
  const points = Array.isArray(history) ? history : [];
  if (points.length < 2) return null;
  const width = 96;
  const height = 26;
  const path = points
    .map((entry, index) => {
      const x = (index / (points.length - 1)) * (width - 4) + 2;
      const y = height - 3 - Math.max(0, Math.min(1, entry.confidence || 0)) * (height - 6);
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(" ");
  const summary = points.map((entry) => `${Math.round((entry.confidence || 0) * 100)}%`).join(", ");
  return (
    <svg
      className="brain-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Mastery over time: ${summary}`}
    >
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Accessible outline view: the same graph as a keyboard-navigable tree ──
function BrainOutline({ graph, selectedNodeId, setSelectedNodeId, webglFailed }) {
  const outline = useMemo(() => buildBrainOutline(graph), [graph]);

  function row(node, extraClass = "") {
    const trajectory = (node.type === "concept" || node.type === "weak") ? nodeTrajectory(node) : null;
    const meta = [
      nodeTypeLabel(node),
      node.confidence != null ? `${Math.round(node.confidence * 100)}% mastery` : null,
      trajectory && trajectory !== "new" ? trajectory : null,
    ].filter(Boolean).join(" · ");
    return (
      <button
        type="button"
        className={`outline-row ${node.type} ${extraClass} ${selectedNodeId === node.id ? "active" : ""}`}
        aria-current={selectedNodeId === node.id ? "true" : undefined}
        onClick={() => setSelectedNodeId(node.id)}
      >
        <i className={`brain-dot ${node.type}`} aria-hidden="true" />
        <span className="outline-label">{node.label}</span>
        <span className="outline-meta">{meta}</span>
      </button>
    );
  }

  return (
    <nav className="brain-outline" aria-label="Learning brain outline">
      {webglFailed && (
        <p className="brain-outline-notice" role="status">
          3D isn't available on this device, so here's the same brain as an outline.
        </p>
      )}
      {outline.root && row(outline.root, "outline-root")}
      <ul>
        {outline.groups.map((group, groupIndex) => (
          <li key={group.domain?.id || `ungrouped-${groupIndex}`}>
            {group.domain && row(group.domain)}
            <ul>
              {group.projects.map(({ node, concepts, sources }) => (
                <li key={node.id}>
                  {node.id !== outline.root?.id && row(node)}
                  {(concepts.length > 0 || sources.length > 0) && (
                    <ul>
                      {concepts.map((concept) => <li key={concept.id}>{row(concept)}</li>)}
                      {sources.map((source) => <li key={source.id}>{row(source)}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
        {outline.orphans.map((node) => <li key={node.id}>{row(node)}</li>)}
      </ul>
    </nav>
  );
}

// ── Sprite textures: soft glow halo + shape-coded cores ──
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

function makeShapeTexture(shape) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;

  if (shape === "circle") {
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.2, "rgba(255,255,255,0.85)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.28)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  } else if (shape === "ring") {
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, "rgba(255,255,255,0.30)");
    gradient.addColorStop(0.30, "rgba(255,255,255,0.10)");
    gradient.addColorStop(0.46, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.58, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.74, "rgba(255,255,255,0.14)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  } else {
    // diamond / square: soft-glow filled shape
    ctx.shadowColor = "rgba(255,255,255,0.9)";
    ctx.shadowBlur = 26;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    const half = size * 0.21;
    ctx.save();
    ctx.translate(c, c);
    if (shape === "diamond") ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    const r = 6;
    ctx.moveTo(-half + r, -half);
    ctx.lineTo(half - r, -half);
    ctx.quadraticCurveTo(half, -half, half, -half + r);
    ctx.lineTo(half, half - r);
    ctx.quadraticCurveTo(half, half, half - r, half);
    ctx.lineTo(-half + r, half);
    ctx.quadraticCurveTo(-half, half, -half, half - r);
    ctx.lineTo(-half, -half + r);
    ctx.quadraticCurveTo(-half, -half, -half, -half);
    ctx.closePath();
    ctx.fill();
    ctx.fill(); // double fill strengthens the soft core
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ThreeBrainMap({ graph, selectedNodeId, setSelectedNodeId, resetSignal, onContextFail }) {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const positionsRef = useRef(new Map());
  const setSelectedRef = useRef(setSelectedNodeId);
  const onContextFailRef = useRef(onContextFail);
  const [labels, setLabels] = useState([]);

  useEffect(() => {
    setSelectedRef.current = setSelectedNodeId;
    onContextFailRef.current = onContextFail;
  }, [setSelectedNodeId, onContextFail]);

  // Mount-once engine: renderer, scene, camera, simulation, interaction.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      // No WebGL on this device/browser — the outline view takes over.
      onContextFailRef.current?.();
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x15120d, 0.014);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = "none"; // we own pan/pinch gestures
    mount.appendChild(renderer.domElement);

    const lightenColor = (hex, amt) => { const color = new THREE.Color(hex); color.r += (1 - color.r) * amt; color.g += (1 - color.g) * amt; color.b += (1 - color.b) * amt; return color; };
    const glowTexture = makeGlowTexture();
    const shapeTextures = {
      circle: makeShapeTexture("circle"),
      ring: makeShapeTexture("ring"),
      diamond: makeShapeTexture("diamond"),
      square: makeShapeTexture("square"),
    };

    // Soft focal haze behind the graph.
    const hazeMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: 0x2a2114, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const haze = new THREE.Sprite(hazeMaterial);
    haze.scale.setScalar(52);
    haze.position.set(0, 0, -8);
    scene.add(haze);

    // Star field — a sphere of faint points, slow rotation.
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
      linkBase: [],
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
    const activePointers = new Map(); // pointerId -> {x, y} for pinch
    let pinchStartDistance = 0;
    let pinchStartRadius = 26;
    // free navigation: pan basis vectors + the point under the cursor/pinch
    const panRight = new THREE.Vector3();
    const panUp = new THREE.Vector3();
    const zoomPlane = new THREE.Plane();
    const zoomPoint = new THREE.Vector3();
    const RADIUS_MIN = 7;
    const RADIUS_MAX = 90;

    // translate the orbit target along the camera's screen axes — this is
    // what "drag the whole view around" means in an orbit rig
    function panBy(dx, dy) {
      autoFit = false;
      const scale = cam.radius * 0.0016; // distance-proportional so it feels constant
      panRight.setFromMatrixColumn(camera.matrix, 0);
      panUp.setFromMatrixColumn(camera.matrix, 1);
      goal.target.addScaledVector(panRight, -dx * scale);
      goal.target.addScaledVector(panUp, dy * scale);
    }

    // zoom toward the point under the cursor/pinch-midpoint (map-app feel):
    // the target slides toward that point by the same proportion the radius
    // shrinks, so what you're pointing at stays put while everything else
    // rushes past it.
    function zoomAt(clientX, clientY, factor) {
      autoFit = false;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      camera.getWorldDirection(tmpDir);
      zoomPlane.setFromNormalAndCoplanarPoint(tmpDir, goal.target);
      const newRadius = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, goal.radius * factor));
      if (raycaster.ray.intersectPlane(zoomPlane, zoomPoint)) {
        const t = 1 - newRadius / goal.radius;
        if (t > 0) goal.target.lerp(zoomPoint, t); // zooming in: pull toward the cursor
      }
      goal.radius = newRadius;
    }
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
      const ring = node.type === "domain" ? 4.5 : node.type === "project" ? 6 : 9 + Math.random() * 4;
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
        const palette = brainPalette(node);
        const radius = state.baseRadius[i];
        // bright additive shape-coded core sprite
        const material = new THREE.SpriteMaterial({ map: shapeTextures[shapeForType(node.type)], color: lightenColor(palette.core, 0.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.95 });
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
        const glowScale = radius * (node.type === "brain" ? 4 : node.type === "domain" ? 3.9 : node.type === "project" ? 3.8 : 3.4);
        glow.scale.setScalar(glowScale);
        glow.position.copy(state.pos[i]);
        glow.renderOrder = 1;
        nodeGroup.add(glow);
        state.glows.push(glow);
        state.glowMaterials.push(glowMaterial);
      }

      // Per-link base tint from the parent node's palette, so each cluster's
      // edges carry its color (subtly).
      state.linkBase = state.links.map((link) => {
        const source = state.nodeMap.get(link.source);
        const palette = brainPalette(source);
        const color = new THREE.Color(palette.glow);
        return { r: color.r * 0.34, g: color.g * 0.34, b: color.b * 0.34 };
      });

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

    // Hovering a node focuses the graph on its neighbourhood. Selection (from
    // the side panel) only emphasises a single node and never dims the rest.
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
          const base = state.linkBase[i] || { r: 0.17, g: 0.28, b: 0.4 };
          r = base.r; g = base.g; b = base.b;
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
        const baseEmissive = node.type === "brain" ? 0.5 : node.type === "domain" ? 0.48 : node.type === "project" ? 0.46 : 0.4;
        const targetEmissive = isHot ? 0.95 : inSet ? baseEmissive : baseEmissive * 0.45;
        const targetScale = (isHot ? 1.4 : 1) * state.baseRadius[i];
        const material = state.materials[i];
        const glowMaterial = state.glowMaterials[i];
        if (immediate) {
          material.opacity = targetOpacity * 0.95;
          state.meshes[i].scale.setScalar(targetScale);
        }
        material.userData = { targetOpacity: targetOpacity * 0.95, targetScale, targetEmissive };
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
      const knowledgeTypes = new Set(["brain", "domain", "project", "concept", "weak"]);
      const next = [];
      for (let i = 0; i < state.nodes.length; i += 1) {
        const node = state.nodes[i];
        projV.copy(state.pos[i]).project(camera);
        if (projV.z >= 1) continue; // behind the camera
        let show = knowledgeTypes.has(node.type) || zoomedIn;
        if (set) show = set.has(node.id) || knowledgeTypes.has(node.type);
        if (node.id === state.selected || node.id === state.hovered) show = true;
        if (!show) continue;
        const strong = node.id === state.hovered || node.id === state.selected || node.type === "brain" || node.type === "domain";
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

    const reduceMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    function tick() {
      animationId = requestAnimationFrame(tick);
      frame += 1;
      const dt = 0.85;
      // Decorative motion pauses under prefers-reduced-motion; the graph
      // stays interactive.
      if (!reduceMotion) {
        hazeMaterial.opacity = 0.26 + Math.sin(frame * 0.018) * 0.06;
        stars.rotation.y = frame * 0.0004;
      }

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

    function pinchDistance() {
      const [a, b] = [...activePointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }
    function pinchMidpoint() {
      const [a, b] = [...activePointers.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    let pinchLastMid = { x: 0, y: 0 };

    function onPointerDown(event) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size === 2) {
        // second finger: pinch-zoom + two-finger pan together, map-style
        pointerState.mode = "pinch";
        pointerState.down = true;
        state.pinned = -1;
        pinchStartDistance = pinchDistance();
        pinchStartRadius = goal.radius;
        pinchLastMid = pinchMidpoint();
        return;
      }
      pointerState.down = true;
      pointerState.x = event.clientX;
      pointerState.y = event.clientY;
      state.dragMoved = false;
      // right- or middle-drag (or shift+drag) = free pan; left on a node =
      // move the node; left on space = orbit (unchanged)
      if (event.button === 2 || event.button === 1 || event.shiftKey) {
        pointerState.mode = "pan";
        renderer.domElement.style.cursor = "grabbing";
        renderer.domElement.setPointerCapture?.(event.pointerId);
        return;
      }
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
      if (activePointers.has(event.pointerId)) {
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (pointerState.mode === "pinch" && activePointers.size >= 2) {
        autoFit = false;
        // pinch zooms toward the fingers' midpoint...
        const mid = pinchMidpoint();
        const scale = pinchStartDistance / pinchDistance();
        const targetRadius = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, pinchStartRadius * scale));
        zoomAt(mid.x, mid.y, targetRadius / goal.radius);
        // ...and the midpoint's movement pans the view (two-finger drag)
        panBy(mid.x - pinchLastMid.x, mid.y - pinchLastMid.y);
        pinchLastMid = mid;
        return;
      }
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
      } else if (pointerState.mode === "pan") {
        panBy(dx, dy);
      } else {
        goal.theta -= dx * 0.006;
        goal.phi = Math.max(0.25, Math.min(Math.PI - 0.25, goal.phi - dy * 0.006));
      }
    }

    function onPointerUp(event) {
      activePointers.delete(event.pointerId);
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      if (pointerState.mode === "pinch") {
        if (activePointers.size < 2) {
          pointerState.mode = "idle";
          pointerState.down = false;
        }
        return;
      }
      if (pointerState.mode === "node" && !state.dragMoved) {
        const mesh = pickMesh(event);
        if (mesh) setSelectedRef.current(mesh.userData.id);
      }
      if (state.pinned >= 0) state.alpha = Math.max(state.alpha, 0.45);
      state.pinned = -1;
      pointerState.down = false;
      pointerState.mode = "idle";
      renderer.domElement.style.cursor = "grab";
    }

    // right-drag pans, so the context menu must not steal the gesture
    function onContextMenu(event) { event.preventDefault(); }

    function onWheel(event) {
      event.preventDefault();
      // multiplicative zoom toward the CURSOR, not the center — map-app feel
      zoomAt(event.clientX, event.clientY, Math.exp(event.deltaY * 0.0012));
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
        // fit-to-view: frame EVERYTHING from the real node positions, not
        // just snap back to the hub — the "I'm lost, show me the whole map"
        // control.
        if (state.pos.length) {
          const center = new THREE.Vector3();
          for (const p of state.pos) center.add(p);
          center.divideScalar(state.pos.length);
          let maxD = 2;
          for (const p of state.pos) maxD = Math.max(maxD, p.distanceTo(center));
          goal.target.copy(center);
          goal.radius = Math.max(15, Math.min(RADIUS_MAX, maxD * 2.2 + 6));
          autoFit = false;
        } else {
          goal.target.set(0, 0, 0);
          autoFit = true;
        }
        goal.theta = 0.7;
        goal.phi = 1.12;
      },
    };
    engineRef.current = engine;
    // camera state readout for tests/diagnostics (WebGL pixels aren't
    // inspectable, so this is how we PROVE pan/zoom/fit actually move)
    mount.__brainCamera = () => ({ radius: goal.radius, theta: goal.theta, phi: goal.phi, target: goal.target.toArray() });

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    tick();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      disposeGraph();
      lineGeometry.dispose();
      lineMaterial.dispose();
      hazeMaterial.dispose();
      starGeo.dispose(); starMat.dispose();
      glowTexture.dispose();
      for (const texture of Object.values(shapeTextures)) texture.dispose();
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
      <div
        ref={mountRef}
        className="brain-3d-canvas"
        role="img"
        aria-label={`3D concept map with ${graph.nodes.length} node${graph.nodes.length === 1 ? "" : "s"}. The Outline view presents the same map as a navigable list.`}
      />
      <div className="brain-3d-labels" aria-hidden="true">
        {labels.map((label) => (
          <span
            key={label.id}
            className={`brain-node-label ${label.type} ${label.strong ? "strong" : ""} ${label.dim ? "dim" : ""}`}
            style={{ transform: `translate3d(${label.x}px, ${label.y}px, 0) translate(-50%, 14px)` }}
          >
            <i className={`brain-node-dot brain-dot ${label.type}`} />
            {shortLabel(label.label, label.type === "brain" || label.type === "domain" || label.type === "project" ? 30 : 24)}
          </span>
        ))}
      </div>
      <div className="brain-3d-help">
        <span>Drag to orbit</span>
        <span>Pinch or scroll to zoom</span>
        <span>Tap a node to inspect</span>
      </div>
    </div>
  );
}
