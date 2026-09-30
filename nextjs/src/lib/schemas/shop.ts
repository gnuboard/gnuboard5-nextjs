import { z } from "zod";
import type {
  ShopCartItem,
  ShopCartResponse,
  ShopBanner,
  ShopCategory,
  ShopNaverPayConfig,
  ShopNaverPayOrderResponse,
  ShopNaverPayWishResponse,
  ShopOrder,
  ShopPolicy,
  ShopPopup,
  ShopProduct,
  ShopProductOption,
  ShopQA,
  ShopReview,
  ShopReviewScoreSummary,
  ShopReviewSummary,
  ShopShippingQuote,
  ShopShippingRule,
  ShopWishItem,
} from "@/lib/api";
import {
  imageUrlValue,
  numberValue,
  optionalImageUrlValue,
  optionalString,
  paginationMetaSchema,
  stringValue,
} from "@/lib/schemas/primitives";
export const shopCategorySchema = z
  .object({
    ca_id: stringValue,
    ca_name: stringValue,
    ca_order: numberValue,
    item_count: numberValue.optional(),
  })
  .passthrough() as unknown as z.ZodType<ShopCategory>;

const shopProductNavItemSchema = z
  .object({
    it_id: stringValue,
    it_name: stringValue,
    it_seo_title: optionalString,
    image_url: optionalImageUrlValue,
  })
  .passthrough();

const shopProductInfoItemSchema = z
  .object({
    key: stringValue,
    title: stringValue,
    value: stringValue,
    example: optionalString,
  })
  .passthrough();

const shopProductOptionSchema = z
  .object({
    io_no: numberValue,
    it_id: stringValue,
    io_id: stringValue,
    io_type: stringValue,
    io_value: stringValue,
    io_price: numberValue,
    io_stock_qty: numberValue,
    io_noti_qty: numberValue.optional(),
    io_use: z.union([numberValue, stringValue]).optional(),
  })
  .passthrough() as unknown as z.ZodType<ShopProductOption>;

export const shopProductSchema = z
  .object({
    it_id: stringValue,
    ca_id: stringValue,
    ca_name: optionalString,
    it_name: stringValue,
    it_seo_title: optionalString,
    it_price: numberValue,
    it_basic_price: numberValue,
    it_cust_price: numberValue,
    it_point: numberValue,
    it_point_type: numberValue.optional(),
    it_stock_qty: numberValue,
    it_buy_min_qty: numberValue.optional(),
    it_buy_max_qty: numberValue.optional(),
    it_tel_inq: stringValue.optional(),
    it_soldout: stringValue,
    it_stock_sms: stringValue.optional(),
    stock_sms_privacy: optionalString,
    it_sc_type: numberValue.optional(),
    it_sc_method: numberValue.optional(),
    it_sc_price: numberValue.optional(),
    it_sc_minimum: numberValue.optional(),
    it_sc_qty: numberValue.optional(),
    it_type1: stringValue,
    it_type2: stringValue,
    it_type3: stringValue,
    it_type4: stringValue,
    it_type5: stringValue,
    it_content: optionalString,
    it_explan: optionalString,
    it_basic: optionalString,
    it_head_html: optionalString,
    it_tail_html: optionalString,
    it_info_gubun: optionalString,
    it_info_title: optionalString,
    it_info_items: z.array(shopProductInfoItemSchema).optional(),
    image_url: imageUrlValue,
    images: z.array(imageUrlValue).optional(),
    options: z.array(shopProductOptionSchema).optional(),
    category: shopCategorySchema.optional(),
    prev_item: shopProductNavItemSchema.nullable().optional(),
    next_item: shopProductNavItemSchema.nullable().optional(),
  })
  .passthrough() as unknown as z.ZodType<ShopProduct>;

export const shopProductListSchema = z.array(shopProductSchema);

export const shopCategoryProductPageSchema = z
  .object({
    category: shopCategorySchema,
    subcategories: z.array(shopCategorySchema).default([]),
    items: z.array(shopProductSchema).default([]),
    meta: paginationMetaSchema,
  })
  .passthrough();

export type ShopCategoryProductPage = z.infer<
  typeof shopCategoryProductPageSchema
>;

export const shopBannerSchema = z
  .object({
    bn_id: numberValue,
    bn_alt: stringValue,
    bn_url: stringValue,
    bn_position: stringValue,
    bn_device: stringValue,
    bn_border: numberValue,
    bn_new_win: numberValue,
    bn_order: numberValue,
    image_url: imageUrlValue,
    hit_url: optionalString,
  })
  .passthrough() as unknown as z.ZodType<ShopBanner>;

export const shopBannerListSchema = z.array(shopBannerSchema);

