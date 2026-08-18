import { create } from "zustand";

type User = {
  name: string;
  role: string;
};

type AppState = {
  currentUser: User;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  currentUser: {
    name: "Developer",
    role: "API Engineer",
  },
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
