"use client";

import { FileDown, MessageSquare } from "lucide-react";
import type { QaItem } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QaFileEntry {
  index: number;
  file: string;
  source: string;
  url: string;
}

function qaFileEntries(item: QaItem): QaFileEntry[] {
  return [
    {
      index: 1,
      file: item.qa_file1,
      source: item.qa_source1,
      url: item.qa_file1_url,
    },
    {
      index: 2,
      file: item.qa_file2,
      source: item.qa_source2,
      url: item.qa_file2_url,
    },
  ].filter((entry) => entry.file && entry.url);
}

function isImageFile(entry: QaFileEntry) {
  return /\.(gif|jpe?g|png|webp|bmp)$/i.test(entry.source || entry.file);
}

export function QaAttachments({ item }: { item: QaItem }) {
  const files = qaFileEntries(item);
  if (files.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">첨부파일</CardTitle>
      </CardHeader>
      <CardContent>
        <QaAttachmentList item={item} />
      </CardContent>
    </Card>
  );
}

export function QaAttachmentList({ item }: { item: QaItem }) {
  const files = qaFileEntries(item);
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {files.map((file) => (
        <div key={file.index} className="rounded-md border p-3">
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            download
            className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline"
          >
            <FileDown className="size-4 shrink-0" />
            <span className="truncate">{file.source || file.file}</span>
          </a>
          {isImageFile(file) && (
            <a href={file.url} target="_blank" rel="noreferrer" className="mt-3 block">
              <img
                src={file.url}
                alt={file.source || file.file}
                className="max-h-80 w-auto max-w-full rounded-md border object-contain"
              />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export function QaRelatedQuestions({
  items,
  onSelect,
}: {
  items: QaItem[];
  onSelect: (qaId: number) => void;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">관련 문의</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-md border">
          {items.map((item) => (
            <button
              key={item.qa_id}
              type="button"
              onClick={() => onSelect(item.qa_id)}
              className="flex w-full items-start gap-3 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <MessageSquare
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  item.qa_status === 1 ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">{item.qa_subject}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.qa_category ? `${item.qa_category} · ` : ""}
                  {formatDate(item.qa_datetime)}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  item.qa_status === 1
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {item.qa_status === 1 ? "답변 완료" : "답변 대기"}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
