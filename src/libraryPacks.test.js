import test from "node:test";
import assert from "node:assert/strict";
import { LIBRARY_PACKS, packsFor, scriptUrlsFor, pyPackagesFor, enabledPackLabels, NO_PACKS_NOTE } from "./libraryPacks.js";

test("pack ids are unique across all languages", () => {
  const ids = Object.values(LIBRARY_PACKS).flat().map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every pack has a label, description, and example", () => {
  for (const pack of Object.values(LIBRARY_PACKS).flat()) {
    assert.ok(pack.label && pack.desc && pack.example, pack.id);
  }
});

test("python packs carry Pyodide package names; js packs carry pinned CDN scripts + globals", () => {
  for (const pack of LIBRARY_PACKS.python) {
    assert.ok(Array.isArray(pack.packages) && pack.packages.length > 0, pack.id);
  }
  for (const pack of LIBRARY_PACKS.javascript) {
    assert.ok(Array.isArray(pack.scripts) && pack.scripts.length > 0, pack.id);
    assert.ok(Array.isArray(pack.globals) && pack.globals.length > 0, pack.id);
    for (const url of pack.scripts) {
      assert.match(url, /^https:\/\/cdn\.jsdelivr\.net\/npm\/[^@]+@[\d.]+\//, `${pack.id}: scripts must be pinned jsdelivr URLs (CSP + reproducibility)`);
    }
  }
});

test("scriptUrlsFor returns only enabled packs' scripts, deduped and ordered", () => {
  assert.deepEqual(scriptUrlsFor("javascript", {}), []);
  const urls = scriptUrlsFor("javascript", { "js-utils": true });
  assert.equal(urls.length, 2);
  assert.match(urls[0], /lodash/);
  const both = scriptUrlsFor("javascript", { "js-utils": true, "js-data": true });
  assert.equal(new Set(both).size, both.length);
});

test("pyPackagesFor flattens enabled python packs", () => {
  assert.deepEqual(pyPackagesFor("python", {}), []);
  assert.deepEqual(pyPackagesFor("python", { "py-math": true }), ["sympy"]);
  const ds = pyPackagesFor("python", { "py-data": true, "py-ml": true });
  assert.ok(ds.includes("numpy") && ds.includes("scikit-learn"));
});

test("languages without packs get an honest note, not fake toggles", () => {
  for (const langId of ["typescript", "cpp", "java", "go", "rust", "csharp", "ruby", "php", "sql", "bash", "c"]) {
    assert.deepEqual(packsFor(langId), [], langId);
  }
  assert.ok(NO_PACKS_NOTE.typescript.includes("server runner"));
  assert.ok(NO_PACKS_NOTE.default("Go").includes("standard library"));
});

test("enabledPackLabels names the active packs for the terminal meta line", () => {
  assert.deepEqual(enabledPackLabels("python", { "py-data": true }), ["Data science"]);
  assert.deepEqual(enabledPackLabels("javascript", {}), []);
});
