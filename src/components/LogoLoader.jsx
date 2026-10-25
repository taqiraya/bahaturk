import logo from "../assets/images/logo.svg";

export default function LogoLoader({ overlay = false }) {
  return <div data-route-loader="" role="status" aria-label="Loading page" className={overlay ? "fixed inset-0 z-[10000] flex items-center justify-center bg-white" : "flex h-[80vh] w-full items-center justify-center py-16"}>
    <img src={logo} alt="Baha Turk" width="325" height="65" className="h-auto w-[min(280px,70vw)]" />
  </div>;
}
