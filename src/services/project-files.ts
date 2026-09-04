import { invoke, isTauri } from "@tauri-apps/api/core";

export interface ProjectFile {
  id: string;
  title: string;
  path: string;
  folder: string;
  updatedAt: number;
}

export type ProjectFileView =
  | { kind: "text"; text: string; ext: string }
  | { kind: "binary"; bytes: number; ext: string };

export function listProjectFiles(folders: string[]): Promise<ProjectFile[]> {
  return isTauri() && folders.length ? invoke<ProjectFile[]>("list_project_files", { folders }) : Promise.resolve([]);
}

export function readProjectFile(path: string, folders: string[]): Promise<ProjectFileView> {
  return invoke<ProjectFileView>("read_project_file", { path, folders });
}

export function readProjectImage(path: string, folders: string[]): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("read_project_image", { path, folders });
}
