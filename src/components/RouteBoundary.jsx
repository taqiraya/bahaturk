import { retryCurrentRoute } from "../pages/route-loaders";
import { Component, Suspense, createElement } from "react";
import Loader from "./Loader";

class RouteBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="bahaturk-inter mx-auto max-w-3xl px-6 py-16 text-center" role="alert">
      <h1 className="text-2xl font-bold text-text">This page could not load.</h1>
      <p className="my-4 text-text">Please check your connection and try again. Your saved drafts are kept.</p>
      <button className="rounded-lg bg-accent px-6 py-3 text-white" onClick={retryCurrentRoute}>Try again</button>
      <a className="mx-4 text-accent" href={import.meta.env.BASE_URL}>Home</a>
    </section>;
  }
}

export default function SafePage({ component }) {
  return <RouteBoundary><Suspense fallback={<Loader />}>{createElement(component)}</Suspense></RouteBoundary>;
}