export const shopPopupSchema = z
  .object({
    nw_id: numberValue,
    nw_division: stringValue,
    nw_device: stringValue,
    nw_begin_time: stringValue,
    nw_end_time: stringValue,
    nw_disable_hours: numberValue,
    nw_width: numberValue,
    nw_height: numberValue,
    nw_subject: stringValue,
    nw_content: stringValue,
    nw_content_text: stringValue,
    nw_content_html: numberValue,
  })
  .passthrough() as unknown as z.ZodType<ShopPopup>;

export const shopPopupListSchema = z.array(shopPopupSchema);

export const shopCartItemSchema = z
  .object({
    ct_id: stringValue,
    it_id: stringValue,
    it_name: stringValue,
    it_seo_title: optionalString,
    ct_price: numberValue,
    ct_qty: numberValue,
    ct_option: stringValue,
    io_type: numberValue.optional(),
    io_price: numberValue.optional(),
    ct_direct: numberValue.optional(),
    ct_send_cost: numberValue.optional(),
    it_sc_type: numberValue.optional(),
    it_sc_method: numberValue.optional(),
    it_sc_price: numberValue.optional(),
    it_sc_minimum: numberValue.optional(),
    it_sc_qty: numberValue.optional(),
    line_total: numberValue,
    it_basic_price: numberValue,
    it_stock_qty: numberValue,
    it_soldout: stringValue,
    it_use: stringValue.optional(),
    it_tel_inq: stringValue.optional(),
    image_url: imageUrlValue,
  })
  .passthrough() as unknown as z.ZodType<ShopCartItem>;

export const shopCartResponseSchema = z
  .object({
    items: z.array(shopCartItemSchema).default([]),
    total_price: numberValue,
    total_qty: numberValue,
    send_cost: numberValue.optional(),
    shipping_cost: numberValue.optional(),
  })
  .passthrough() as unknown as z.ZodType<ShopCartResponse>;

export const shopNaverPayConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    reason: stringValue,
    test: z.boolean().default(false),
    mobile: z.boolean().default(false),
    shop_id: stringValue,
    button_key: stringValue,
    button_count_item: numberValue,
    button_count_cart: numberValue,
    script_url: stringValue,
    order_url: stringValue,
    wish_url: stringValue,
  })
  .passthrough() as unknown as z.ZodType<ShopNaverPayConfig>;

export const shopNaverPayOrderResponseSchema = z
  .object({
    order_id: stringValue,
    shop_id: stringValue,
    total_price: numberValue,
    redirect_url: stringValue,
  })
  .passthrough() as unknown as z.ZodType<ShopNaverPayOrderResponse>;

export const shopNaverPayWishResponseSchema = z
  .object({
    shop_id: stringValue,
    item_ids: z.array(stringValue).default([]),
    redirect_url: stringValue,
  })
  .passthrough() as unknown as z.ZodType<ShopNaverPayWishResponse>;

export const shopShippingRuleSchema = z
  .object({
    limit: numberValue,
    cost: numberValue,
  })
  .passthrough() as unknown as z.ZodType<ShopShippingRule>;

export const shopPolicySchema = z
  .object({
    delivery_company: stringValue,
    send_cost_case: stringValue,
    send_cost_limit: stringValue,
    send_cost_list: stringValue,
    shipping_rules: z.array(shopShippingRuleSchema).default([]),
    base_shipping_cost: numberValue,
    free_threshold: numberValue,
    delivery_content: stringValue,
    delivery_content_text: stringValue,
    exchange_content: stringValue,
    exchange_content_text: stringValue,
    review_requires_completed_order: z.boolean().optional().default(false),
    review_requires_moderation: z.boolean().optional().default(false),
    point_use_enabled: z.boolean().optional().default(false),
    settle_min_point: numberValue.optional().default(0),
    settle_max_point: numberValue.optional().default(0),
    settle_point_unit: numberValue.optional().default(1),
  })
  .passthrough() as unknown as z.ZodType<ShopPolicy>;

export const shopShippingQuoteSchema = z
  .object({
    item_total: numberValue,
    cart_coupon: numberValue,
    zip1: stringValue,
    zip2: stringValue,
    base: numberValue,
    extra: numberValue,
    total: numberValue,
    free_threshold: numberValue,
    free_remaining: numberValue,
    policy: shopPolicySchema,
  })
  .passthrough() as unknown as z.ZodType<ShopShippingQuote>;

export const shopWishItemSchema = z
  .object({
    wi_id: stringValue,
    it_id: stringValue,
    it_name: stringValue,
    it_seo_title: optionalString,
    it_basic_price: numberValue,
    it_cust_price: numberValue,
    it_tel_inq: stringValue.optional(),
    it_soldout: stringValue.optional(),
    it_use: stringValue.optional(),
    it_stock_qty: numberValue.optional(),
    option_count: numberValue.optional(),
    can_add_cart: z.boolean().optional(),
    cart_block_reason: optionalString,
    image_url: imageUrlValue,
    wi_time: stringValue,
  })
  .passthrough() as unknown as z.ZodType<ShopWishItem>;

