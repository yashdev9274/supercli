import type { GitProject } from "./git-workspace"

export function matchWorkspaceProject(
  projects: GitProject[],
  selection: {
    projectId?: string
    repositoryFullName?: string | null
    rootName?: string | null
  },
): GitProject | undefined {
  if (selection.projectId)
    return projects.find((project) => project.id === selection.projectId)
  const matches = selection.repositoryFullName
    ? projects.filter(
        (project) =>
          project.repositoryFullName?.toLowerCase() ===
          selection.repositoryFullName?.toLowerCase(),
      )
    : selection.rootName
      ? projects.filter(
          (project) =>
            project.name === selection.rootName ||
            project.path.split(/[\\/]/).pop() === selection.rootName,
        )
      : projects
  return matches.length === 1 ? matches[0] : undefined
}
