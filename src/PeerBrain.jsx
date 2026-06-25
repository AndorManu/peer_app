// Peer — Visual Identity Rebuild · Brain screen
// The Three.js brain logic is ported directly from the Peer.dc.html handoff
// (glow-sprite nodes with additive bloom, star field, edge highlighting, spring
// focus, cinematic zoom, floating project labels). The DATA SOURCE is adapted
// to the real app: projects + their tracked concepts/mastery/weak-spots from
// `state.projects[].mastery`. Panel actions wire to the real routing.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ArrowLeft } from "lucide-react";
import { COLORS, GRADIENTS, EASE, NODE_COLORS, PROJECT_PALETTE, hexA } from "./peerTheme.js";

// ---- build the graph from real app state ---------------------------------
function buildGraph(state) {
  const TC = NODE_COLORS;
  const projects = Array.isArray(state?.projects) ? state.projects : [];
  const nodes = [];
  const edges = [];
  const nameIndex = {};
  const R = 240;
  const N = Math.max(1, projects.length);

  projects.forEach((proj, i) => {
    const projColor = PROJECT_PALETTE[i % PROJECT_PALETTE.length];
    const concepts = Array.isArray(proj.mastery?.concepts) ? proj.mastery.concepts : [];
    // project mastery = avg concept confidence (fallback 0.3)
    const avg = concepts.length
      ? concepts.reduce((s, c) => s + (Number(c.confidence) || 0), 0) / concepts.length
      : 0.3;
    // fibonacci sphere placement for the project hub
    const y = N > 1 ? 1 - (i / (N - 1)) * 2 : 0;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = Math.PI * (3 - Math.sqrt(5)) * i;
    const cx = Math.cos(phi) * rr * R;
    const cy = y * R * 0.85;
    const cz = Math.sin(phi) * rr * R;
    const pIndex = nodes.length;
    nodes.push({
      id: "p" + i, name: proj.name || "Project", type: "project", color: TC.project,
      project: proj.name || "Project", projColor, mastery: Math.round(avg * 100),
      x: cx, y: cy, z: cz, sourceId: proj.id,
    });
    nameIndex[proj.name] = pIndex;

    concepts.forEach((c, j) => {
      const a = (j / Math.max(1, concepts.length)) * Math.PI * 2;
      const rad = 72 + ((i * 7 + j * 13) % 30);
      const ox = Math.cos(a) * rad;
      const oy = (((i * 5 + j * 9) % 14) / 14 - 0.5) * 78;
      const oz = Math.sin(a) * rad;
      const conf = Number(c.confidence) || 0;
      const weak = c.status === "weak" || conf < 0.4;
      const idx = nodes.length;
      nodes.push({
        id: "c" + i + "_" + j, name: c.label || "Concept", type: weak ? "weak" : "concept",
        color: weak ? TC.weak : TC.concept, project: proj.name || "Project", projColor,
        mastery: Math.round(conf * 100), x: cx + ox, y: cy + oy, z: cz + oz, sourceId: proj.id,
      });
      nameIndex[c.label] = idx;
      edges.push({ a: pIndex, b: idx, strength: 0.85 });
      if (j > 0) edges.push({ a: idx - 1, b: idx, strength: 0.42 });
    });
  });

  // light cross-project links so the map feels connected (hub to next hub)
  const hubs = nodes.map((n, i) => ({ n, i })).filter((o) => o.n.type === "project");
  for (let k = 0; k < hubs.length - 1; k++) {
    edges.push({ a: hubs[k].i, b: hubs[k + 1].i, strength: 0.22 });
  }

  const adj = nodes.map(() => new Set());
  edges.forEach((e) => { adj[e.a].add(e.b); adj[e.b].add(e.a); });

  const concepts = nodes.filter((n) => n.type === "concept").length;
  const weak = nodes.filter((n) => n.type === "weak").length;
  const masteryAvg = nodes.length
    ? Math.round(nodes.reduce((s, n) => s + n.mastery, 0) / nodes.length)
    : 0;
  const stats = { projects: projects.length, concepts, weak, connections: edges.length, mastery: masteryAvg, updated: "Updated just now" };
  return { nodes, edges, adj, stats };
}

const FILTER_DEFS = [
  { key: "all", label: "All", color: "#a5b4fc" },
  { key: "project", label: "Projects", color: "#8b5cf6" },
  { key: "concept", label: "Concepts", color: "#22d3ee" },
  { key: "weak", label: "Weak spots", color: "#f59e0b" },
];

