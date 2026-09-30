"use client";

import { G5Link as Link } from "@/components/ui/g5-link";
import { useEffect, useState } from "react";
import { getMyDashboardCounts, type MyDashboardCounts } from "@/services/member";
import { useAuthStore } from "@/store/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ShoppingBag,
  Heart,
  Bookmark,
  FileText,
  MessageSquare,
  MapPin,
  Coins,
} from "lucide-react";

export default function MyPageDashboard() {
  const { user } = useAuthStore();
  const [counts, setCounts] = useState<MyDashboardCounts>({
    orders: 0,
    wishlist: 0,
    scraps: 0,
    posts: 0,
    comments: 0,
    addresses: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let alive = true;

    const loadCounts = async () => {
      try {
        const nextCounts = await getMyDashboardCounts();
        if (alive) setCounts(nextCounts);
      } finally {
        if (alive) setLoading(false);
      }
    };

    setLoading(true);
    loadCounts();

    return () => {
      alive = false;
    };
  }, [user]);

  const cards = [
    {
      href: "/mypage/orders",
      title: "주문 내역",
      count: counts.orders,
      icon: ShoppingBag,
      color: "text-blue-600",
    },
    {
      href: "/mypage/wishlist",
      title: "위시리스트",
      count: counts.wishlist,
      icon: Heart,
      color: "text-red-600",
    },
    {
      href: "/mypage/scraps",
      title: "스크랩",
      count: counts.scraps,
      icon: Bookmark,
      color: "text-cyan-600",
    },
    {
      href: "/mypage/posts",
      title: "내 게시글",
      count: counts.posts,
      icon: FileText,
      color: "text-green-700",
    },
    {
      href: "/mypage/comments",
      title: "내 댓글",
      count: counts.comments,
      icon: MessageSquare,
      color: "text-purple-600",
    },
    {
      href: "/mypage/addresses",
      title: "배송지",
      count: counts.addresses,
      icon: MapPin,
      color: "text-amber-700",
    },
    {
      href: "/mypage/points",
      title: "포인트",
      count: user?.mb_point ?? 0,
      icon: Coins,
      color: "text-yellow-600",
      suffix: "점",
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">대시보드</h2>

      <div className="mypage-stats grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href}>
              <Card className="mypage-stat-card transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                    {card.title}
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {loading
                      ? "..."
                      : card.count.toLocaleString() + (card.suffix ?? "")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
