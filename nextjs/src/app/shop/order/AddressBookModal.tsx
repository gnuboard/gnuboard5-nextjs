"use client";

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
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4 pr-12">
          <DialogTitle>배송지 목록</DialogTitle>
          <DialogDescription>
            저장된 배송지를 선택하거나 기본 배송지와 배송지명을 관리합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto overflow-x-auto p-6">
          {addresses.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              저장된 배송지가 없습니다.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">배송지명</th>
                  <th className="px-3 py-2 text-left">이름</th>
                  <th className="px-3 py-2 text-left">배송지 정보</th>
                  <th className="px-3 py-2 text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {addresses.map((address) => (
                  <tr key={address.ad_id} className="border-b">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {address.ad_default === 1 && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                            기본
                          </span>
                        )}
                        <input
                          type="text"
                          defaultValue={address.ad_subject || ""}
                          onBlur={(event) =>
                            onUpdateSubject(address, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                          }}
                          disabled={updatingAddressId === address.ad_id}
                          maxLength={20}
                          placeholder="배송지명"
                          className="min-w-0 rounded border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">{address.ad_name}</td>
                    <td className="px-3 py-3">
                      <div>
                        ({address.ad_zip1}
                        {address.ad_zip2}) {address.ad_addr1}{" "}
                        {address.ad_addr2} {address.ad_addr3}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {address.ad_tel} / {address.ad_hp}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onSelect(address)}
                        >
                          선택
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={address.ad_default === 1 ? "default" : "outline"}
                          onClick={() => onSetDefault(address)}
                          disabled={
                            address.ad_default === 1 ||
                            updatingAddressId === address.ad_id
                          }
                        >
                          기본배송지
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onDelete(address.ad_id)}
                          disabled={updatingAddressId === address.ad_id}
                        >
                          삭제
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
