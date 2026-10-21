import { Skeleton } from "@/components/ui/skeleton";

/** 회원정보 찾기 화면의 자리 — 경로 표시 · 제목 · 이메일로 찾기 카드와 같은 모양. */
export default function ForgotPasswordLoading() {
  return (
    <div className="find-info-page container mx-auto max-w-4xl px-4 py-8">
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="mb-6 border-b pb-4">
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="max-w-xl rounded-xl border bg-card">
        <div className="space-y-2 border-b px-5 py-5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-5 px-5 py-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
