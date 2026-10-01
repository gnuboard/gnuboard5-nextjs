import { create } from 'zustand';
import { api } from '@/lib/api';
import type { CartItem, ShopItemOption } from '@/lib/types';

interface CartState {
  items: CartItem[];
  isLoading: boolean;
  fetchError: string | null;
  totalPrice: number;
  totalPoint: number;
  totalQty: number;
  /**
   * 장바구니를 다시 받는다. 기본은 늘 새로 받는다 — 담기·수량 변경 직후에는 방금 보낸
   * 변경이 반영된 값이어야 하므로 진행 중인 요청을 물려받아서는 안 된다.
   * `dedupe` 는 화면이 뜰 때처럼 "지금 상태가 필요할 뿐"인 경우에만 쓴다.
   */
  fetchCart: (options?: { dedupe?: boolean }) => Promise<void>;
  addItem: (it_id: string, qty: number, options?: ShopItemOption[]) => Promise<void>;
  updateQty: (ct_id: number, qty: number) => Promise<void>;
  removeItem: (ct_id: number) => Promise<void>;
  clearCart: () => Promise<void>;
  resetLocalCart: () => void;
}

/** 진행 중인 /shop/cart 요청. dedupe 를 부탁한 호출만 이것을 물려받는다. */
let cartFetchInFlight: Promise<void> | null = null;
/** 마지막으로 받아온 시각. */
let cartFetchedAt = 0;
/*
 * 화면 이동으로 쇼핑 화면에 들어오면 머리글 카트가 두 번 붙는데 그 간격이 150ms 쯤이고
 * 요청은 50ms 면 끝난다 — 겹치지 않으므로 "진행 중인 것 물려주기"만으로는 두 번 나간다.
 * 그래서 dedupe 호출은 방금 받은 값이 있으면 아예 다시 받지 않는다. 담기·수량 변경은
 * dedupe 를 쓰지 않으니 이 창에 걸리지 않는다.
 */
const CART_DEDUPE_WINDOW_MS = 1_000;

function calculateTotals(items: CartItem[]) {
  return {
    totalPrice: items.reduce(
      (sum, item) => sum + (item.line_total ?? item.ct_price * item.ct_qty),
      0
    ),
    totalPoint: items.reduce((sum, item) => sum + (item.ct_point ?? 0) * item.ct_qty, 0),
    totalQty: items.reduce((sum, item) => sum + item.ct_qty, 0),
  };
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  isLoading: false,
  fetchError: null,
  totalPrice: 0,
  totalPoint: 0,
  totalQty: 0,

  fetchCart: (options) => {
    if (options?.dedupe) {
      if (cartFetchInFlight) return cartFetchInFlight;
      if (Date.now() - cartFetchedAt < CART_DEDUPE_WINDOW_MS) return Promise.resolve();
    }

    const run = (async () => {
      set({ isLoading: true, fetchError: null });
      try {
        const res = await api.get<{ items: CartItem[]; total_price: number; total_qty: number }>('/shop/cart');
        const data = res.data;
        const items = data?.items || [];
        cartFetchedAt = Date.now();
        set({ items, isLoading: false, fetchError: null, ...calculateTotals(items) });
      } catch {
        set({
          isLoading: false,
          fetchError: '장바구니를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.',
        });
      }
    })();

    cartFetchInFlight = run;
    void run.finally(() => {
      if (cartFetchInFlight === run) cartFetchInFlight = null;
    });

    return run;
  },

  addItem: async (it_id: string, qty: number, options?: ShopItemOption[]) => {
    set({ isLoading: true, fetchError: null });
    try {
      const ctOption = options?.find((opt) => opt.io_id)?.io_id ?? "";
      await api.post('/shop/cart', {
        it_id,
        ct_qty: qty,
        ...(ctOption ? { ct_option: ctOption } : {}),
      });
      await get().fetchCart();
    } catch {
      set({ isLoading: false });
      throw new Error('장바구니 추가에 실패했습니다.');
    }
  },

  updateQty: async (ct_id: number, qty: number) => {
    // Optimistic — 즉시 store 갱신해 UI 가 +/- 누른 직후 반영. 서버 실패 시 rollback.
    const prevItems = get().items;
    const items = prevItems.map((item) =>
      item.ct_id === ct_id ? { ...item, ct_qty: qty } : item
    );
    set({ items, fetchError: null, ...calculateTotals(items) });
    try {
      await api.patch(`/shop/cart/${ct_id}`, { ct_qty: qty });
    } catch (err) {
      // rollback.
      set({ items: prevItems, ...calculateTotals(prevItems) });
      throw err instanceof Error ? err : new Error('수량 변경에 실패했습니다.');
    }
  },

  removeItem: async (ct_id: number) => {
    // Optimistic — 즉시 제거. 실패 시 복구.
    const prevItems = get().items;
    const items = prevItems.filter((item) => item.ct_id !== ct_id);
    set({ items, fetchError: null, ...calculateTotals(items) });
    try {
      await api.delete(`/shop/cart/${ct_id}`);
    } catch (err) {
      set({ items: prevItems, ...calculateTotals(prevItems) });
      throw err instanceof Error ? err : new Error('장바구니 삭제에 실패했습니다.');
    }
  },

  clearCart: async () => {
    try {
      await api.delete('/shop/cart');
      set({ items: [], fetchError: null, totalPrice: 0, totalPoint: 0, totalQty: 0 });
    } catch {
      throw new Error('장바구니 비우기에 실패했습니다.');
    }
  },

  resetLocalCart: () => {
    set({ items: [], isLoading: false, fetchError: null, totalPrice: 0, totalPoint: 0, totalQty: 0 });
  },
}));
