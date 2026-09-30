/**
 * Web Push 구독 / 해제 — VAPID 공개키 필요.
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY 환경변수에 설정 시 활성. 없으면 모든 함수 noop.
 *   구독 정보는 POST /api/g5/push-subscriptions (백엔드 endpoint 운영자가 구현)
 *   로 전송 — 그누보드 표준 expo-push 와 다른 별도 테이블 권장.
 *
 *   사용:
 *     await ensurePushSubscription();    // 권한 요청 + 구독 + 서버 등록
 *     await unsubscribePush();           // 해제
 */
import { api } from "@/lib/api";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    VAPID !== ""
  );
}

export async function ensurePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return null;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // TS lib.dom 의 BufferSource 가 SharedArrayBuffer 호환 문제로 Uint8Array
      // 를 그대로 못 받는 환경 — 명시 ArrayBuffer 캐스트.
      applicationServerKey: urlBase64ToUint8Array(VAPID).buffer as ArrayBuffer,
    });
  }

  // 서버 등록 — 실패는 silent (사용자 측엔 영향 없음).
  try {
    await api.post("/push-subscriptions", sub.toJSON());
  } catch {
    /* noop */
  }
  return sub;
}

export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await api.delete("/push-subscriptions/" + encodeURIComponent(sub.endpoint));
  } catch {
    /* noop */
  }
  await sub.unsubscribe();
}
