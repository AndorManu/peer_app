import { test } from "node:test";
import assert from "node:assert/strict";

import {
  brainPalette,
  buildBrainOutline,
  buildLearningBrainGraph,
  nodeTrajectory,
  shapeForType,
} from "./brainGraph.js";

const ALL_FILTERS = { projects: true, concepts: true, weak: true, files: true, code: true, notes: true, chats: true, quizzes: true };

function makeState() {
  return {
    profile: { subject: "", goal: "", level: "beginner", updatedAt: 1 },
    projects: [
      {
        id: "p1",
        name: "Organic Chemistry",
        domainId: "science",
        docs: [],
        mastery: {
          concepts: [
            { id: "c1", key: "sn2 reaction", label: "SN2 reaction", confidence: 0.7, status: "strong", history: [{ confidence: 0.3 }, { confidence: 0.7 }], updatedAt: 5 },
            { id: "c2", key: "chirality", label: "Chirality", confidence: 0.3, status: "weak", history: [{ confidence: 0.5 }, { confidence: 0.3 }], updatedAt: 6 },
          ],
          misconceptions: [],
          reflections: [],
          updatedAt: 6,
        },
      },
      { id: "p2", name: "Spanish B2", domainId: "language", docs: [], mastery: { concepts: [], misconceptions: [], reflections: [], updatedAt: 2 } },
      { id: "p3", name: "Random stuff", domainId: "general", docs: [], mastery: { concepts: [], misconceptions: [], reflections: [], updatedAt: 3 } },
    ],
    chats: [{ id: "ch1", name: "SN2 walkthrough", projectId: "p1", createdAt: 4, messages: [] }],
    notes: [],
    flashcards: [],
    studyRooms: [],
  };
}

test("global graph inserts domain clusters when two or more real domains exist", () => {
  const graph = buildLearningBrainGraph(makeState(), null, ALL_FILTERS);
  const domains = graph.nodes.filter((node) => node.type === "domain");
  assert.deepEqual(domains.map((node) => node.domainId).sort(), ["language", "science"]);
  assert.equal(graph.summary.domains, 2);

  // projects link through their domain node; general projects go to the root
  const linkFor = (targetId) => graph.links.find((link) => link.target === targetId);
  assert.equal(linkFor("project:p1").source, "domain:science");
  assert.equal(linkFor("project:p2").source, "domain:language");
  assert.equal(linkFor("project:p3").source, "brain:global");
  assert.equal(linkFor("domain:science").source, "brain:global");
});

test("no domain layer with fewer than two real domains", () => {
  const state = makeState();
  state.projects = state.projects.filter((project) => project.id !== "p2");
  const graph = buildLearningBrainGraph(state, null, ALL_FILTERS);
  assert.equal(graph.nodes.filter((node) => node.type === "domain").length, 0);
  assert.equal(graph.links.find((link) => link.target === "project:p1").source, "brain:global");
});

test("single-project scope has no domain layer and roots at the project", () => {
  const state = makeState();
  const graph = buildLearningBrainGraph(state, state.projects[0], ALL_FILTERS);
  assert.equal(graph.nodes[0].type, "project");
  assert.equal(graph.nodes.filter((node) => node.type === "domain").length, 0);
});

test("domain nodes tint to their taxonomy accent", () => {
  const graph = buildLearningBrainGraph(makeState(), null, ALL_FILTERS);
  const science = graph.nodes.find((node) => node.id === "domain:science");
  assert.equal(science.accent, "#6fa8c9"); // Study Hall sky
  const palette = brainPalette(science);
  assert.equal(palette.glow, 0x6fa8c9);
});

test("shape cues never rely on color alone", () => {
  assert.equal(shapeForType("brain"), "ring");
  assert.equal(shapeForType("domain"), "ring");
  assert.equal(shapeForType("project"), "ring");
  assert.equal(shapeForType("concept"), "circle");
  assert.equal(shapeForType("weak"), "diamond");
  for (const type of ["file", "code", "note", "chat", "quiz"]) {
    assert.equal(shapeForType(type), "square");
  }
});

test("concept nodes carry mastery history and a trajectory", () => {
  const graph = buildLearningBrainGraph(makeState(), null, ALL_FILTERS);
  const improving = graph.nodes.find((node) => node.sourceId === "c1");
  const slipping = graph.nodes.find((node) => node.sourceId === "c2");
  assert.equal(nodeTrajectory(improving), "improving");
  assert.equal(nodeTrajectory(slipping), "slipping");
});

test("buildBrainOutline mirrors the graph as domains → subjects → children", () => {
  const graph = buildLearningBrainGraph(makeState(), null, ALL_FILTERS);
  const outline = buildBrainOutline(graph);
  assert.equal(outline.root.type, "brain");

  const science = outline.groups.find((group) => group.domain?.domainId === "science");
  assert.ok(science, "science domain group exists");
  const chem = science.projects.find(({ node }) => node.label === "Organic Chemistry");
  assert.ok(chem, "chemistry project under science");
  assert.equal(chem.concepts.length, 2, "concepts nested under their subject");
  assert.ok(chem.sources.some((node) => node.type === "chat"), "chat listed as a source");

  const ungrouped = outline.groups.find((group) => group.domain === null);
  assert.ok(ungrouped?.projects.some(({ node }) => node.label === "Random stuff"), "general project listed without a domain");
});

test("search query keeps matching branches and their domain", () => {
  const graph = buildLearningBrainGraph(makeState(), null, ALL_FILTERS, { query: "chirality" });
  const ids = graph.nodes.map((node) => node.id);
  assert.ok(ids.some((id) => id.startsWith("concept:p1:c2")), "matching concept kept");
  assert.ok(ids.includes("domain:science"), "domain of a matching subject kept");
});
