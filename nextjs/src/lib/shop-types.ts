// Shop API response types shared by services and UI components.

export interface ShopProductInfoItem {
  key: string;
  title: string;
  value: string;
  example?: string;
}

export interface ShopProduct {
  it_id: string;
  ca_id: string;
  ca_name?: string;
  it_name: string;
  it_price: number;
  it_basic_price: number;
  it_cust_price: number;
  it_point: number;
  it_point_type?: number;
  it_stock_qty: number;
  it_buy_min_qty?: number;
  it_buy_max_qty?: number;
  it_tel_inq?: string;
  it_soldout: string;
  it_stock_sms?: string;
  stock_sms_privacy?: string;
  it_sc_type?: number;
  it_sc_method?: number;
  it_sc_price?: number;
  it_sc_minimum?: number;
  it_sc_qty?: number;
  it_type1: string;
  it_type2: string;
  it_type3: string;
  it_type4: string;
  it_type5: string;
  it_content?: string;
  it_explan?: string;
  it_basic?: string;
  it_head_html?: string;
  it_tail_html?: string;
  it_info_gubun?: string;
  it_info_title?: string;
  it_info_items?: ShopProductInfoItem[];
  it_option_subject?: string;
  /** 목록 응답에만 있다: 쓰는 중인 선택옵션이 있어 옵션 없이는 담을 수 없는 상품 */
  has_options?: boolean;
  /** 목록 응답에만 있다: 그누보드 is_soldout() 과 같은 품절 판정(선택옵션 상품은 옵션 재고 기준) */
  is_soldout?: boolean;
  it_supply_subject?: string;
  // 상품 메타 — 영카트 it_brand/it_maker/it_origin/it_model/it_seo_title.
  it_brand?: string;
  it_maker?: string;
  it_origin?: string;
  it_model?: string;
  it_seo_title?: string;
  image_url: string;
  images?: string[];
  options?: ShopProductOption[];
  category?: ShopCategory;
  review_count?: number;
  review_avg?: number;
  qa_count?: number;
  related_items?: ShopProduct[];
  prev_item?: ShopProductNavItem | null;
  next_item?: ShopProductNavItem | null;
}

export interface ShopProductNavItem {
  it_id: string;
  it_name: string;
  it_seo_title?: string;
  image_url?: string;
}

export interface ShopProductOption {
  io_no: number;
  it_id: string;
  io_id: string;
  io_type: string;
  io_value: string;
  io_price: number;
  io_stock_qty: number;
  io_noti_qty?: number;
  io_use?: number | string;
}

export interface ShopCategory {
  ca_id: string;
  ca_name: string;
  ca_order: number;
  ca_skin?: string;
  item_count?: number;
  children?: ShopCategory[];
}

export interface ShopBanner {
  bn_id: number;
  bn_alt: string;
  bn_url: string;
  bn_position: string;
  bn_device: string;
  bn_border: number;
  bn_new_win: number;
  bn_order: number;
  image_url: string;
  /** 폭별 주소("… 1440w, … 1920w") — 화면 폭에 맞는 쪽을 브라우저가 고른다. 옛 API 는 주지 않는다. */
  image_srcset?: string;
  hit_url?: string;
}

export interface ShopPopup {
  nw_id: number;
  nw_division: string;
  nw_device: string;
  nw_begin_time: string;
  nw_end_time: string;
  nw_disable_hours: number;
  nw_width: number;
  nw_height: number;
  nw_subject: string;
  nw_content: string;
  nw_content_text: string;
  nw_content_html: number;
}

export interface ShopNaverPayConfig {
  enabled: boolean;
  reason: string;
  test: boolean;
  mobile: boolean;
  shop_id: string;
  button_key: string;
  button_count_item: number;
  button_count_cart: number;
  script_url: string;
  order_url: string;
  wish_url: string;
}

export interface ShopNaverPayOrderOption {
  io_id: string;
  io_type: number;
  io_value: string;
  ct_qty: number;
}

