"use client";

import { G5Link as Link } from "@/components/ui/g5-link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { currentPathForRuntime } from "@/lib/config";
import { cn } from "@/lib/utils";
import {
  User,
  Lock,
  FileText,
  MessageSquare,
  ShoppingBag,
  Heart,
  MapPin,
  Coins,
  Ticket,
  Star,
  LayoutDashboard,
  Mail,
  Bell,
  Bookmark,
  HelpCircle,
  MonitorSmartphone,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface MenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: "내 정보",
    items: [
      { href: "/mypage", label: "대시보드", icon: LayoutDashboard },
      { href: "/mypage/profile", label: "프로필 수정", icon: User },
      { href: "/mypage/password", label: "비밀번호 변경", icon: Lock },
      { href: "/mypage/sessions", label: "로그인 기기", icon: MonitorSmartphone },
    ],
  },
  {
    title: "커뮤니티",
    items: [
      { href: "/mypage/posts", label: "내 게시글", icon: FileText },
      { href: "/mypage/comments", label: "내 댓글", icon: MessageSquare },
      { href: "/mypage/scraps", label: "스크랩", icon: Bookmark },
      { href: "/mypage/notifications", label: "알림", icon: Bell },
      { href: "/mypage/memos", label: "쪽지함", icon: Mail },
      { href: "/mypage/qas", label: "1:1 문의", icon: HelpCircle },
    ],
  },
  {
    title: "쇼핑몰",
    items: [
      { href: "/mypage/orders", label: "주문 내역", icon: ShoppingBag },
      { href: "/mypage/reviews", label: "상품후기", icon: Star },
      { href: "/mypage/wishlist", label: "위시리스트", icon: Heart },
      { href: "/mypage/shop-qas", label: "상품문의", icon: HelpCircle },
      { href: "/mypage/addresses", label: "배송지 관리", icon: MapPin },
      { href: "/mypage/points", label: "포인트 내역", icon: Coins },
      { href: "/mypage/coupons", label: "쿠폰함", icon: Ticket },
    ],
  },
];

export default function MyPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isInitialized } = useAuthStore();

  useEffect(() => {
    if (isInitialized && !user) {
      // 쿼리까지 넘겨야 로그인 뒤 돌아왔을 때 값이 남는다(예: 사이드뷰 쪽지보내기의 ?recv=받는이).
      // 경로는 설치 폴더를 뗀 실제 주소로 — 정적 셸(__g5_static__)로 서빙된 화면도 제 주소로 돌아온다.
      const redirect = `${currentPathForRuntime(pathname || "/mypage")}${window.location.search}`;
      runtimeRouterPush(router, `/login?redirect=${encodeURIComponent(redirect)}`);
    }
  }, [isInitialized, pathname, user, router]);

  if (!isInitialized) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="space-y-4">
          <div className="skeleton mb-6 h-8 w-40 rounded" />
          <div className="skeleton h-32 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Find current menu label for breadcrumb
  const allItems = MENU_GROUPS.flatMap((g) => g.items);
  const currentItem = allItems.find(
    (item) =>
      pathname === item.href ||
      (item.href !== "/mypage" && pathname.startsWith(item.href))
  );
  const breadcrumbItems = [
    { label: "마이페이지", href: "/mypage" },
    ...(currentItem && currentItem.href !== "/mypage"
      ? [{ label: currentItem.label }]
      : []),
  ];

  return (
    <div className="mypage-page container mx-auto max-w-6xl px-4 py-8">
      <Breadcrumb items={breadcrumbItems} />

      {/* Member Overview Card */}
      <div className="mypage-profile mb-6 rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {user.mb_nick || user.mb_name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({user.mb_id})
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {user.mb_email}
            </p>
          </div>
          <div className="mypage-profile-stats flex gap-6 text-sm">
            <div>
              <p className="text-muted-foreground">레벨</p>
              <p className="text-lg font-bold">{user.mb_level}</p>
            </div>
            <div>
              <p className="text-muted-foreground">포인트</p>
              <p className="text-lg font-bold text-primary">
                {(user.mb_point ?? 0).toLocaleString()}점
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mypage-layout grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside>
          <nav className="mypage-nav sticky top-4 space-y-6 rounded-lg border bg-card p-4">
            {MENU_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground">
                  {group.title}
                </h3>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/mypage" && pathname.startsWith(item.href));
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-primary/10 font-medium text-[hsl(var(--primary-accessible))]"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="mypage-main min-w-0">{children}</main>
      </div>
    </div>
  );
}
