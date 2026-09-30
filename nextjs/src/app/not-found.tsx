"use client";

import { G5Link as Link } from "@/components/ui/g5-link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="container mx-auto px-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <p className="text-7xl font-bold text-muted-foreground">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        페이지를 찾을 수 없습니다
      </h1>
      <p className="mt-2 text-muted-foreground max-w-md">
        요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
        주소를 다시 확인해 주세요.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/">홈으로 돌아가기</Link>
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          이전 페이지
        </Button>
      </div>
    </div>
  );
}
