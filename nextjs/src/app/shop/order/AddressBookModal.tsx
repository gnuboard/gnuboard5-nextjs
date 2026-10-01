"use client";

import { Check, MapPin, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SavedAddress } from "./orderAddressHelpers";

type AddressBookModalProps = {
  open: boolean;
  addresses: SavedAddress[];
  updatingAddressId: number | null;
  onClose: () => void;
  onSelect: (address: SavedAddress) => void;
  onSetDefault: (address: SavedAddress) => void;
  onDelete: (addressId: number) => void;
  onUpdateSubject: (address: SavedAddress, subject: string) => void;
};

/** 우편번호 두 칸은 저장만 나뉘어 있고 사람이 읽을 때는 한 덩어리다. */
function formatZip(address: SavedAddress): string {
  const zip = `${address.ad_zip1 ?? ""}${address.ad_zip2 ?? ""}`.trim();
  return zip ? `(${zip})` : "";
}

function formatAddress(address: SavedAddress): string {
  return [address.ad_addr1, address.ad_addr2, address.ad_addr3]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** 전화와 휴대폰이 같은 번호로 저장된 경우가 흔하다 — 같은 값을 두 번 보여 주지 않는다. */
function formatContacts(address: SavedAddress): string {
  const numbers = [address.ad_tel, address.ad_hp]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  return [...new Set(numbers)].join(" · ");
}

function AddressCard({
  address,
  busy,
  onSelect,
  onSetDefault,
  onDelete,
  onUpdateSubject,
}: {
  address: SavedAddress;
  busy: boolean;
  onSelect: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  onUpdateSubject: (subject: string) => void;
}) {
  const isDefault = address.ad_default === 1;
  const zip = formatZip(address);
  const contacts = formatContacts(address);
  const subjectId = `address-subject-${address.ad_id}`;

  return (
    <li
      className={`rounded-[8px] border bg-background p-4 transition-colors sm:p-5 ${
        isDefault
          ? "border-primary/40 bg-primary/[0.03]"
          : "border-border hover:border-[#c7cbd1]"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {/* 첫 줄은 받는 사람 — 목록에서 고를 때 가장 먼저 읽는 값이라 가장 크게 둔다. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-semibold text-foreground">{address.ad_name}</span>
            {isDefault ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                <Check aria-hidden className="size-3" />
                기본 배송지
              </span>
            ) : null}
            {contacts ? <span className="text-sm text-muted-foreground">{contacts}</span> : null}
          </div>

          <p className="mt-1.5 flex gap-1.5 text-sm leading-relaxed text-foreground/80">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-keep">
              {zip ? <span className="text-muted-foreground">{zip} </span> : null}
              {formatAddress(address)}
            </span>
          </p>

          {/* 배송지명은 이 목록에서만 쓰는 별명이다. 평소에는 조용히 두고, 손을 대면 입력칸이 된다. */}
          <div className="mt-3 flex items-center gap-1.5">
            <label htmlFor={subjectId} className="sr-only">
              {address.ad_name} 배송지명
            </label>
            <Pencil aria-hidden className="size-3.5 shrink-0 text-muted-foreground/70" />
            <input
              id={subjectId}
              type="text"
              defaultValue={address.ad_subject || ""}
              onBlur={(event) => onUpdateSubject(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              disabled={busy}
              maxLength={20}
              placeholder="배송지명 (예: 집, 회사)"
              className="w-full max-w-56 rounded-[4px] border border-transparent bg-transparent px-1.5 py-1 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-ring focus:bg-background focus:ring-[2px] focus:ring-ring/30"
            />
          </div>
        </div>

        {/* 고르는 것이 이 화면의 목적이라 선택만 채운 단추로 두고 나머지는 뒤로 물린다. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
          <Button type="button" size="sm" onClick={onSelect} className="sm:w-28">
            이 주소로 배송
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSetDefault}
            disabled={isDefault || busy}
            className="sm:w-28"
          >
            {isDefault ? "기본 배송지" : "기본으로"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            aria-label={`${address.ad_name} 배송지 삭제`}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:w-28"
          >
            <Trash2 aria-hidden />
            삭제
          </Button>
        </div>
      </div>
    </li>
  );
}

export function AddressBookModal({
  open,
  addresses,
  updatingAddressId,
  onClose,
  onSelect,
  onSetDefault,
  onDelete,
  onUpdateSubject,
}: AddressBookModalProps) {
  // 고르러 들어온 화면이므로 기본 배송지를 맨 위에 둔다. 나머지는 받은 순서 그대로.
  const ordered = [...addresses].sort(
    (a, b) => (b.ad_default === 1 ? 1 : 0) - (a.ad_default === 1 ? 1 : 0)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      {/* 기본 DialogContent 가 sm:max-w-lg(512px) 를 들고 있어, 폭을 넓히려면 같은 화면폭
          접두어로 덮어야 한다. max-w-3xl 처럼 접두어 없이 주면 640px 이상에서 밀린다. */}
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4 pr-12 sm:px-6">
          <DialogTitle>배송지 목록</DialogTitle>
          <DialogDescription>
            {addresses.length > 0
              ? `저장된 ${addresses.length}곳 중에서 고르거나, 기본 배송지와 배송지명을 정리할 수 있습니다.`
              : "주문할 때 저장한 배송지가 여기에 모입니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {ordered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MapPin aria-hidden className="size-8 text-muted-foreground/50" />
              <p className="font-medium text-foreground">저장된 배송지가 없습니다.</p>
              <p className="text-sm text-muted-foreground">
                주문서에서 &lsquo;배송지 목록에 저장&rsquo;을 켜 두면 다음 주문부터 바로 고를 수 있습니다.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {ordered.map((address) => (
                <AddressCard
                  key={address.ad_id}
                  address={address}
                  busy={updatingAddressId === address.ad_id}
                  onSelect={() => onSelect(address)}
                  onSetDefault={() => onSetDefault(address)}
                  onDelete={() => onDelete(address.ad_id)}
                  onUpdateSubject={(subject) => onUpdateSubject(address, subject)}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
