import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { selectPublicData } from "../src/api/public-fields.js";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-tests", base: "/BahaTurk/", plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
after(() => server.close());
const api = await server.ssrLoadModule("/src/api/client.js");
const projects = await server.ssrLoadModule("/src/pages/projects/data/projectApi.js");
const { default: Navbar } = await server.ssrLoadModule("/src/components/layout/Navbar.jsx");
const rawOriginal = JSON.parse(await readFile(new URL("../db.json", import.meta.url), "utf8"));
const original = selectPublicData(rawOriginal);

test("all published sections match the source data without network requests", async () => {
  assert.deepEqual(await api.getData(), original);
  for (const section of Object.keys(original)) {
    assert.deepEqual(await api.getData("/" + section + "/"), original[section]);
  }
  await assert.rejects(api.getData("missing-section"), /Unknown data section/);
});

test("consumer changes cannot mutate shared data or the database", async () => {
  const copy = await api.getData();
  copy.projects[0].title = "Changed by consumer";
  copy.residence_types.length = 0;
  assert.deepEqual(await api.getData(), original);
  assert.throws(() => { api.siteData.projects[0].title = "Changed"; }, TypeError);
  assert.deepEqual(JSON.parse(await readFile(new URL("../db.json", import.meta.url), "utf8")), rawOriginal);
});

test("project resources share the featured project and deployment base", async () => {
  const featured = original.projects.find((project) => project.is_featured);
  const project = await projects.getFeaturedProject();
  assert.equal(project.id, featured.id);
  assert.equal(project.cover_image, "/BahaTurk/" + featured.cover_image.replace(/^\/+/, ""));
  assert.deepEqual(await projects.getResidenceTypes(project.id), original.residence_types.filter((item) => item.project_id === project.id));
  assert.equal((await projects.getGallery(project.id)).length, original.project_gallery.filter((item) => item.project_id === project.id).length);
});

for (const route of ["/", "/about", "/projects", "/contact"]) {
  test("navigation selects only the current route: " + route, () => {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(Navbar)));
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.ok(html.includes('aria-current="page"'));
    assert.match(html, new RegExp('aria-current="page"[^>]*href="' + route + '"'));
    assert.equal((html.match(/text-black border-accent/g) ?? []).length, 1);
  });
}
