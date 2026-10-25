import { useEffect, useState } from "react";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > Math.max(400, window.innerHeight * .75));
    update(); window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  if (!visible) return null;
  return <button type="button" aria-label="Back to top" title="Back to top" className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent" onClick={() => window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 12 6-6 6 6M12 6v13" /></svg>
  </button>;
}
