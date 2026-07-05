import { create } from "zustand";

type AppState = {
  entityFilter: string | null;
  searchTargetProjectId: number | null;
  graphProjectId: number | null;
  pendingProjectSelectionId: number | null;
  setEntityFilter: (entity: string | null) => void;
  setSearchTargetProjectId: (projectId: number | null) => void;
  setGraphProjectId: (projectId: number | null) => void;
  setPendingProjectSelectionId: (projectId: number | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  entityFilter: null,
  searchTargetProjectId: null,
  graphProjectId: null,
  pendingProjectSelectionId: null,
  setEntityFilter: (entity) => set({ entityFilter: entity }),
  setSearchTargetProjectId: (projectId) =>
    set({ searchTargetProjectId: projectId }),
  setGraphProjectId: (projectId) => set({ graphProjectId: projectId }),
  setPendingProjectSelectionId: (projectId) =>
    set({ pendingProjectSelectionId: projectId }),
}));
