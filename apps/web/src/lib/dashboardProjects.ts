import { normalizePlacementWorkplane, type PlacementWorkplane } from "@/lib/placementWorkplane";
import { normalizeSnapGrid, normalizeWorkspaceSettings } from "@/lib/workplaneSettings";
import type { GridSize, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/** A project as the dashboard lists it - the shapes themselves live elsewhere. */
export type DashboardProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  shapes: number;
  accent: "cyan" | "green" | "gold" | "red";
  thumbnailUrl?: string | null;
  thumbnailVersion?: number;
  revision?: number;
  workspace?: WorkplaneWorkspaceSettings;
  snapGrid?: GridSize;
  placementElevation?: number;
  placementWorkplane?: PlacementWorkplane;
  sketchPlacementWorkplane?: PlacementWorkplane;
  sharedProject?: { fileName: string; revision: string };
};

export type StoredDashboardProject = Partial<DashboardProject> & {
  designShapes?: unknown;
};

export const PROJECTS_STORAGE_KEY = "sketchForge.projects";

export const PROJECT_ACCENTS: DashboardProject["accent"][] = ["cyan", "green", "gold", "red"];

/**
 * The first number among the candidates. Reading a record must not invent a
 * value that differs from one read to the next: the dashboard reads, merges
 * and writes the list in a single effect, so anything that changes per read
 * never settles - the merged list differs from the one just written, the
 * effect runs again, and React stops the page with "maximum update depth
 * exceeded". A record without timestamps used to get `Date.now()` here.
 */
function firstNumber(...candidates: Array<number | undefined>) {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return 0;
}

export function parseStoredProjects(raw: string | null): {
  projects: DashboardProject[];
  legacyShapes: Record<string, WorkplaneShape[]>;
} {
  const legacyShapes: Record<string, WorkplaneShape[]> = {};
  try {
    const parsed = JSON.parse(raw ?? "[]") as StoredDashboardProject[];
    if (!Array.isArray(parsed)) return { projects: [], legacyShapes };
    const projects = parsed
      .filter((project) => typeof project.id === "string" && typeof project.name === "string")
      .map((project, index) => {
        const id = project.id as string;
        const createdAt = firstNumber(project.createdAt, project.updatedAt);
        const updatedAt = firstNumber(project.updatedAt, project.createdAt);
        const revision = firstNumber(project.revision, updatedAt);
        const designShapes = Array.isArray(project.designShapes) ? (project.designShapes as WorkplaneShape[]) : null;
        if (designShapes) {
          legacyShapes[id] = designShapes;
        }
        return {
          id,
          name: project.name as string,
          createdAt,
          updatedAt,
          shapes: typeof project.shapes === "number" ? project.shapes : (designShapes?.length ?? 0),
          accent: PROJECT_ACCENTS.includes(project.accent as DashboardProject["accent"])
            ? (project.accent as DashboardProject["accent"])
            : PROJECT_ACCENTS[index % PROJECT_ACCENTS.length],
          thumbnailUrl: typeof project.thumbnailUrl === "string" ? project.thumbnailUrl : null,
          thumbnailVersion: typeof project.thumbnailVersion === "number" ? project.thumbnailVersion : undefined,
          revision,
          workspace: normalizeWorkspaceSettings(project.workspace),
          snapGrid: normalizeSnapGrid(project.snapGrid),
          placementElevation: typeof project.placementElevation === "number" && Number.isFinite(project.placementElevation) ? project.placementElevation : 0,
          placementWorkplane: normalizePlacementWorkplane(project.placementWorkplane, project.placementElevation),
          sketchPlacementWorkplane: normalizePlacementWorkplane(project.sketchPlacementWorkplane),
          sharedProject: typeof project.sharedProject?.fileName === "string" && typeof project.sharedProject.revision === "string"
            ? { fileName: project.sharedProject.fileName, revision: project.sharedProject.revision }
            : undefined,
        } satisfies DashboardProject;
      });
    return { projects, legacyShapes };
  } catch {
    return { projects: [], legacyShapes };
  }
}

/**
 * A newer record on disk wins over the one in memory - another tab may have
 * saved while this one was idle.
 */
export function mergeProjectForStorage(project: DashboardProject, storedProject?: DashboardProject): DashboardProject {
  if (!storedProject) {
    return project;
  }
  const projectRevision = project.revision ?? 0;
  const storedRevision = storedProject.revision ?? 0;
  if (storedRevision <= projectRevision) {
    return project;
  }
  return {
    ...project,
    revision: storedProject.revision,
    shapes: storedProject.shapes || project.shapes,
    thumbnailUrl: project.thumbnailUrl ?? storedProject.thumbnailUrl,
    thumbnailVersion: project.thumbnailVersion ?? storedProject.thumbnailVersion,
    updatedAt: Math.max(project.updatedAt, storedProject.updatedAt),
    workspace: storedProject.workspace ?? project.workspace,
    snapGrid: storedProject.snapGrid ?? project.snapGrid,
    placementElevation: storedProject.placementElevation ?? project.placementElevation,
    placementWorkplane: storedProject.placementWorkplane ?? project.placementWorkplane,
    sketchPlacementWorkplane: storedProject.sketchPlacementWorkplane ?? project.sketchPlacementWorkplane,
    sharedProject: project.sharedProject ?? storedProject.sharedProject,
  };
}

/** The record as it goes to storage: known fields only, each one normalized. */
export function projectForStorage(project: DashboardProject): DashboardProject {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    shapes: project.shapes,
    accent: project.accent,
    thumbnailUrl: project.thumbnailUrl ?? null,
    thumbnailVersion: project.thumbnailVersion,
    revision: project.revision,
    workspace: normalizeWorkspaceSettings(project.workspace),
    snapGrid: normalizeSnapGrid(project.snapGrid),
    placementElevation: typeof project.placementElevation === "number" && Number.isFinite(project.placementElevation) ? project.placementElevation : 0,
    placementWorkplane: normalizePlacementWorkplane(project.placementWorkplane, project.placementElevation),
    sketchPlacementWorkplane: normalizePlacementWorkplane(project.sketchPlacementWorkplane),
    sharedProject: project.sharedProject,
  };
}

/**
 * The list as it goes to storage. `storedProjects` is passed in rather than
 * read here, so the same input always gives the same output - the dashboard
 * feeds the result straight back into its state and would otherwise chase a
 * moving target.
 */
export function mergeProjectsForStorage(projects: DashboardProject[], storedProjects: DashboardProject[]): DashboardProject[] {
  const storedById = new Map(storedProjects.map((project) => [project.id, project]));
  return projects.map((project) => projectForStorage(mergeProjectForStorage(project, storedById.get(project.id))));
}