export const shopWishItemListSchema = z.array(shopWishItemSchema);

const shopOrderItemSchema = z
  .object({
    ct_id: stringValue,
    it_id: stringValue,
    it_name: stringValue,
    it_seo_title: optionalString,
    ct_price: numberValue,
    ct_qty: numberValue,
    ct_point: numberValue.optional(),
    line_total: numberValue.optional(),
    line_point: numberValue.optional(),
    ct_option: stringValue,
    ct_status: stringValue,
    ct_stock_use: numberValue.optional(),
    io_type: numberValue.optional(),
    io_price: numberValue.optional(),
    ct_send_cost: numberValue.optional(),
    it_sc_type: numberValue.optional(),
    it_sc_method: numberValue.optional(),
    it_sc_price: numberValue.optional(),
    it_sc_minimum: numberValue.optional(),
    it_sc_qty: numberValue.optional(),
    image_url: optionalImageUrlValue,
  })
  .passthrough();

export const shopOrderSchema = z
  .object({
    od_id: stringValue,
    od_name: stringValue,
    od_tel: stringValue,
    od_hp: stringValue,
    od_zip: stringValue,
    od_addr1: stringValue,
    od_addr2: stringValue,
    od_addr3: stringValue,
    od_receipt_price: numberValue,
    od_send_cost: numberValue,
    od_cancel_price: numberValue.optional(),
    od_misu: numberValue.optional(),
    od_refund_price: numberValue.optional(),
    od_cart_count: numberValue.optional(),
    od_list_price: numberValue.optional(),
    od_order_price: numberValue.optional(),
    od_total_price: numberValue.optional(),
    od_receipt_total: numberValue.optional(),
    od_misu_price: numberValue.optional(),
    od_is_fully_paid: z.boolean().optional(),
    od_total_point: numberValue.optional(),
    od_tax_mny: numberValue.optional(),
    od_vat_mny: numberValue.optional(),
    od_free_mny: numberValue.optional(),
    od_status: stringValue,
    od_time: optionalString,
    od_receipt_time: stringValue,
    can_cancel: z.boolean().optional(),
    cancel_block_reason: optionalString,
    od_settle_case: stringValue,
    od_payment_display_bank: z.boolean().optional(),
    items: z.array(shopOrderItemSchema).optional(),
  })
  .passthrough() as unknown as z.ZodType<ShopOrder>;

export const shopOrderListSchema = z.array(shopOrderSchema);

export const shopReviewSchema = z
  .object({
    is_id: stringValue,
    it_id: stringValue,
    it_name: optionalString,
    mb_id: stringValue,
    mb_nick: stringValue,
    it_seo_title: optionalString,
    ca_id: optionalString,
    it_price: numberValue.optional(),
    is_name: stringValue,
    is_score: numberValue,
    is_subject: stringValue,
    is_content: stringValue,
    is_confirm: stringValue.optional(),
    is_time: stringValue,
    product_image_url: optionalImageUrlValue,
  })
  .passthrough() as unknown as z.ZodType<ShopReview>;

export const shopReviewListSchema = z.array(shopReviewSchema);

export const shopReviewScoreSummarySchema = z
  .object({
    score: numberValue,
    count: numberValue,
    percentage: numberValue,
  })
  .passthrough() as unknown as z.ZodType<ShopReviewScoreSummary>;

export const shopReviewSummarySchema = z
  .object({
    total: numberValue,
    average: numberValue,
    photo_count: numberValue,
    scores: z.array(shopReviewScoreSummarySchema).default([]),
  })
  .passthrough() as unknown as z.ZodType<ShopReviewSummary>;

export const shopQaSchema = z
  .object({
    iq_id: stringValue,
    it_id: stringValue,
    it_name: optionalString,
    it_seo_title: optionalString,
    ca_id: optionalString,
    it_price: numberValue.optional(),
    mb_id: stringValue,
    mb_nick: stringValue,
    iq_name: stringValue,
    iq_subject: stringValue,
    iq_question: stringValue,
    iq_answer: stringValue,
    iq_secret: numberValue.optional(),
    iq_email: optionalString,
    iq_hp: optionalString,
    is_answered: z.coerce.boolean().optional(),
    can_view: z.coerce.boolean().optional(),
    can_edit: z.coerce.boolean().optional(),
    can_delete: z.coerce.boolean().optional(),
    iq_time: stringValue,
    product_image_url: optionalImageUrlValue,
  })
  .passthrough() as unknown as z.ZodType<ShopQA>;

export const shopQaListSchema = z.array(shopQaSchema);
