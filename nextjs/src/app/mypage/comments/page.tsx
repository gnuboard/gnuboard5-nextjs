"use client";

import { useEffect, useState } from "react";
import { htmlToText } from "@/lib/html-text";
import { getMyComments } from "@/services/member";
import type { MyComment } from "@/lib/schemas";
import { g5ShortHref } from "@/lib/g5-short-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

/** 댓글 목록 한 줄 — 글이 없고 사진만 있으면 그렇다고 적는다. */
function commentExcerpt(html: string): string {
  const text = htmlToText(html);
  if (text) return text;
  return /<img\b/i.test(html) ? "사진 댓글" : "내용 없음";
}

export default function MyCommentsPage() {
  const [comments, setComments] = useState<MyComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setComments(await getMyComments(30));
      } catch {
        setComments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>내 댓글</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div role="status" aria-label="내 댓글 로딩 중" className="space-y-4 py-3">
            <span className="sr-only">내 댓글 로딩 중</span>
            <div aria-hidden="true" className="space-y-3">
              {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-14 rounded-md" />)}
            </div>
          </div>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            작성한 댓글이 없습니다.
          </p>
        ) : (
          <ul className="divide-y">
            {comments.map((comment) => (
              <li key={`${comment.bo_table}-${comment.wr_id}`}>
                {/* 댓글 원문(사진 포함)을 그대로 그리면 목록이 사진으로 덮인다 — 글만 요약하고, #c_번호 로 그 댓글에 바로 간다. */}
                <a
                  href={g5ShortHref(`/boards/${comment.bo_table}/${comment.wr_parent}#c_${comment.wr_id}`)}
                  className="group flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm transition-colors group-hover:text-primary">
                      {commentExcerpt(comment.wr_content)}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {comment.bo_subject || comment.bo_table}
                    </span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(comment.wr_datetime)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
