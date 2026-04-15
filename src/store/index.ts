import { create } from "zustand";

type AppState = {
  searchTargetProjectId: number | null;
  graphProjectId: number | null;
  pendingProjectSelectionId: number | null;
  setSearchTargetProjectId: (projectId: number | null) => void;
  setGraphProjectId: (projectId: number | null) => void;
  setPendingProjectSelectionId: (projectId: number | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  searchTargetProjectId: null,
  graphProjectId: null,
  pendingProjectSelectionId: null,
  setSearchTargetProjectId: (projectId) =>
    set({ searchTargetProjectId: projectId }),
  setGraphProjectId: (projectId) => set({ graphProjectId: projectId }),
  setPendingProjectSelectionId: (projectId) =>
    set({ pendingProjectSelectionId: projectId }),
}));
