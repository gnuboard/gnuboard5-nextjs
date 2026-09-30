import { create } from "zustand";

const MAX_ITEMS = 20;
const STORAGE_KEY = "recent_products";

export interface RecentProduct {
  it_id: string;
  it_name: string;
  it_seo_title?: string;
  it_price: number;
  it_tel_inq?: string;
  image_url: string;
  viewed_at: number;
}

interface RecentProductsState {
  items: RecentProduct[];
  addProduct: (product: RecentProduct) => void;
  clearAll: () => void;
}

function loadFromStorage(): RecentProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: RecentProduct[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage full or unavailable
  }
}

export const useRecentProductsStore = create<RecentProductsState>((set, get) => ({
  items: [],

  addProduct: (product) => {
    const current = get().items;
    // Remove duplicate
    const filtered = current.filter((p) => p.it_id !== product.it_id);
    // Add to front
    const updated = [
      { ...product, viewed_at: Date.now() },
      ...filtered,
    ].slice(0, MAX_ITEMS);
    saveToStorage(updated);
    set({ items: updated });
  },

  clearAll: () => {
    saveToStorage([]);
    set({ items: [] });
  },
}));

if (typeof window !== "undefined") {
  window.queueMicrotask(() => {
    useRecentProductsStore.setState({ items: loadFromStorage() });
  });
}
