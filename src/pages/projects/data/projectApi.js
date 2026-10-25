
import { siteData as db, featuredProject } from "../../../api/client";
import { assetUrl } from "./assetUrl";

const clone = (value) => structuredClone(value);

export async function getFeaturedProject() {
  const project = featuredProject;
  if (!project) return null;
  return { ...clone(project), cover_image: assetUrl(project.cover_image) };
}

export async function getCompany() {
  return db.company ? clone(db.company) : null;
}

export async function getResidenceTypes(projectId) {
  return clone((db.residence_types ?? []).filter((item) => item.project_id === projectId));
}

export async function getGallery(projectId) {
  return clone((db.project_gallery ?? []).filter((item) => item.project_id === projectId)).map(
    (image) => ({ ...image, image_url: assetUrl(image.image_url) })
  );
}
