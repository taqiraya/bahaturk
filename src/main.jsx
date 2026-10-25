import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import PageMetadata from "./components/PageMetadata";
import RouteProgress from "./components/RouteProgress";
import LogoLoader from "./components/LogoLoader";
import App from "./App";
import ScrollToTop from "./components/ScrollToTop"; // 👈 Imported the scroll correction component
import "./index.css";
import { preloadRoute } from "./pages/route-loaders";

// Resolve a directly opened route before first paint, without a new loading UI.
const base = import.meta.env.BASE_URL;
// Old shared hash links continue to open the same page.
if (window.location.hash.startsWith("#/")) {
  const next = new URL(base + window.location.hash.slice(2), window.location.origin);
  for (const [key, value] of new URLSearchParams(window.location.search)) if (!next.searchParams.has(key)) next.searchParams.append(key, value);
  if (next.origin === window.location.origin && next.pathname.startsWith(base)) window.history.replaceState(null, "", next.pathname + next.search);
}


window.addEventListener("hashchange", () => {
  if (window.location.hash.startsWith("#/")) window.location.replace(base + window.location.hash.slice(2));
});

document.addEventListener("pointerover", (event) => {
  const link = event.target.closest?.("a[href]");
  if (link && link.origin === window.location.origin && link.pathname.startsWith(base)) void preloadRoute(link.pathname.slice(base.length))?.catch(() => {});
}, { passive: true });
document.addEventListener("focusin", (event) => {
  const link = event.target.closest?.("a[href]");
  if (link && link.origin === window.location.origin && link.pathname.startsWith(base)) void preloadRoute(link.pathname.slice(base.length))?.catch(() => {});
});

const router = createBrowserRouter([{ path: "*", loader: async ({ request }) => {
  await Promise.allSettled([preloadRoute(new URL(request.url).pathname.slice(base.length)), new Promise((done) => setTimeout(done, 300))]);
  return null;
}, shouldRevalidate: ({ currentUrl, nextUrl }) => currentUrl.pathname !== nextUrl.pathname, hydrateFallbackElement: <LogoLoader overlay />, element: <><PageMetadata /><ScrollToTop /><RouteProgress /><App /></> }], { basename: base });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
