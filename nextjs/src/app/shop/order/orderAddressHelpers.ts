export interface AddressForm {
  name: string;
  tel: string;
  hp: string;
  zip: string;
  addr1: string;
  addr2: string;
  addr3: string;
  addr_jibeon: string;
}

export interface SavedAddress {
  ad_id: number;
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

export type AddressSelection = "same" | "new" | number;

export const EMPTY_ADDRESS: AddressForm = {
  name: "",
  tel: "",
  hp: "",
  zip: "",
  addr1: "",
  addr2: "",
  addr3: "",
  addr_jibeon: "",
};

export function savedAddressToAddressForm(address: SavedAddress): AddressForm {
  return {
    name: address.ad_name,
    tel: address.ad_tel,
    hp: address.ad_hp,
    zip: (address.ad_zip1 + address.ad_zip2).trim(),
    addr1: address.ad_addr1,
    addr2: address.ad_addr2,
    addr3: address.ad_addr3,
    addr_jibeon: address.ad_jibeon,
  };
}
