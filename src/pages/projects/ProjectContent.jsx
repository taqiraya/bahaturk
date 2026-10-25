import { useCompany, useProjectResources } from "./data/hooks";
import ProjectHero from "./sections/ProjectHero";
import ProjectCard from "./sections/ProjectCard";
import ProjectOverview from "./sections/ProjectOverview";
import FloorConfiguration from "./sections/FloorConfiguration";
import ProjectGallery from "./sections/ProjectGallery";
import LegalAssurance from "./sections/LegalAssurance";
import ProjectCTA from "./sections/ProjectCTA";
import DataState from "../../components/ui/project-ui/DataState";

export default function ProjectContent({ project }) {
  const company = useCompany();
  const { residenceTypes, gallery, residencesError, galleryError } = useProjectResources(project.id);

  return (
    <div>
      <ProjectHero />
      <ProjectCard project={project} />
      <ProjectOverview project={project} company={company} />
      <DataState error={residencesError}><FloorConfiguration residenceTypes={residenceTypes} /></DataState>
      <DataState error={galleryError}><ProjectGallery images={gallery} /></DataState>
      <LegalAssurance legal={project.legal_assurance} />
      <ProjectCTA project={project} />
    </div>
  );
}
