export const PUBLIC_SECTIONS = ["company", "keyNumbers", "journey", "projects", "residence_types", "project_amenities", "project_gallery", "news"];

export function selectPublicData(source) {
  return Object.fromEntries(PUBLIC_SECTIONS.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]));
}