export default function PeerBrain({ state, setView }) {
  const graph = useMemo(() => buildGraph(state), [state]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState([]);

  const mountRef = useRef(null);
  const labelsRef = useRef(null);
  const tooltipRef = useRef(null);
  const eng = useRef(null);          // mutable Three engine state
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // ----- Three.js engine (ported from the handoff) -----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !graph.nodes.length) return undefined;

    const glowTexture = () => {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const x = c.getContext("2d");
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,0.55)");
      g.addColorStop(0.55, "rgba(255,255,255,0.16)"); g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };

    const w = mount.clientWidth || 800, h = mount.clientHeight || 600;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, w / h, 1, 6000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);
    const group = new THREE.Group(); scene.add(group);
    const tex = glowTexture();

    const gN = graph.nodes, gE = graph.edges, gA = graph.adj;
    const lighten = (hex, amt) => { const c = new THREE.Color(hex); c.r += (1 - c.r) * amt; c.g += (1 - c.g) * amt; c.b += (1 - c.b) * amt; return c; };

    const nodeObjs = [], glowArr = [];
    gN.forEach((n, i) => {
      const baseGlow = n.type === "project" ? 64 : n.type === "weak" ? 44 : 34;
      const baseCore = n.type === "project" ? 20 : n.type === "weak" ? 14 : 11;
      const glowMat = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(n.color), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 });
      const glow = new THREE.Sprite(glowMat); glow.position.set(n.x, n.y, n.z); glow.scale.set(baseGlow, baseGlow, 1); glow.userData.index = i; group.add(glow);
      const coreMat = new THREE.SpriteMaterial({ map: tex, color: lighten(n.color, 0.55), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.95 });
      const core = new THREE.Sprite(coreMat); core.position.set(n.x, n.y, n.z); core.scale.set(baseCore, baseCore, 1); group.add(core);
      nodeObjs.push({ glow, core, glowMat, coreMat, baseGlow, baseCore, home: new THREE.Vector3(n.x, n.y, n.z), cur: new THREE.Vector3(n.x, n.y, n.z), phase: i * 0.7, glowBaseOp: n.type === "weak" ? 0.78 : 0.58, targetOp: 1, curOp: 1, targetMul: 1, curMul: 1, hidden: false, type: n.type });
      glowArr.push(glow);
    });

    const ec = gE.length;
    const posArr = new Float32Array(ec * 2 * 3); const colArr = new Float32Array(ec * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const lines = new THREE.LineSegments(geo, lineMat); group.add(lines);

    const hiGeo = new THREE.BufferGeometry();
    hiGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ec * 2 * 3), 3));
    hiGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(ec * 2 * 3), 3));
    const hiMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const hiLines = new THREE.LineSegments(hiGeo, hiMat); hiLines.frustumCulled = false; group.add(hiLines);

    // star field
    const sc = 1400; const sp = new Float32Array(sc * 3);
    for (let i = 0; i < sc; i++) { const r = 900 + Math.random() * 1400; const th = Math.random() * Math.PI * 2; const ph = Math.acos(2 * Math.random() - 1); sp[i * 3] = r * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); sp[i * 3 + 2] = r * Math.cos(ph); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const sm = new THREE.PointsMaterial({ color: 0xffffff, size: 2.0, transparent: true, opacity: 0.5, sizeAttenuation: true, depthWrite: false });
    const stars = new THREE.Points(sg, sm); scene.add(stars);

    // floating project labels (DOM)
    const labelEls = [];
    if (labelsRef.current) {
      labelsRef.current.innerHTML = "";
      gN.forEach((n, i) => {
        if (n.type !== "project") return;
        const d = document.createElement("div");
        d.textContent = n.name;
        d.style.cssText = "position:absolute;left:0;top:0;transform:translate(-50%,-150%);font-family:Space Grotesk,sans-serif;font-size:12px;font-weight:600;letter-spacing:.2px;color:rgba(255,255,255,0.82);text-shadow:0 0 12px rgba(0,0,0,0.9);white-space:nowrap;will-change:transform";
        labelsRef.current.appendChild(d); labelEls.push({ el: d, index: i });
      });
    }

    const B = { group, nodes: nodeObjs, glowArr, lines, lineMat, geo, posArr, colArr, hiLines, hiMat, hiGeo, stars, labelEls, edgeOpT: 0.5, hiList: [], paused: false };
    const cam = { r: 600, rT: 600, theta: 0.7, phi: 1.15, target: new THREE.Vector3(0, 0, 0), targetT: new THREE.Vector3(0, 0, 0) };
    const ST = { hoverIndex: -1, selIndex: -1, dragging: false, moved: false, dx: 0, dy: 0, raf: 0 };
    const raycaster = new THREE.Raycaster();
    const clock = new THREE.Clock();
    eng.current = { renderer, scene, camera, B, cam, ST };

    const relatedSet = (i) => { const s = new Set([i]); gA[i].forEach((j) => s.add(j)); return s; };
    const setEdgeColors = () => {
      const f = filtersRef.current; const col = B.colArr;
      gE.forEach((e, k) => {
        const na = gN[e.a], nb = gN[e.b];
        const ha = f.length ? !f.includes(na.type) : false, hb = f.length ? !f.includes(nb.type) : false;
        const ca = new THREE.Color(na.color), cb = new THREE.Color(nb.color); const s = e.strength;
        const fa = ha ? 0 : s, fb = hb ? 0 : s;
        col[k * 6] = ca.r * fa; col[k * 6 + 1] = ca.g * fa; col[k * 6 + 2] = ca.b * fa;
        col[k * 6 + 3] = cb.r * fb; col[k * 6 + 4] = cb.g * fb; col[k * 6 + 5] = cb.b * fb;
      });
      B.geo.attributes.color.needsUpdate = true;
    };
    const buildHiEdges = (hh) => {
      const list = [];
      if (hh >= 0) gE.forEach((e, k) => { if (e.a === hh || e.b === hh) list.push(k); });
      B.hiList = list;
      const pos = B.hiGeo.attributes.position.array, col = B.hiGeo.attributes.color.array;
      for (let i = 0; i < pos.length; i++) pos[i] = 0;
      list.forEach((k, m) => { const e = gE[k]; const na = gN[e.a], nb = gN[e.b]; const ca = new THREE.Color(na.color), cb = new THREE.Color(nb.color);
        col[m * 6] = Math.min(1, ca.r * 1.4); col[m * 6 + 1] = Math.min(1, ca.g * 1.4); col[m * 6 + 2] = Math.min(1, ca.b * 1.4);
        col[m * 6 + 3] = Math.min(1, cb.r * 1.4); col[m * 6 + 4] = Math.min(1, cb.g * 1.4); col[m * 6 + 5] = Math.min(1, cb.b * 1.4);
      });
      B.hiGeo.setDrawRange(0, list.length * 2); B.hiGeo.attributes.color.needsUpdate = true;
    };
    const updateFocus = () => {
      const f = filtersRef.current;
      const hh = ST.hoverIndex >= 0 ? ST.hoverIndex : ST.selIndex;
      const rel = hh >= 0 ? relatedSet(hh) : null;
      B.nodes.forEach((n, i) => {
        const hidden = f.length ? !f.includes(n.type) : false; n.hidden = hidden;
        if (hidden) { n.targetOp = 0; n.targetMul = 0.8; return; }
        if (hh >= 0) { n.targetOp = rel.has(i) ? 1 : 0.14; n.targetMul = i === hh ? 1.7 : (rel.has(i) ? 1.05 : 0.85); }
        else { n.targetOp = 1; n.targetMul = 1; }
      });
      B.edgeOpT = hh >= 0 ? 0.1 : 0.5;
      buildHiEdges(hh);
    };
    const selectNode = (i) => {
      const n = gN[i]; ST.selIndex = i;
      cam.targetT.set(n.x, n.y, n.z); cam.rT = 300; updateFocus();
      setSelected({ index: i, id: n.id, name: n.name, type: n.type, project: n.project, color: n.color, mastery: n.mastery, connections: gA[i].size, sourceId: n.sourceId });
    };
    const deselect = () => { ST.selIndex = -1; cam.targetT.set(0, 0, 0); cam.rT = 600; updateFocus(); setSelected(null); };
    eng.current.selectNode = selectNode;
    eng.current.deselect = deselect;
    eng.current.applyFilters = () => { setEdgeColors(); updateFocus(); };

    // interaction
    const el = renderer.domElement; el.style.touchAction = "none"; el.style.cursor = "grab";
    const ndc = (e) => { const r = el.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }; };
    const onDown = (e) => { ST.dragging = true; ST.moved = false; ST.dx = e.clientX; ST.dy = e.clientY; el.setPointerCapture && el.setPointerCapture(e.pointerId); };
    const onMove = (e) => {
      if (ST.dragging) { const dx = e.clientX - ST.dx, dy = e.clientY - ST.dy; if (Math.abs(dx) + Math.abs(dy) > 4) ST.moved = true; cam.theta -= dx * 0.005; cam.phi -= dy * 0.005; cam.phi = Math.max(0.25, Math.min(Math.PI - 0.25, cam.phi)); ST.dx = e.clientX; ST.dy = e.clientY; }
      else { const p = ndc(e); raycaster.setFromCamera(p, camera); const hits = raycaster.intersectObjects(B.glowArr, false); const idx = hits.length ? hits[0].object.userData.index : -1; if (idx !== ST.hoverIndex) { ST.hoverIndex = idx; el.style.cursor = idx >= 0 ? "pointer" : "grab"; updateFocus(); } }
    };
    const onUp = (e) => { if (ST.dragging && !ST.moved) { const p = ndc(e); raycaster.setFromCamera(p, camera); const hits = raycaster.intersectObjects(B.glowArr, false); if (hits.length) selectNode(hits[0].object.userData.index); else deselect(); } ST.dragging = false; };
    const onWheel = (e) => { e.preventDefault(); cam.rT = Math.max(190, Math.min(1100, cam.rT + e.deltaY * 0.4)); };
    el.addEventListener("pointerdown", onDown); el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp); el.addEventListener("pointerleave", () => { ST.dragging = false; });
    el.addEventListener("wheel", onWheel, { passive: false });

    setEdgeColors();

    const animate = () => {
      if (B.paused) return;
      ST.raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (!ST.dragging && ST.selIndex < 0) cam.theta += 0.0011;
      cam.target.lerp(cam.targetT, 0.07); cam.r += (cam.rT - cam.r) * 0.07;
      const px = cam.target.x + cam.r * Math.sin(cam.phi) * Math.cos(cam.theta);
      const py = cam.target.y + cam.r * Math.cos(cam.phi);
      const pz = cam.target.z + cam.r * Math.sin(cam.phi) * Math.sin(cam.theta);
      camera.position.set(px, py, pz); camera.lookAt(cam.target);
      const nodes = B.nodes;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]; const br = Math.sin(t * 0.8 + n.phase);
        const dx = Math.sin(t * 0.3 + n.phase) * 4, dy = Math.cos(t * 0.26 + n.phase * 1.3) * 4, dz = Math.sin(t * 0.21 + n.phase * 0.7) * 4;
        n.cur.set(n.home.x + dx, n.home.y + dy, n.home.z + dz);
        let mul = 1 + 0.05 * br; if (n.type === "weak") mul = 1 + 0.2 * Math.sin(t * 1.9 + n.phase);
        n.curOp += (n.targetOp - n.curOp) * 0.12; n.curMul += (n.targetMul * mul - n.curMul) * 0.15;
        n.glow.position.copy(n.cur); n.core.position.copy(n.cur);
        const gs = n.baseGlow * n.curMul, cs = n.baseCore * n.curMul;
        n.glow.scale.set(gs, gs, 1); n.core.scale.set(cs, cs, 1);
        n.glowMat.opacity = n.glowBaseOp * n.curOp; n.coreMat.opacity = 0.95 * n.curOp;
        const vis = n.curOp > 0.02; n.glow.visible = vis; n.core.visible = vis;
      }
      const pa = B.posArr;
      for (let k = 0; k < gE.length; k++) { const e = gE[k]; const a = nodes[e.a].cur, b = nodes[e.b].cur; const o = k * 6; pa[o] = a.x; pa[o + 1] = a.y; pa[o + 2] = a.z; pa[o + 3] = b.x; pa[o + 4] = b.y; pa[o + 5] = b.z; }
      B.geo.attributes.position.needsUpdate = true;
      B.lineMat.opacity += (B.edgeOpT - B.lineMat.opacity) * 0.12;
      if (B.hiList.length) { const hp = B.hiGeo.attributes.position.array; B.hiList.forEach((k, m) => { const e = gE[k]; const a = nodes[e.a].cur, b = nodes[e.b].cur; const o = m * 6; hp[o] = a.x; hp[o + 1] = a.y; hp[o + 2] = a.z; hp[o + 3] = b.x; hp[o + 4] = b.y; hp[o + 5] = b.z; }); B.hiGeo.attributes.position.needsUpdate = true; }
      B.hiMat.opacity += ((B.hiList.length ? 0.92 : 0) - B.hiMat.opacity) * 0.15;
      if (B.stars) B.stars.rotation.y = t * 0.005;
      if (B.labelEls.length) { const ww = renderer.domElement.clientWidth, hh = renderer.domElement.clientHeight; const v = new THREE.Vector3();
        B.labelEls.forEach((L) => { const n = nodes[L.index]; v.copy(n.cur).project(camera);
          if (v.z > 1 || v.z < -1) { L.el.style.opacity = "0"; return; }
          const x = (v.x * 0.5 + 0.5) * ww, y = (-v.y * 0.5 + 0.5) * hh;
          L.el.style.transform = "translate(-50%,-150%) translate(" + x + "px," + y + "px)";
          const dim = n.curOp < 0.5 ? 0 : 0.55 + 0.4 * n.curOp; L.el.style.opacity = String(dim);
        });
      }
      if (tooltipRef.current) { const idx = ST.hoverIndex >= 0 ? ST.hoverIndex : ST.selIndex; const n = idx >= 0 ? nodes[idx] : null;
        if (n && n.curOp > 0.1) { const v = new THREE.Vector3().copy(n.cur).project(camera); const ww = renderer.domElement.clientWidth, hh = renderer.domElement.clientHeight; const x = (v.x * 0.5 + 0.5) * ww, y = (-v.y * 0.5 + 0.5) * hh; const data = gN[idx];
          tooltipRef.current.style.transform = "translate(-50%,-160%) translate(" + x + "px," + y + "px)";
          tooltipRef.current.innerHTML = '<span style="color:' + data.color + '">●</span> &nbsp;' + data.name + ' &nbsp;<span style="font-family:Geist Mono,monospace;color:rgba(255,255,255,0.5)">' + data.mastery + '%</span>';
          tooltipRef.current.style.opacity = "1";
        } else tooltipRef.current.style.opacity = "0";
      }
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => { const ww = mount.clientWidth, hh = mount.clientHeight; if (ww && hh) { camera.aspect = ww / hh; camera.updateProjectionMatrix(); renderer.setSize(ww, hh); } };
    window.addEventListener("resize", onResize);

    return () => {
      B.paused = true; cancelAnimationFrame(ST.raf);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp); el.removeEventListener("wheel", onWheel);
      renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if (labelsRef.current) labelsRef.current.innerHTML = "";
      eng.current = null;
    };
  }, [graph]);

  // re-apply filters to the live engine
  useEffect(() => { eng.current?.applyFilters?.(); }, [filters]);

  function toggleFilter(key) {
    setFilters((cur) => { if (key === "all") return []; return cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]; });
  }
  function focusById(id) { const i = graph.nodes.findIndex((n) => n.id === id); if (i >= 0) eng.current?.selectNode?.(i); }

  const weakList = graph.nodes.filter((n) => n.type === "weak");
  const sel = selected;
  const selRelated = sel ? [...graph.adj[sel.index]].slice(0, 6).map((j) => ({ name: graph.nodes[j].name, color: graph.nodes[j].color, index: j })) : [];

  return (
    <section className="peer-brain peer-skin" style={{ position: "absolute", inset: 0, display: "flex", background: "#07070e" }}>
      <div style={{ position: "relative", flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
        <div ref={labelsRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} />
        <div ref={tooltipRef} style={{ position: "absolute", left: 0, top: 0, opacity: 0, pointerEvents: "none", transform: "translate(-50%,-160%)", padding: "7px 12px", borderRadius: 10, background: "rgba(12,12,22,0.82)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(14px)", fontSize: 12, whiteSpace: "nowrap", boxShadow: "0 10px 30px -12px rgba(0,0,0,0.9)", transition: "opacity .2s", zIndex: 5 }} />

        {/* title */}
        <div style={{ position: "absolute", top: 26, left: 30, zIndex: 4, pointerEvents: "none" }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 27, fontWeight: 600, letterSpacing: "-.4px", color: "#fff" }}>Your Brain</div>
          <div style={{ fontSize: 13, color: COLORS.text45, marginTop: 3 }}>A living map of everything you're learning · drag to orbit, click a node</div>
        </div>

        {/* filters */}
        <div style={{ position: "absolute", top: 96, left: 30, zIndex: 4, display: "flex", gap: 8, flexWrap: "wrap", maxWidth: "60%" }}>
          {FILTER_DEFS.map((f) => {
            const active = f.key === "all" ? filters.length === 0 : filters.includes(f.key);
            return (
              <div key={f.key} onClick={() => toggleFilter(f.key)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 500, transition: `all .25s ${EASE}`, backdropFilter: "blur(20px)", background: active ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)", border: "1px solid " + (active ? hexA(f.color, 0.5) : "rgba(255,255,255,0.08)"), color: active ? "#fff" : COLORS.text60, boxShadow: active ? "0 0 22px -8px " + f.color : "none" }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: f.color, boxShadow: active ? "0 0 10px 1px " + f.color : "none" }} />
                <span>{f.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* right panel */}
      <div style={{ position: "relative", zIndex: 3, width: 330, flex: "0 0 330px", borderLeft: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.022)", backdropFilter: "blur(34px)", WebkitBackdropFilter: "blur(34px)", overflowY: "auto" }}>
        {sel ? (
          <div style={{ padding: "26px 24px", animation: "pslide .35s cubic-bezier(.16,1,.3,1)" }}>
            <div onClick={() => eng.current?.deselect?.()} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: COLORS.text55, cursor: "pointer", marginBottom: 22 }}>
              <ArrowLeft size={15} /> <span>Overview</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 99, background: sel.color, boxShadow: "0 0 16px 2px " + sel.color }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: sel.color }}>{sel.type}</span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-.3px", marginBottom: 6, color: "#fff" }}>{sel.name}</div>
            <div style={{ fontSize: 13, color: COLORS.text45, marginBottom: 24 }}>in {sel.project}</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              <div style={{ flex: 1, padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 30, fontWeight: 500, background: GRADIENTS.accent, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{sel.mastery}%</div>
                <div style={{ fontSize: 11, color: COLORS.text40, marginTop: 3 }}>mastery</div>
              </div>
              <div style={{ flex: 1, padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 30, fontWeight: 500, color: COLORS.text }}>{sel.connections}</div>
                <div style={{ fontSize: 11, color: COLORS.text40, marginTop: 3 }}>connections</div>
              </div>
            </div>
            {selRelated.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: COLORS.text40, marginBottom: 11 }}>Connected to</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 26 }}>
                  {selRelated.map((r) => (
                    <div key={r.index} onClick={() => eng.current?.selectNode?.(r.index)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", transition: `all .25s ${EASE}` }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: r.color, boxShadow: "0 0 8px " + r.color }} />
                      <span style={{ fontSize: 13, color: COLORS.text80 }}>{r.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <div onClick={() => setView("notes")} style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 500, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", cursor: "pointer", color: "#fff" }}>Open notes</div>
              <div onClick={() => setView("flashcards")} style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 500, color: "#0a0a14", background: GRADIENTS.accent, cursor: "pointer", boxShadow: "0 0 20px -6px rgba(139,92,246,.7)" }}>Quiz this</div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "26px 24px" }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 600, marginBottom: 4, color: "#fff" }}>Knowledge map</div>
            <div style={{ fontSize: 12.5, color: COLORS.text45, marginBottom: 22 }}>{graph.stats.updated}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                { v: graph.stats.projects, label: "projects", grad: GRADIENTS.accent },
                { v: graph.stats.mastery + "%", label: "avg mastery", grad: GRADIENTS.accentCyanViolet },
                { v: graph.stats.concepts, label: "concepts" },
                { v: graph.stats.connections, label: "connections" },
              ].map((s, i) => (
                <div key={i} style={{ padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 32, fontWeight: 500, ...(s.grad ? { background: s.grad, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" } : { color: COLORS.text }) }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: COLORS.text42, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: "#f59e0b", boxShadow: "0 0 10px 1px #f59e0b", animation: "ppulse 2.4s ease-in-out infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", color: COLORS.text50 }}>Weak spots · needs review</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {weakList.length === 0 && <div style={{ fontSize: 12.5, color: COLORS.text40 }}>No weak spots tracked yet — keep learning and Peer will flag them here.</div>}
              {weakList.map((w) => (
                <div key={w.id} onClick={() => focusById(w.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.16)", cursor: "pointer", transition: `all .25s ${EASE}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text86 }}>{w.name}</div>
                    <div style={{ fontSize: 11, color: COLORS.text40, marginTop: 2 }}>{w.project}</div>
                  </div>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 14, color: "#f59e0b" }}>{w.mastery}%</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
