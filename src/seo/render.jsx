import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Home from "../pages/home/Home";
import About from "../pages/about/About";
import Projects from "../pages/projects/Projects";
import Contact from "../pages/contact/Contact";
import { FooterContent } from "../components/layout/Footer";
import { DEFAULT_FOOTER } from "../../shared/footer-settings.js";

export function renderPublicFooter(base) {
  const router = createMemoryRouter([{ path: "*", element: <FooterContent footer={DEFAULT_FOOTER} /> }], { basename: base, initialEntries: [base] });
  try { return renderToStaticMarkup(<RouterProvider router={router} />); }
  finally { router.dispose(); }
}

// Render the same public components at build time. No database, drafts or admin data.
const pages = { "": Home, about: About, projects: Projects, contact: Contact };
export function renderPublicPage(route, base) {
  const Page = pages[route];
  const router = createMemoryRouter([{ path: "*", element: <><Navbar /><main className="flex-1"><Page /></main></> }], { basename: base, initialEntries: [base + route] });
  try {
    return renderToStaticMarkup(<RouterProvider router={router} />).replace(/<link\b[^>]*rel="preload"[^>]*>/g, "");
  } finally { router.dispose(); }
}
