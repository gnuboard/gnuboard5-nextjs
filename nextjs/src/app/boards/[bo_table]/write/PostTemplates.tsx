"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileText, ChevronDown } from "lucide-react";

interface Template {
  name: string;
  subjectPrefix: string;
  content: string;
}

const TEMPLATES: Template[] = [
  {
    name: "질문",
    subjectPrefix: "[질문] ",
    content: `<h3>문제 상황</h3>
<p>어떤 문제가 발생했는지 설명해주세요.</p>

<h3>시도한 것</h3>
<p>문제 해결을 위해 시도한 방법을 적어주세요.</p>

<h3>환경</h3>
<ul>
<li>OS: </li>
<li>브라우저: </li>
<li>버전: </li>
</ul>`,
  },
  {
    name: "후기",
    subjectPrefix: "[후기] ",
    content: `<h3>사용 기간</h3>
<p></p>

<h3>장점</h3>
<p></p>

<h3>단점</h3>
<p></p>

<h3>총평</h3>
<p></p>`,
  },
  {
    name: "공지",
    subjectPrefix: "[공지] ",
    content: `<h2>공지사항</h2>
<p>안녕하세요. 관리자입니다.</p>

<hr />

<p>공지 내용을 입력해주세요.</p>

<p><strong>적용 일시:</strong> </p>
<p><strong>문의:</strong> </p>`,
  },
];

interface PostTemplatesProps {
  onApply: (subjectPrefix: string, content: string) => void;
}

export function PostTemplates({ onApply }: PostTemplatesProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={menuRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        className="gap-1.5"
      >
        <FileText className="h-4 w-4" />
        템플릿
        <ChevronDown className="h-3 w-3" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-md">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              className="flex w-full items-center rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                onApply(tpl.subjectPrefix, tpl.content);
                setOpen(false);
              }}
            >
              <FileText className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              {tpl.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
