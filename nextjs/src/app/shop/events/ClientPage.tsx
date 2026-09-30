"use client";

import { useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { api } from "@/lib/api";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Sparkles } from "lucide-react";

interface EventListItem {
  ev_id: number;
  ev_subject: string;
  ev_subject_strong: number;
  item_count: number;
}

export default function EventsListPage() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    applyClientPageMetadata({
      title: "기획전",
      description: "진행 중인 영카트 기획전을 확인하세요.",
      path: "/shop/events",
    });
  }, []);

  useEffect(() => {
    api
      .get<EventListItem[]>("/shop/events")
      .then((res) => {
        setErrorMessage("");
        setEvents((res.data as EventListItem[]) ?? []);
      })
      .catch((err: unknown) => {
        setEvents([]);
        setErrorMessage(err instanceof Error ? err.message : "기획전을 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "기획전" }]} />
      <h1 className="mb-6 text-2xl font-bold">기획전</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20 rounded-lg" />
          ))}
        </div>
      ) : errorMessage ? (
        <div className="flex flex-col items-center py-16 text-destructive">
          <Sparkles className="mb-4 h-16 w-16 text-destructive/40" />
          <p>{errorMessage}</p>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Sparkles className="mb-4 h-16 w-16 text-muted-foreground/40" />
          <p>진행 중인 기획전이 없습니다.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((ev) => (
            <Link
              key={ev.ev_id}
              href={`/shop/events/${ev.ev_id}`}
              className="group flex items-center gap-3 rounded-lg border p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className={
                    "text-sm leading-snug " +
                    (ev.ev_subject_strong ? "font-bold" : "font-medium")
                  }
                >
                  {ev.ev_subject}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  상품 {ev.item_count}개
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
