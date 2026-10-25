import manifest from "../../api/responsive-images.json";
import featuredImage from "../../assets/images/featured_project.webp";
import { useRef } from "react";

export function imageOptions(src) {
  if (typeof src !== "string") return null;
  const base = import.meta.env.BASE_URL;
  const key = src === featuredImage ? "@featured" : src.startsWith(base) ? src.slice(base.length) : src.replace(/^\//, "");
  const entry = manifest[key];
  if (!entry) return null;
  return {
    width: entry.width,
    height: entry.height,
    sizes: entry.sizes,
    srcSet: [...entry.variants.map((variant) => `${base}${variant.src} ${variant.width}w`), `${src} ${entry.width}w`].join(", "),
  };
}

export default function ResponsiveImage({ src, srcSet, sizes, width, height, onError, ...props }) {
  const attempted = useRef(null);
  const options = srcSet ? null : imageOptions(src);
  function recover(event) {
    const image = event.currentTarget;
    if (typeof src === "string" && image.getAttribute("srcset") && attempted.current !== src) {
      attempted.current = src;
      image.removeAttribute("srcset"); image.removeAttribute("sizes"); image.src = src;
      return;
    }
    onError?.(event);
  }
  return <img {...props} src={src} srcSet={srcSet ?? options?.srcSet} sizes={sizes ?? options?.sizes} width={width ?? options?.width} height={height ?? options?.height} onError={recover} />;
}
