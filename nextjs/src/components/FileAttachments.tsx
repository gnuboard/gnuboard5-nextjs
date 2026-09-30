"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Upload, FileIcon } from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";

// 그누보드5의 첨부파일 컴포넌트.
// 두 종류의 항목을 순서 있는 리스트로 다룬다:
//   - existing: 서버에 이미 저장된 파일 (편집 모드에서만)
//   - new:      이 세션에서 사용자가 드래그/선택한 파일
// 부모는 `value`로 두 종류를 합친 배열을 들고 있다가, 제출 시 keep[]/files[]로
// 분리해 PUT /files 호출에 넘긴다.

export interface ExistingAttachment {
  kind: "existing";
  id: string;            // dnd-kit용 안정적 key
  bf_no: number;         // 서버상 슬롯 번호
  bf_source: string;     // 원본 파일명
  bf_filesize: number;
  bf_url: string;        // 표시용 URL
  bf_type: number;       // 0=비이미지, 1+=이미지(IMAGETYPE_*)
}

export interface NewAttachment {
  kind: "new";
  id: string;
  file: File;
  previewUrl?: string;   // 이미지 파일이면 ObjectURL
}

export type Attachment = ExistingAttachment | NewAttachment;

interface Props {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  /** 게시판의 bo_upload_count. 0이면 무제한. */
  maxCount?: number;
  /** 게시판의 bo_upload_size (바이트). 0이면 무제한. */
  maxSize?: number;
  disabled?: boolean;
}

export function FileAttachments({ value, onChange, maxCount = 0, maxSize = 0, disabled }: Props) {
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 첫 픽셀에서 reorder 시작하면 셀 안의 버튼 클릭이 막혀서 8px threshold.
      activationConstraint: { distance: 8 },
    }),
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      setError(null);

      // count check
      if (maxCount > 0 && value.length + accepted.length > maxCount) {
        setError(`첨부파일은 최대 ${maxCount}개까지 가능합니다.`);
        return;
      }

      // size check
      if (maxSize > 0) {
        const oversize = accepted.find((f) => f.size > maxSize);
        if (oversize) {
          setError(
            `"${oversize.name}" 파일이 게시판 제한 용량(${formatFileSize(maxSize)})을 초과합니다.`,
          );
          return;
        }
      }

      const additions: NewAttachment[] = accepted.map((file) => ({
        kind: "new",
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      }));

      onChange([...value, ...additions]);
    },
    [value, onChange, maxCount, maxSize],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled,
    noClick: false,
    noKeyboard: false,
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = value.findIndex((a) => a.id === active.id);
    const newIndex = value.findIndex((a) => a.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(value, oldIndex, newIndex));
  };

  const handleRemove = (id: string) => {
    const item = value.find((a) => a.id === id);
    if (item?.kind === "new" && item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    onChange(value.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-md px-4 py-6 text-center cursor-pointer transition-colors",
          "hover:border-primary hover:bg-accent/30",
          isDragActive && "border-primary bg-accent/40",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        )}
      >
        <input {...getInputProps({ "aria-label": "첨부파일 선택" })} />
        <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-1" />
        <p className="text-sm text-muted-foreground">
          {isDragActive
            ? "여기에 파일을 놓으세요"
            : "파일을 드래그하거나 클릭해서 첨부"}
        </p>
        {(maxCount > 0 || maxSize > 0) && (
          <p className="text-xs text-muted-foreground/80 mt-1">
            {maxCount > 0 && <span>최대 {maxCount}개</span>}
            {maxCount > 0 && maxSize > 0 && <span> · </span>}
            {maxSize > 0 && <span>파일당 {formatFileSize(maxSize)}</span>}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {value.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <ul className="border rounded-md divide-y">
              {value.map((att) => (
                <AttachmentRow key={att.id} attachment={att} onRemove={() => handleRemove(att.id)} disabled={disabled} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  onRemove,
  disabled,
}: {
  attachment: Attachment;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: attachment.id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isImage =
    attachment.kind === "existing"
      ? attachment.bf_type > 0 && attachment.bf_type < 18
      : !!attachment.previewUrl;

  const previewUrl =
    attachment.kind === "existing" ? attachment.bf_url : attachment.previewUrl;

  const name = attachment.kind === "existing" ? attachment.bf_source : attachment.file.name;
  const size = attachment.kind === "existing" ? attachment.bf_filesize : attachment.file.size;

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 px-2 py-2 bg-background">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 touch-none"
        aria-label="순서 변경 핸들"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="h-10 w-10 shrink-0 rounded border bg-muted/40 flex items-center justify-center overflow-hidden">
        {isImage && previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" title={name}>{name}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(size)}</p>
      </div>

      {attachment.kind === "existing" && (
        <span className="text-xs text-muted-foreground">기존</span>
      )}

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="text-muted-foreground hover:text-destructive p-1"
        aria-label="첨부 제거"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
