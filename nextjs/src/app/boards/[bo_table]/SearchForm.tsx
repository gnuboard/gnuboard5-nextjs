"use client";

import { useState } from "react";
import { g5ShortHref } from "@/lib/g5-short-url";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SearchFormProps {
  boTable: string;
  sfl?: string;
  stx?: string;
}

const searchFields = [
  { value: "wr_subject", label: "제목" },
  { value: "wr_content", label: "내용" },
  { value: "wr_subject||wr_content", label: "제목+내용" },
  { value: "mb_id,1", label: "회원아이디" },
  { value: "wr_name,1", label: "글쓴이" },
];

export function SearchForm({ boTable, sfl, stx }: SearchFormProps) {
  const [field, setField] = useState(sfl || "wr_subject||wr_content");
  const [keyword, setKeyword] = useState(stx || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    const params = new URLSearchParams({
      sfl: field,
      stx: keyword.trim(),
    });
    window.location.href = g5ShortHref(`/boards/${boTable}?${params.toString()}`);
  };

  return (
    <form action={g5ShortHref(`/boards/${boTable}`)} method="get" onSubmit={handleSubmit} className="flex gap-2 mb-6">
      <input type="hidden" name="sfl" value={field} />
      <Select value={field} onValueChange={setField}>
        <SelectTrigger aria-label="검색 대상" className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {searchFields.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label htmlFor={`${boTable}-board-search-query`} className="sr-only">
        검색어
      </label>
      <Input
        id={`${boTable}-board-search-query`}
        name="stx"
        type="text"
        placeholder="검색어를 입력하세요"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="flex-1 max-w-sm"
      />
      <Button type="submit" variant="secondary">
        검색
      </Button>
    </form>
  );
}
