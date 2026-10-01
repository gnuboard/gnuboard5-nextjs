import { create } from 'zustand';
import { ApiError, api } from '@/lib/api';
import type { LoginResponse, RegisterData } from '@/lib/types';
import { useCartStore } from '@/store/cart';

interface User {
  mb_id: string;
  mb_nick: string;
  mb_name: string;
  mb_email: string;
  mb_level: number;
  mb_point: number;
  mb_icon_path?: string;
  /** 회원이미지(프로필 사진) — 회원아이콘과 다른 그림. 없으면 비어 있다. */
  mb_image_path?: string;
  // 그누보드 cf_admin 일치 여부. 게시판/그룹 관리자 권한은 board context가 필요해
  // 단건 글 응답의 admin_role / can_manage 필드로 별도 전달.
  is_super_admin?: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  login: (mb_id: string, mb_password: string, autoLogin?: boolean) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  expireSession: () => void;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

type MemberLike = Record<string, string | number | undefined>;

function normalizeUser(
  member: MemberLike | undefined,
  options: { isSuperAdmin?: boolean } = {}
): User | null {
  if (!member) return null;
  const mbId = String(member.mb_id ?? '');
  if (!mbId) return null;

  return {
    mb_id: mbId,
    mb_nick: String(member.mb_nick ?? ''),
    mb_name: String(member.mb_name ?? ''),
    mb_email: String(member.mb_email ?? ''),
    mb_level: Number(member.mb_level ?? 0),
    mb_point: Number(member.mb_point ?? 0),
    mb_icon_path: member.mb_icon_path ? String(member.mb_icon_path) : undefined,
    mb_image_path: member.mb_image_path ? String(member.mb_image_path) : undefined,
    is_super_admin: options.isSuperAdmin,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    // HttpOnly cookie 세션은 JS에서 토큰을 읽을 수 없으므로 서버 확인을 먼저 시도한다.
    // access 만료 시 api client가 /auth/refresh를 한 번 시도한 뒤 /auth/me를 재요청한다.
    try {
      const res = await api.get<{ member: Record<string, string | number | undefined>; is_super_admin?: boolean }>('/auth/me');
      const user = normalizeUser(res.data?.member, {
        isSuperAdmin: !!res.data?.is_super_admin,
      });
      if (user) {
        set({
          user,
          isInitialized: true,
        });
      } else {
        set({ user: null, isInitialized: true });
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        api.setToken(null);
        api.setRefreshToken(null);
      }
      set({ user: null, isInitialized: true });
    }
  },

  login: async (mb_id: string, mb_password: string, autoLogin = false) => {
    set({ isLoading: true });
    try {
      const res = await api.post<LoginResponse>('/auth/login', {
        mb_id,
        mb_password,
        auto_login: autoLogin ? 1 : 0,
      });
      if (res.data) {
        api.setToken(res.data.token);
        if (res.data.refresh_token) {
          api.setRefreshToken(res.data.refresh_token, { autoLogin });
        }
        // API returns 'member' field, map to user
        const user = normalizeUser(res.data.member ?? res.data.user);
        set({ user, isLoading: false });
        void useCartStore.getState().fetchCart();
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (data: RegisterData) => {
    set({ isLoading: true });
    try {
      const res = await api.post<LoginResponse>('/auth/register', data);
      // 가입 직후 자동 로그인 흐름 — 서버가 token 도 같이 내려주는 경우
      if (res.data?.token) {
        api.setToken(res.data.token);
        if (res.data.refresh_token) api.setRefreshToken(res.data.refresh_token, { autoLogin: false });
        const user = normalizeUser(res.data.member ?? res.data.user);
        if (user) set({ user });
        void useCartStore.getState().fetchCart();
      }
      set({ isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    // 서버에 refresh token revoke + HttpOnly cookie 삭제 통보 (best-effort).
    const refresh = api.getRefreshToken();
    // 비동기 fire-and-forget — 응답 기다리지 않고 즉시 로컬 정리.
    await api.post('/auth/logout', refresh ? { refresh_token: refresh } : {}).catch(() => undefined);
    api.setToken(null);
    api.setRefreshToken(null);
    useCartStore.getState().resetLocalCart();
    set({ user: null });
  },

  expireSession: () => {
    api.setToken(null);
    api.setRefreshToken(null);
    useCartStore.getState().resetLocalCart();
    set({ user: null, isLoading: false, isInitialized: true });
  },

  fetchUser: async () => {
    try {
      const res = await api.get<{ member: Record<string, string | number | undefined>; is_super_admin?: boolean }>('/auth/me');
      const user = normalizeUser(res.data?.member, {
        isSuperAdmin: !!res.data?.is_super_admin,
      });
      set({ user });
    } catch {
      api.setToken(null);
      set({ user: null });
    }
  },
}));

let clientAuthBootstrapStarted = false;

export function ensureClientAuthInitialized() {
  if (typeof window === 'undefined' || clientAuthBootstrapStarted) return;

  const state = useAuthStore.getState();
  if (state.isInitialized) return;

  clientAuthBootstrapStarted = true;
  if (api.hasAuthHint()) {
    void state.initialize();
    return;
  }

  useAuthStore.setState({
    user: null,
    isLoading: false,
    isInitialized: true,
  });
}

if (typeof window !== 'undefined') {
  const schedule =
    typeof globalThis.queueMicrotask === 'function'
      ? globalThis.queueMicrotask.bind(globalThis)
      : (callback: () => void) => window.setTimeout(callback, 0);
  schedule(ensureClientAuthInitialized);
}
