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
  fetchCart: () => Promise<void>;
  addItem: (it_id: string, qty: number, options?: ShopItemOption[]) => Promise<void>;
  updateQty: (ct_id: number, qty: number) => Promise<void>;
  removeItem: (ct_id: number) => Promise<void>;
  clearCart: () => Promise<void>;
  resetLocalCart: () => void;
}

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

  fetchCart: async () => {
    set({ isLoading: true, fetchError: null });
    try {
      const res = await api.get<{ items: CartItem[]; total_price: number; total_qty: number }>('/shop/cart');
      const data = res.data;
      const items = data?.items || [];
      set({ items, isLoading: false, fetchError: null, ...calculateTotals(items) });
    } catch {
      set({
        isLoading: false,
        fetchError: '장바구니를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.',
      });
    }
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