export interface ShopNaverPayOrderRequest {
  source: "item" | "cart";
  it_id?: string;
  quantity?: number;
  options?: ShopNaverPayOrderOption[];
  ct_ids?: string[] | string;
  back_url?: string;
}

export interface ShopNaverPayOrderResponse {
  order_id: string;
  shop_id: string;
  total_price: number;
  redirect_url: string;
}

export interface ShopNaverPayWishResponse {
  shop_id: string;
  item_ids: string[];
  redirect_url: string;
}

export interface ShopCartItem {
  ct_id: string;
  it_id: string;
  it_name: string;
  it_seo_title?: string;
  ct_price: number;
  ct_qty: number;
  ct_option: string;
  io_type?: number;
  io_price?: number;
  ct_direct?: number;
  ct_send_cost?: number;
  it_sc_type?: number;
  it_sc_method?: number;
  it_sc_price?: number;
  it_sc_minimum?: number;
  it_sc_qty?: number;
  line_total: number;
  it_basic_price: number;
  it_stock_qty: number;
  it_soldout: string;
  it_use?: string;
  it_tel_inq?: string;
  image_url: string;
  // 상품/카테고리 쿠폰으로 행에 적용된 할인액 + 묶인 쿠폰 ID (없으면 0/빈 문자열).
  cp_price?: number;
  cp_id?: string;
}

export interface ShopCartResponse {
  items: ShopCartItem[];
  total_price: number;
  total_qty: number;
  // 카트 행들에 묶인 상품/카테고리 쿠폰 할인 합계 (cart_coupon).
  cart_coupon?: number;
  send_cost?: number;
  shipping_cost?: number;
}

export interface ShopShippingRule {
  limit: number;
  cost: number;
}

export interface ShopPolicy {
  delivery_company: string;
  send_cost_case: string;
  send_cost_limit: string;
  send_cost_list: string;
  shipping_rules: ShopShippingRule[];
  base_shipping_cost: number;
  free_threshold: number;
  delivery_content: string;
  delivery_content_text: string;
  exchange_content: string;
  exchange_content_text: string;
  review_requires_completed_order?: boolean;
  review_requires_moderation?: boolean;
  point_use_enabled?: boolean;
  settle_min_point?: number;
  settle_max_point?: number;
  settle_point_unit?: number;
}

export interface ShopShippingQuote {
  item_total: number;
  cart_coupon: number;
  zip1: string;
  zip2: string;
  base: number;
  extra: number;
  total: number;
  free_threshold: number;
  free_remaining: number;
  policy: ShopPolicy;
}

