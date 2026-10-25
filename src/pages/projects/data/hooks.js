import { siteData, featuredProject } from "../../../api/client";
import { assetUrl } from "./assetUrl";

export function useFeaturedProject() {
  const project = featuredProject ? { ...featuredProject, cover_image: assetUrl(featuredProject.cover_image) } : null;
  return { project, loading: false, error: null };
}
export function useCompany() {
  return siteData.company ?? null;
}


export function useProjectResources(projectId) {
  return {
    residenceTypes: (siteData.residence_types ?? []).filter((item) => item.project_id === projectId),
    gallery: (siteData.project_gallery ?? []).filter((item) => item.project_id === projectId).map((image) => ({ ...image, image_url: assetUrl(image.image_url) })),
    loading: false,
    residencesError: null,
    galleryError: null,
  };
}
