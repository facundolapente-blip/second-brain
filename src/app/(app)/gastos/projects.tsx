"use client";

import { createContext, useContext } from "react";

export type ProjectOption = { id: string; name: string };

const ProjectsCtx = createContext<ProjectOption[]>([]);

/** Presupuestos puntuales activos, para elegirlos al cargar un gasto. */
export function ProjectsProvider({ projects, children }: { projects: ProjectOption[]; children: React.ReactNode }) {
  return <ProjectsCtx.Provider value={projects}>{children}</ProjectsCtx.Provider>;
}

export function useProjects() {
  return useContext(ProjectsCtx);
}
