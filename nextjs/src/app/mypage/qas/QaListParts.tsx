"use client";

import { useState } from "react";
import { Paperclip, Search } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { htmlToText } from "@/lib/html-text";
import type { QaItem } from "@/lib/types";
import { cn, formatDate, truncate } from "@/lib/utils";

/*
 * 1:1 문의 목록의 조각 — 그누보드 bbs/qalist.php · 기본 qa 스킨(list.skin.php)과 같은 것을 보여 준다:
 * 분류 줄, 검색(제목 · 내용 · 글쓴이, 관리자는 회원아이디도), 번호 · 제목 · 첨부 · 글쓴이 · 등록일 · 상태.
 */

export type QaSearchField = "qa_subject" | "qa_content" | "qa_name" | "mb_id";

const SEARCH_FIELDS: Array<{ value: QaSearchField; label: string; adminOnly?: boolean }> = [
  { value: "qa_subject", label: "제목" },
  { value: "qa_content", label: "내용" },
  { value: "qa_name", label: "글쓴이" },
  { value: "mb_id", label: "회원아이디", adminOnly: true },
];

export function qaSearchField(value: string | null): QaSearchField {
  return SEARCH_FIELDS.some((field) => field.value === value) ? (value as QaSearchField) : "qa_subject";
}

export function QaCategoryTabs({
  categories,
  current,
  onSelect,
}: {
  categories: string[];
  current?: string;
  onSelect: (category?: string) => void;
}) {
  if (categories.length === 0) return null;
  const options = [{ label: "전체", value: undefined as string | undefined }, ...categories.map((c) => ({ label: c, value: c }))];

  return (
    <nav aria-label="문의 분류" className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = (current || undefined) === option.value;
        return (
          <button
            key={option.label}
            type="button"
            onClick={() => onSelect(option.value)}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary hover:text-primary"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </nav>
  );
}

export function QaSearchForm({
  field,
  keyword,
  isAdmin,
  onSearch,
  onReset,
}: {
  field: QaSearchField;
  keyword?: string;
  isAdmin: boolean;
  onSearch: (field: QaSearchField, keyword: string) => void;
  onReset: () => void;
}) {
  const [nextField, setNextField] = useState<QaSearchField>(field);
  const [nextKeyword, setNextKeyword] = useState(keyword ?? "");
  const fields = SEARCH_FIELDS.filter((item) => isAdmin || !item.adminOnly);

  return (
    <form
      role="search"
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (nextKeyword.trim()) onSearch(nextField, nextKeyword.trim());
      }}
    >
      <Select value={nextField} onValueChange={(value) => setNextField(qaSearchField(value))}>
        <SelectTrigger aria-label="검색 대상" className="w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label htmlFor="qa-search-keyword" className="sr-only">
        검색어
      </label>
      <Input
        id="qa-search-keyword"
        type="search"
        placeholder="검색어를 입력하세요"
        value={nextKeyword}
        onChange={(event) => setNextKeyword(event.target.value)}
        className="min-w-0 flex-1 sm:max-w-xs"
      />
      <Button type="submit" variant="secondary">
        <Search className="mr-1 size-4" aria-hidden />
        검색
      </Button>
      {keyword ? (
        <Button type="button" variant="ghost" onClick={onReset}>
          검색 해제
        </Button>
      ) : null}
    </form>
  );
}

/** 목록에 보일 내용 한 줄 — 편집기로 쓴 문의(qa_html)는 태그를 걷어 글자만. */
function contentPreview(item: QaItem): string {
  const text = item.qa_html ? htmlToText(item.qa_content) : item.qa_content.replace(/\s+/g, " ").trim();
  return truncate(text, 120);
}

export function QaListRow({
  item,
  number,
  subjectLength,
  showWriter,
  selectable,
  checked,
  onCheckedChange,
}: {
  item: QaItem;
  number: number;
  subjectLength: number;
  showWriter: boolean;
  selectable: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const answered = item.qa_status === 1;
  const hasFile = Boolean(item.qa_file1 || item.qa_file2);
  const subject = subjectLength > 0 ? truncate(item.qa_subject, subjectLength) : item.qa_subject;
  const preview = contentPreview(item);

  return (
    <li className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/50">
      {selectable ? (
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          aria-label={`${item.qa_subject} 선택`}
          className="mt-1 rounded"
        />
      ) : null}
      <span className="mt-0.5 w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        <span className="sr-only">번호 </span>
        {number}
      </span>
      <Link href={`/mypage/qas/${item.qa_id}`} className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              answered ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            {answered ? "답변완료" : "답변대기"}
          </span>
          {item.qa_category ? (
            <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">{item.qa_category}</span>
          ) : null}
          <span className="break-words text-sm font-medium">{subject}</span>
          {hasFile ? <Paperclip className="size-3.5 text-muted-foreground" aria-label="첨부파일" /> : null}
        </span>
        {preview ? <span className="mt-1 block break-words text-sm text-muted-foreground">{preview}</span> : null}
        <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {showWriter ? (
            <span>
              {item.qa_name || item.mb_id}
              {item.mb_id && item.qa_name && item.qa_name !== item.mb_id ? ` (${item.mb_id})` : ""}
            </span>
          ) : null}
          <time dateTime={item.qa_datetime}>{formatDate(item.qa_datetime)}</time>
        </span>
      </Link>
    </li>
  );
}
