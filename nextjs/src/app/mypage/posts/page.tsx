"use client";

import { useEffect, useState } from "react";
import { getMyPosts } from "@/services/member";
import type { MyPost } from "@/lib/schemas";
import { getClientPublicSettings } from "@/services/settings";
import { boardPostHref } from "@/lib/board-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export default function MyPostsPage() {
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [bbsRewriteMode, setBbsRewriteMode] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [items, settings] = await Promise.all([
          getMyPosts(30),
          getClientPublicSettings().catch(() => null),
        ]);
        setPosts(items);
        setBbsRewriteMode(Number(settings?.cf_bbs_rewrite ?? 0));
      } catch {
        setPosts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>내 게시글</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div role="status" aria-label="내 게시글 로딩 중" className="space-y-4 py-3">
            <span className="sr-only">내 게시글 로딩 중</span>
            <div aria-hidden="true" className="space-y-3">
              {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-14 rounded-md" />)}
            </div>
          </div>
        ) : posts.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            작성한 게시글이 없습니다.
          </p>
        ) : (
          <ul className="divide-y">
            {posts.map((post) => (
              <li
                key={`${post.bo_table}-${post.wr_id}`}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={boardPostHref(post.bo_table, post, bbsRewriteMode)}
                    className="block truncate text-sm transition-colors hover:text-primary"
                  >
                    {post.wr_subject}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {post.bo_subject || post.bo_table}
                  </span>
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(post.wr_datetime)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
