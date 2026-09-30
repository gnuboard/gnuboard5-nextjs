import type {
  InicisExtra,
  KcpExtra,
  NicepayExtra,
  PgService,
} from "@/lib/payment";

export type OrderBody = Record<string, string | number>;

export type AddressBookPayload = {
  ad_subject: string;
  ad_default: 0 | 1;
  ad_name: string;
  ad_tel: string;
  ad_hp: string;
  ad_zip1: string;
  ad_zip2: string;
  ad_addr1: string;
  ad_addr2: string;
  ad_addr3: string;
  ad_jibeon: string;
};

export type CreatedOrderResponse = {
  order?: { od_id: string; uid?: string };
  od_id?: string;
  uid?: string;
};

export type PreparedPaymentResponse = {
  order_id: string;
  order_name: string;
  amount: number;
  buyer_name: string;
  buyer_email: string;
  buyer_tel: string;
  pg_service?: PgService;
  uid?: string;
  pg_extra?: {
    inicis?: InicisExtra;
    kcp?: KcpExtra;
    nicepay?: NicepayExtra;
  };
};
