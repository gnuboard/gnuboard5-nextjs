import { create } from "zustand";
import { storageGet, storageSet } from "@/lib/safe-storage";

const STORAGE_KEY = "restock_alerts";

export interface RestockAlert {
  it_id: string;
  it_name: string;
  registered_at: number;
}

interface RestockAlertState {
  alerts: RestockAlert[];
  addAlert: (it_id: string, it_name: string) => void;
  removeAlert: (it_id: string) => void;
  isAlerted: (it_id: string) => boolean;
  getAlerts: () => RestockAlert[];
}

function loadFromStorage(): RestockAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = storageGet(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(alerts: RestockAlert[]) {
  if (typeof window === "undefined") return;
  try {
    storageSet(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // storage full or unavailable
  }
}

export const useRestockAlertStore = create<RestockAlertState>((set, get) => ({
  alerts: [],

  addAlert: (it_id, it_name) => {
    const current = get().alerts;
    if (current.some((a) => a.it_id === it_id)) return;
    const updated = [
      ...current,
      { it_id, it_name, registered_at: Date.now() },
    ];
    saveToStorage(updated);
    set({ alerts: updated });
  },

  removeAlert: (it_id) => {
    const updated = get().alerts.filter((a) => a.it_id !== it_id);
    saveToStorage(updated);
    set({ alerts: updated });
  },

  isAlerted: (it_id) => {
    return get().alerts.some((a) => a.it_id === it_id);
  },

  getAlerts: () => {
    return get().alerts;
  },
}));

if (typeof window !== "undefined") {
  window.queueMicrotask(() => {
    useRestockAlertStore.setState({ alerts: loadFromStorage() });
  });
}
