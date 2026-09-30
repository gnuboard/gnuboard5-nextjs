import { api } from "@/lib/api";
import type { SavedAddress } from "./orderAddressHelpers";

export async function deleteSavedAddress(adId: number): Promise<void> {
  await api.delete(`/shop/addresses/${adId}`);
}

export async function updateSavedAddressSubject(
  address: SavedAddress,
  subject: string
): Promise<SavedAddress> {
  const res = await api.patch<SavedAddress>(`/shop/addresses/${address.ad_id}`, {
    ad_subject: subject,
  });

  return (res.data as SavedAddress | undefined) ?? {
    ...address,
    ad_subject: subject,
  };
}

export async function setSavedAddressAsDefault(
  address: SavedAddress
): Promise<SavedAddress> {
  const res = await api.patch<SavedAddress>(`/shop/addresses/${address.ad_id}`, {
    ad_default: 1,
  });

  return (res.data as SavedAddress | undefined) ?? {
    ...address,
    ad_default: 1,
  };
}

export function replaceSavedAddress(
  addresses: SavedAddress[],
  updated: SavedAddress
): SavedAddress[] {
  return addresses.map((address) =>
    address.ad_id === updated.ad_id ? { ...address, ...updated } : address
  );
}

export function markSavedAddressAsDefault(
  addresses: SavedAddress[],
  updated: SavedAddress
): SavedAddress[] {
  return addresses
    .map((address) =>
      address.ad_id === updated.ad_id
        ? { ...address, ...updated, ad_default: 1 }
        : { ...address, ad_default: 0 }
    )
    .sort((a, b) => b.ad_default - a.ad_default || b.ad_id - a.ad_id);
}
