/**
 * 같은 GET 요청을 잠깐 나눠 쓰는 작은 캐시.
 *
 * 한 화면의 여러 컴포넌트가 같은 API 를 거의 동시에 부르거나(상품 상세의 /settings 세 번, 글 보기의
 * /boards/free 두 번), 링크에 마우스를 올렸을 때 미리 불러 둔 요청을 이동한 뒤 화면이 받아 쓸 때 쓴다.
 *
 * - 진행 중인 요청과 성공한 결과를 ttl 동안 같은 키로 돌려준다.
 * - 실패(예외, 또는 isFailure 가 참인 결과)는 담지 않는다 — 다음 호출이 다시 받는다.
 * - 로그인한 사람마다 응답이 다를 수 있으므로 ttl 은 짧게 쓰고, 로그인 상태가 바뀌면 clear() 한다.
 * - 서버(빌드·SSR)에서는 나눠 쓰지 않는다(enabled). 요청마다 사용자가 다를 수 있기 때문이다.
 * - 오래 둘러봐도 탭 메모리가 늘지 않도록 maxEntries 개까지만 둔다(만료된 것, 그다음 오래된 것부터 뺀다).
 * - 여러 화면이 같은 객체를 받는다. 받은 값을 고치지 말 것 — 다른 화면이 같은 것을 보고 있다.
 */
export interface RequestShare {
  get<T>(key: string, ttlMs: number, load: () => Promise<T>, isFailure?: (value: T) => boolean): Promise<T>;
  clear(): void;
  size(): number;
}

interface RequestShareOptions {
  now?: () => number;
  enabled?: () => boolean;
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 100;

interface Entry {
  promise: Promise<unknown>;
  expiresAt: number;
}

export function createRequestShare(options: RequestShareOptions = {}): RequestShare {
  const now = options.now ?? (() => Date.now());
  const enabled = options.enabled ?? (() => typeof window !== "undefined");
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const entries = new Map<string, Entry>();

  function forget(key: string, promise: Promise<unknown>) {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  }

  /** 새로 하나 담을 자리를 만든다 — 만료된 것부터, 그래도 모자라면 가장 먼저 담은 것부터 뺀다. */
  function makeRoom() {
    if (entries.size < maxEntries) return;
    const current = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= current) entries.delete(key);
    }
    for (const key of entries.keys()) {
      if (entries.size < maxEntries) break;
      entries.delete(key);
    }
  }

  return {
    get<T>(key: string, ttlMs: number, load: () => Promise<T>, isFailure?: (value: T) => boolean): Promise<T> {
      if (!enabled()) return load();

      const cached = entries.get(key);
      if (cached && cached.expiresAt > now()) return cached.promise as Promise<T>;

      const promise = load();
      entries.delete(key);
      makeRoom();
      entries.set(key, { promise, expiresAt: now() + ttlMs });
      promise.then(
        (value) => {
          if (isFailure?.(value)) forget(key, promise);
        },
        () => forget(key, promise)
      );

      return promise;
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}

/** 앱 전체가 같이 쓰는 인스턴스. 브라우저에서만 나눠 쓴다. */
export const requestShare = createRequestShare();