export interface ShopOrder {
  od_id: string;
  item_count?: number;
  od_name: string;
  od_tel: string;
  od_hp: string;
  od_zip: string;
  od_addr1: string;
  od_addr2: string;
  od_addr3: string;
  od_b_name?: string;
  od_b_tel?: string;
  od_b_hp?: string;
  od_b_zip1?: string;
  od_b_zip2?: string;
  od_b_zip?: string;
  od_b_addr1?: string;
  od_b_addr2?: string;
  od_b_addr3?: string;
  od_b_addr_jibeon?: string;
  od_receipt_price: number;
  od_send_cost: number;
  od_status: string;
  od_time?: string;
  od_receipt_time: string;
  can_cancel?: boolean;
  cancel_block_reason?: string;
  od_settle_case: string;
  // 결제 결과 (PG/입금 정보). 가상계좌 결제면 od_bank_account 에 은행/계좌 안내가 들어옴.
  od_bank_account?: string;
  od_deposit_name?: string;
  od_pg?: string;
  od_tno?: string;
  od_app_no?: string;
  od_memo?: string;
  // 쿠폰/포인트 할인 (없으면 0).
  od_cart_count?: number;
  od_cart_price?: number;
  od_cart_coupon?: number;
  od_coupon?: number;
  od_cancel_price?: number;
  od_misu?: number;
  od_receipt_point?: number;
  od_refund_price?: number;
  od_list_price?: number;
  od_order_price?: number;
  od_total_price?: number;
  od_receipt_total?: number;
  od_misu_price?: number;
  od_is_fully_paid?: boolean;
  od_total_point?: number;
  od_payment_app_label?: string;
  od_payment_app_value?: string;
  od_payment_display_bank?: boolean;
  od_payment_receipt_url?: string;
  receipt_url?: string;
  // 배송비 세분화 — od_send_cost(기본) + od_send_cost2(도서산간) - od_send_coupon(배송비 쿠폰).
  od_send_cost2?: number;
  od_send_coupon?: number;
  // 배송 추적 — 관리자가 송장번호 입력 시 노출.
  od_delivery_company?: string;
  od_invoice?: string;
  od_invoice_time?: string;
  od_delivery_inquiry_url?: string;
  delivery_inquiry_url?: string;
  // 현금영수증 — PG 발급 결과. od_cash=1 이면 발급된 상태.
  od_cash?: number;
  od_cash_no?: string;
  od_cash_info?: string;
  od_cash_receipt_url?: string;
  cash_receipt_url?: string;
  od_cash_receipt_issue_url?: string;
  cash_receipt_issue_url?: string;
  // 희망배송일 (YYYY-MM-DD), 모바일 주문 마킹, 세금계산서 신청 플래그.
  od_hope_date?: string;
  od_mobile?: number;
  od_tax_flag?: number;
  od_tax_mny?: number;
  od_vat_mny?: number;
  od_free_mny?: number;
  items?: ShopOrderItem[];
}

export interface ShopOrderItem {
  ct_id: string;
  it_id: string;
  it_name: string;
  it_seo_title?: string;
  ct_price: number;
  ct_qty: number;
  ct_point?: number;
  line_total?: number;
  line_point?: number;
  ct_option: string;
  ct_status: string;
  ct_stock_use?: number;
  io_type?: number;
  io_price?: number;
  ct_send_cost?: number;
  it_sc_type?: number;
  it_sc_method?: number;
  it_sc_price?: number;
  it_sc_minimum?: number;
  it_sc_qty?: number;
  image_url?: string;
}

export interface ShopWishItem {
  wi_id: string;
  it_id: string;
  it_name: string;
  it_seo_title?: string;
  it_basic_price: number;
  it_cust_price: number;
  it_tel_inq?: string;
  it_soldout?: string;
  it_use?: string;
  it_stock_qty?: number;
  option_count?: number;
  can_add_cart?: boolean;
  cart_block_reason?: string;
  image_url: string;
  wi_time: string;
}

export interface ShopReview {
  is_id: string;
  it_id: string;
  it_name?: string;
  it_seo_title?: string;
  ca_id?: string;
  it_price?: number;
  mb_id: string;
  mb_nick: string;
  is_name: string;
  is_score: number;
  is_subject: string;
  is_content: string;
  is_confirm?: string;
  is_time: string;
  product_image_url?: string;
  /** 후기 카드 사진 — 후기 본문의 첫 사진, 없으면 상품 사진(그누보드 get_itemuselist_thumbnail). */
  thumbnail_url?: string;
}

export interface ShopReviewScoreSummary {
  score: number;
  count: number;
  percentage: number;
}

export interface ShopReviewSummary {
  total: number;
  average: number;
  photo_count: number;
  scores: ShopReviewScoreSummary[];
}

export interface ShopQA {
  iq_id: string;
  it_id: string;
  it_name?: string;
  it_seo_title?: string;
  ca_id?: string;
  it_price?: number;
  mb_id: string;
  mb_nick: string;
  iq_name: string;
  iq_subject: string;
  iq_question: string;
  iq_answer: string;
  iq_secret?: number;
  iq_email?: string;
  iq_hp?: string;
  is_answered?: boolean;
  can_view?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  iq_time: string;
  product_image_url?: string;
}
