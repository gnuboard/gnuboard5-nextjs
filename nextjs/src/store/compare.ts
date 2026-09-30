import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CompareItem {
  it_id: string;
  it_name: string;
  it_price: number;
  it_cust_price?: number;
  it_tel_inq?: string;
  image_url: string;
  ca_name?: string;
  it_brand?: string;
  it_seo_title?: string;
}

interface CompareState {
  items: CompareItem[];
  add: (item: CompareItem) => boolean;
  remove: (it_id: string) => void;
  clear: () => void;
  isCompared: (it_id: string) => boolean;
}

const MAX_COMPARE = 4;

/**
 * 상품 비교 store — 최대 4개. localStorage 영속 (persist middleware).
 * UI: 하단 CompareTray + /shop/compare 페이지.
 */
export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        const { items } = get();
        if (items.find((i) => i.it_id === item.it_id)) return false;
        if (items.length >= MAX_COMPARE) return false;
        set({ items: [...items, item] });
        return true;
      },
      remove: (it_id) =>
        set({ items: get().items.filter((i) => i.it_id !== it_id) }),
      clear: () => set({ items: [] }),
      isCompared: (it_id) => !!get().items.find((i) => i.it_id === it_id),
    }),
    { name: "shop-compare" }
  )
);
