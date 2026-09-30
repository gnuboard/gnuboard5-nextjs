import { apiClient } from "@/lib/api";
import { validateApiData } from "@/lib/api-response";
import { savedAddressListSchema, type SavedAddress } from "@/lib/schemas";

export interface AddressPayload {
  ad_subject: string;
  ad_default: number;
  ad_name: string;
  ad_tel: string;
  ad_hp: string;
  ad_zip1: string;
  ad_zip2: string;
  ad_addr1: string;
  ad_addr2: string;
  ad_addr3: string;
  ad_jibeon: string;
}

export async function getSavedAddresses(): Promise<SavedAddress[]> {
  const response = await apiClient.get<unknown>("/shop/addresses");
  return validateApiData(response.data, savedAddressListSchema, []);
}

export function createSavedAddress(payload: AddressPayload) {
  return apiClient.post("/shop/addresses", payload);
}

export function deleteSavedAddress(addressId: number) {
  return apiClient.delete(`/shop/addresses/${addressId}`);
}
