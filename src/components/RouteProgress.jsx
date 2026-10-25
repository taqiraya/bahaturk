import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigation } from "react-router-dom";
import LogoLoader from "./LogoLoader";

function visibleAssets() {
  const visible = (element) => { const box = element.getBoundingClientRect(); return !element.closest("[data-route-loader]") && box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0; };
  const images = [...document.images].filter(visible).map((image) => image.complete ? Promise.resolve() : new Promise((done) => { const finish = () => requestAnimationFrame(() => { if (image.complete) { image.removeEventListener("load", finish); image.removeEventListener("error", finish); done(); } }); image.addEventListener("load", finish); image.addEventListener("error", finish); }));
  const backgrounds = new Set();
  for (const element of document.querySelectorAll("main *, header *")) {
    if (!visible(element)) continue;
    for (const match of getComputedStyle(element).backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)) backgrounds.add(match[1]);
  }
  for (const url of backgrounds) images.push(new Promise((done) => { const image = new Image(); image.onload = done; image.onerror = done; image.src = url; if (image.complete) done(); }));
  return Promise.allSettled([document.fonts.ready, ...images]);
}

const bootStarted = performance.now();

export default function RouteProgress() {
  const { pathname, key } = useLocation();
  const navigation = useNavigation();
  const [settling, setSettling] = useState(true);
  const started = useRef(bootStarted);
  useEffect(() => {
    let cancelled = false;
    let timer;
    if (navigation.state !== "idle") { started.current = performance.now(); setSettling(true); return; }
    setSettling(true);
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      visibleAssets().finally(() => {
        if (!cancelled) timer = setTimeout(() => { if (!cancelled) setSettling(false); }, Math.max(0, 300 - (performance.now() - started.current)));
      });
    }));
    return () => { cancelled = true; cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [pathname, key, navigation.state]);
  return settling || navigation.state !== "idle" ? <LogoLoader overlay /> : null;
}
