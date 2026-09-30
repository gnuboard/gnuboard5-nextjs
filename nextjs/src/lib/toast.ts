import { toast } from "@/hooks/use-toast";
import type { ToastActionElement } from "@/components/ui/toast";

export interface ToastOptions {
  /** 우측에 표시할 액션 버튼 (예: 장바구니 바로가기) */
  action?: ToastActionElement;
  /** 토스트가 자동으로 닫히기까지 걸리는 시간(ms) */
  duration?: number;
}

/** 성공 토스트 */
export function toastSuccess(message: string, options: ToastOptions = {}) {
  toast({
    description: message,
    action: options.action,
    duration: options.duration,
  });
}

/** 에러 토스트 */
export function toastError(message: string, options: ToastOptions = {}) {
  toast({
    variant: "destructive",
    description: message,
    action: options.action,
    duration: options.duration,
  });
}

/** 경고/정보 토스트 */
export function toastInfo(message: string, options: ToastOptions = {}) {
  toast({
    description: message,
    action: options.action,
    duration: options.duration,
  });
}
